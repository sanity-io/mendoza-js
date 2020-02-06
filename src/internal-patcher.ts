import {ObjectModel} from './object-model'
import {RawPatch} from './patch'

type InputEntry<V> = {
  value: V
  keys?: string[]
}

type OutputEntry<V, S, O, A> = {
  value: V | null
  writeValue?: S | O | A
  key?: string
}

export class Patcher<V, S, O, A> {
  private model: ObjectModel<V, S, O, A>
  private root: V
  private inputStack: InputEntry<V>[] = []
  private outputStack: OutputEntry<V, S, O, A>[] = []

  constructor(model: ObjectModel<V, S, O, A>, root: V) {
    this.model = model
    this.root = root
  }

  inputEntry(): InputEntry<V> {
    return this.inputStack[this.inputStack.length - 1]
  }

  inputKey(entry: InputEntry<V>, idx: number): string {
    if (!entry.keys) {
      entry.keys = this.model.objectGetKeys(entry.value).sort()
    }

    return entry.keys[idx]
  }

  pushCopy(value: V, key?: string) {
    this.inputStack.push({value})
    this.outputStack.push({value, key})
  }

  pushBlank(value: V, key?: string) {
    this.inputStack.push({value})
    this.outputStack.push({value: null, key})
  }

  pushValue(value: V) {
    this.outputStack.push({value})
  }

  outputEntry(): OutputEntry<V, S, O, A> {
    return this.outputStack[this.outputStack.length - 1]
  }

  outputArray(): A {
    let entry = this.outputEntry()

    if (!entry.writeValue) {
      entry.writeValue = this.model.copyArray(entry.value)
    }

    return entry.writeValue as A
  }

  outputObject(): O {
    let entry = this.outputEntry()

    if (!entry.writeValue) {
      entry.writeValue = this.model.copyObject(entry.value)
    }

    return entry.writeValue as O
  }

  outputString(): S {
    let entry = this.outputEntry()

    if (!entry.writeValue) {
      entry.writeValue = this.model.copyString(entry.value)
    }

    return entry.writeValue as S
  }

  finalizeOutput(entry: OutputEntry<V, S, O, A>): V {
    if (entry.writeValue) {
      return this.model.finalize(entry.writeValue)
    } else {
      return entry.value!
    }
  }

  process(patch: RawPatch): V {
    for (let i = 0; i < patch.length; ) {
      let op = patch[i++]
      switch (op) {
        case 0: {
          // EnterValue
          let value = this.model.wrap(patch[i++])
          this.pushValue(value)
          break
        }
        case 2: {
          // EnterRootCopy
          this.pushCopy(this.root)
          break
        }
        case 5: {
          // EnterFieldCopy
          let idx = patch[i++]
          let entry = this.inputEntry()
          let key = this.inputKey(entry, idx)
          let value = this.model.objectGetField(entry.value, key)
          this.pushCopy(value, key)
          break
        }
        case 6: {
          // EnterFieldBlank
          let idx = patch[i++]
          let entry = this.inputEntry()
          let key = this.inputKey(entry, idx)
          let value = this.model.objectGetField(entry.value, key)
          this.pushBlank(value, key)
          break
        }
        case 8: {
          // EnterElementCopy
          let idx = patch[i++]
          let entry = this.inputEntry()
          let value = this.model.arrayGetElement(entry.value, idx)
          this.pushCopy(value)
          break
        }
        case 9: {
          // EnterElementCopy
          let idx = patch[i++]
          let entry = this.inputEntry()
          let value = this.model.arrayGetElement(entry.value, idx)
          this.pushBlank(value)
          break
        }
        case 10: {
          // ReturnIntoArray
          this.inputStack.pop()
          let entry = this.outputStack.pop()!
          let result = this.finalizeOutput(entry)
          let arr = this.outputArray()
          this.model.arrayAppendValue(arr, result)
          break
        }
        case 11: {
          // ReturnIntoObject
          let key = patch[i++]
          this.inputStack.pop()
          let entry = this.outputStack.pop()!
          let result = this.finalizeOutput(entry)
          let obj = this.outputObject()
          this.model.objectSetField(obj, key, result)
          break
        }
        case 12: {
          // ReturnIntoObjectKeyless
          this.inputStack.pop()
          let entry = this.outputStack.pop()!
          let result = this.finalizeOutput(entry)
          let obj = this.outputObject()
          this.model.objectSetField(obj, entry.key!, result)
          break
        }
        case 13: {
          // ObjectSetFieldValue
          let key = patch[i++]
          let value = this.model.wrap(patch[i++])
          let obj = this.outputObject()
          this.model.objectSetField(obj, key, value)
          break
        }
        case 14: {
          // ObjectCopyField
          let idx = patch[i++]
          let entry = this.inputEntry()
          let key = this.inputKey(entry, idx)
          let obj = this.outputObject()
          let value = this.model.objectGetField(entry.value, key)
          this.model.objectSetField(obj, key, value)
          break
        }
        case 15: {
          // ObjectDeleteField
          let idx = patch[i++]
          let entry = this.inputEntry()
          let key = this.inputKey(entry, idx)
          let obj = this.outputObject()
          this.model.objectDeleteField(obj, key)
          break
        }
        case 16: {
          // ArrayAppendValue
          let value = this.model.wrap(patch[i++])
          let arr = this.outputArray()
          this.model.arrayAppendValue(arr, value)
          break
        }
        case 17: {
          // ArrayAppendSlice
          let left = patch[i++]
          let right = patch[i++]
          let str = this.outputArray()
          let val = this.inputEntry().value
          this.model.arrayAppendSlice(str, val, left, right)
          break
        }
        case 18: {
          // StringAppendString
          let value = this.model.wrap(patch[i++])
          let str = this.outputString()
          this.model.stringAppendValue(str, value)
          break
        }
        case 19: {
          // StringAppendSlice
          let left = patch[i++]
          let right = patch[i++]
          let str = this.outputString()
          let val = this.inputEntry().value
          this.model.stringAppendSlice(str, val, left, right)
          break
        }
        default:
          throw new Error('unknown op ' + op)
      }
    }

    let entry = this.outputStack.pop()!
    return this.finalizeOutput(entry)
  }
}
