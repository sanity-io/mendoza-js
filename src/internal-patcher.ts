import type {ObjectModel} from './object-model'
import type {RawPatch} from './patch'

type InputEntry<V> = {
  value: V
  key?: string
  keys?: string[]
}

type OutputEntry<V, S, O, A> = {
  value: V | null
  writeValue?: S | O | A
}

// Everything except `process()` is private, since minifiers can shorten private names but have to
// keep public ones as-is.
export class Patcher<V, S, O, A> {
  #model: ObjectModel<V, S, O, A>
  #root: V
  #patch: RawPatch
  #i: number
  #inputStack: InputEntry<V>[]
  #outputStack: OutputEntry<V, S, O, A>[]

  constructor(model: ObjectModel<V, S, O, A>, root: V, patch: RawPatch) {
    this.#model = model
    this.#root = root
    this.#patch = patch
    this.#i = 0
    this.#inputStack = []
    this.#outputStack = []
  }

  #read(): unknown {
    return this.#patch[this.#i++]
  }

  process() {
    this.#inputStack.push({value: this.#root})
    this.#outputStack.push({value: this.#root})

    for (; this.#i < this.#patch.length;) {
      let opcode = this.#read()
      // A switch lets the engine dispatch on the opcode directly, instead of building a method
      // name and looking it up for every operation. The cases are the numbers from `Op` rather
      // than `Op.Value` and so on, because bundlers don't inline object properties: every case
      // would keep its property lookup, and the `Op` object would end up in every bundle.
      switch (opcode) {
        case 0: // Value
          this.#processValue()
          break
        case 1: // Copy
          this.#processCopy()
          break
        case 2: // Blank
          this.#processBlank()
          break
        case 3: // ReturnIntoArray
          this.#processReturnIntoArray()
          break
        case 4: // ReturnIntoObject
          this.#processReturnIntoObject()
          break
        case 5: // ReturnIntoObjectSameKey
          this.#processReturnIntoObjectSameKey()
          break
        case 6: // PushField
          this.#processPushField()
          break
        case 7: // PushElement
          this.#processPushElement()
          break
        case 8: // PushParent
          this.#processPushParent()
          break
        case 9: // Pop
          this.#processPop()
          break
        case 10: // PushFieldCopy
          this.#processPushField()
          this.#processCopy()
          break
        case 11: // PushFieldBlank
          this.#processPushField()
          this.#processBlank()
          break
        case 12: // PushElementCopy
          this.#processPushElement()
          this.#processCopy()
          break
        case 13: // PushElementBlank
          this.#processPushElement()
          this.#processBlank()
          break
        case 14: // ReturnIntoObjectPop
          this.#processReturnIntoObject()
          this.#processPop()
          break
        case 15: // ReturnIntoObjectSameKeyPop
          this.#processReturnIntoObjectSameKey()
          this.#processPop()
          break
        case 16: // ReturnIntoArrayPop
          this.#processReturnIntoArray()
          this.#processPop()
          break
        case 17: // ObjectSetFieldValue
          this.#processValue()
          this.#processReturnIntoObject()
          break
        case 18: // ObjectCopyField
          this.#processPushField()
          this.#processCopy()
          this.#processReturnIntoObjectSameKey()
          this.#processPop()
          break
        case 19: // ObjectDeleteField
          this.#processObjectDeleteField()
          break
        case 20: // ArrayAppendValue
          this.#processArrayAppendValue()
          break
        case 21: // ArrayAppendSlice
          this.#processArrayAppendSlice()
          break
        case 22: // StringAppendString
          this.#processStringAppendString()
          break
        case 23: // StringAppendSlice
          this.#processStringAppendSlice()
          break
        default:
          throw new Error(`Unknown opcode: ${opcode}`)
      }
    }

    let entry = this.#outputStack.pop()!
    return this.#finalizeOutput(entry)
  }

  #inputEntry(): InputEntry<V> {
    return this.#inputStack[this.#inputStack.length - 1]
  }

  #inputKey(entry: InputEntry<V>, idx: number): string {
    if (!entry.keys) {
      entry.keys = this.#model.objectGetKeys(entry.value).sort()
    }

    return entry.keys[idx]
  }

  #outputEntry(): OutputEntry<V, S, O, A> {
    return this.#outputStack[this.#outputStack.length - 1]
  }

  #outputArray(): A {
    let entry = this.#outputEntry()

    if (!entry.writeValue) {
      entry.writeValue = this.#model.copyArray(entry.value)
    }

    return entry.writeValue as A
  }

  #outputObject(): O {
    let entry = this.#outputEntry()

    if (!entry.writeValue) {
      entry.writeValue = this.#model.copyObject(entry.value)
    }

    return entry.writeValue as O
  }

  #outputString(): S {
    let entry = this.#outputEntry()

    if (!entry.writeValue) {
      entry.writeValue = this.#model.copyString(entry.value)
    }

    return entry.writeValue as S
  }

  #finalizeOutput(entry: OutputEntry<V, S, O, A>): V {
    if (entry.writeValue) {
      return this.#model.finalize(entry.writeValue)
    } else {
      return entry.value!
    }
  }

  // Processors. Opcodes that combine others (such as PushFieldCopy) call them from the switch.

  #processValue() {
    let value = this.#model.wrap(this.#read())
    this.#outputStack.push({value})
  }

  #processCopy() {
    let input = this.#inputEntry()
    this.#outputStack.push({value: input.value})
  }

  #processBlank() {
    this.#outputStack.push({value: null})
  }

  #processReturnIntoArray() {
    let entry = this.#outputStack.pop()!
    let result = this.#finalizeOutput(entry)
    let arr = this.#outputArray()
    this.#model.arrayAppendValue(arr, result)
  }

  #processReturnIntoObject() {
    let key = this.#read() as string
    let entry = this.#outputStack.pop()!
    let result = this.#finalizeOutput(entry)
    result = this.#model.markChanged(result)
    let obj = this.#outputObject()
    this.#model.objectSetField(obj, key, result)
  }

  #processReturnIntoObjectSameKey() {
    let input = this.#inputEntry()
    let entry = this.#outputStack.pop()!
    let result = this.#finalizeOutput(entry)
    let obj = this.#outputObject()
    this.#model.objectSetField(obj, input.key!, result)
  }

  #processPushField() {
    let idx = this.#read() as number
    let entry = this.#inputEntry()
    let key = this.#inputKey(entry, idx)
    let value = this.#model.objectGetField(entry.value, key)
    this.#inputStack.push({value, key})
  }

  #processPushElement() {
    let idx = this.#read() as number
    let entry = this.#inputEntry()
    let value = this.#model.arrayGetElement(entry.value, idx)
    this.#inputStack.push({value})
  }

  #processPushParent() {
    let n = this.#read() as number
    let idx = this.#inputStack.length - 2 - n
    if (idx < 0 || idx >= this.#inputStack.length) {
      throw new Error('PushParent: no such parent in the input stack')
    }
    this.#inputStack.push(this.#inputStack[idx])
  }

  #processPop() {
    this.#inputStack.pop()
  }

  #processObjectDeleteField() {
    let idx = this.#read() as number
    let entry = this.#inputEntry()
    let key = this.#inputKey(entry, idx)
    let obj = this.#outputObject()
    this.#model.objectDeleteField(obj, key)
  }

  #processArrayAppendValue() {
    let value = this.#model.wrap(this.#read())
    let arr = this.#outputArray()
    this.#model.arrayAppendValue(arr, value)
  }

  #processArrayAppendSlice() {
    let left = this.#read() as number
    let right = this.#read() as number
    let str = this.#outputArray()
    let val = this.#inputEntry().value
    this.#model.arrayAppendSlice(str, val, left, right)
  }

  #processStringAppendString() {
    let value = this.#model.wrap(this.#read())
    let str = this.#outputString()
    this.#model.stringAppendValue(str, value)
  }

  #processStringAppendSlice() {
    let left = this.#read() as number
    let right = this.#read() as number
    let str = this.#outputString()
    let val = this.#inputEntry().value
    this.#model.stringAppendSlice(str, val, left, right)
  }
}
