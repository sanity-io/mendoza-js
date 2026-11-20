import type {ObjectModel} from './object-model'
import {Op} from './ops'
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

export class Patcher<V, S, O, A> {
  model: ObjectModel<V, S, O, A>
  root: V
  patch: RawPatch
  i: number
  inputStack: InputEntry<V>[]
  outputStack: OutputEntry<V, S, O, A>[]

  constructor(model: ObjectModel<V, S, O, A>, root: V, patch: RawPatch) {
    this.model = model
    this.root = root
    this.patch = patch
    this.i = 0
    this.inputStack = []
    this.outputStack = []
  }

  read(): unknown {
    return this.patch[this.i++]
  }

  process() {
    this.inputStack.push({value: this.root})
    this.outputStack.push({value: this.root})

    for (; this.i < this.patch.length;) {
      let opcode = this.read()
      // A switch lets the engine dispatch on the opcode directly, instead of building a method
      // name and looking it up for every operation.
      switch (opcode) {
        case Op.Value:
          this.processValue()
          break
        case Op.Copy:
          this.processCopy()
          break
        case Op.Blank:
          this.processBlank()
          break
        case Op.ReturnIntoArray:
          this.processReturnIntoArray()
          break
        case Op.ReturnIntoObject:
          this.processReturnIntoObject()
          break
        case Op.ReturnIntoObjectSameKey:
          this.processReturnIntoObjectSameKey()
          break
        case Op.PushField:
          this.processPushField()
          break
        case Op.PushElement:
          this.processPushElement()
          break
        case Op.PushParent:
          this.processPushParent()
          break
        case Op.Pop:
          this.processPop()
          break
        case Op.PushFieldCopy:
          this.processPushFieldCopy()
          break
        case Op.PushFieldBlank:
          this.processPushFieldBlank()
          break
        case Op.PushElementCopy:
          this.processPushElementCopy()
          break
        case Op.PushElementBlank:
          this.processPushElementBlank()
          break
        case Op.ReturnIntoObjectPop:
          this.processReturnIntoObjectPop()
          break
        case Op.ReturnIntoObjectSameKeyPop:
          this.processReturnIntoObjectSameKeyPop()
          break
        case Op.ReturnIntoArrayPop:
          this.processReturnIntoArrayPop()
          break
        case Op.ObjectSetFieldValue:
          this.processObjectSetFieldValue()
          break
        case Op.ObjectCopyField:
          this.processObjectCopyField()
          break
        case Op.ObjectDeleteField:
          this.processObjectDeleteField()
          break
        case Op.ArrayAppendValue:
          this.processArrayAppendValue()
          break
        case Op.ArrayAppendSlice:
          this.processArrayAppendSlice()
          break
        case Op.StringAppendString:
          this.processStringAppendString()
          break
        case Op.StringAppendSlice:
          this.processStringAppendSlice()
          break
        default:
          throw new Error(`Unknown opcode: ${opcode}`)
      }
    }

    let entry = this.outputStack.pop()!
    return this.finalizeOutput(entry)
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

  // Processors:

  processValue() {
    let value = this.model.wrap(this.read())
    this.outputStack.push({value})
  }

  processCopy() {
    let input = this.inputEntry()
    this.outputStack.push({value: input.value})
  }

  processBlank() {
    this.outputStack.push({value: null})
  }

  processReturnIntoArray() {
    let entry = this.outputStack.pop()!
    let result = this.finalizeOutput(entry)
    let arr = this.outputArray()
    this.model.arrayAppendValue(arr, result)
  }

  processReturnIntoObject() {
    let key = this.read() as string
    let entry = this.outputStack.pop()!
    let result = this.finalizeOutput(entry)
    result = this.model.markChanged(result)
    let obj = this.outputObject()
    this.model.objectSetField(obj, key, result)
  }

  processReturnIntoObjectSameKey() {
    let input = this.inputEntry()
    let entry = this.outputStack.pop()!
    let result = this.finalizeOutput(entry)
    let obj = this.outputObject()
    this.model.objectSetField(obj, input.key!, result)
  }

  processPushField() {
    let idx = this.read() as number
    let entry = this.inputEntry()
    let key = this.inputKey(entry, idx)
    let value = this.model.objectGetField(entry.value, key)
    this.inputStack.push({value, key})
  }

  processPushElement() {
    let idx = this.read() as number
    let entry = this.inputEntry()
    let value = this.model.arrayGetElement(entry.value, idx)
    this.inputStack.push({value})
  }

  processPushParent() {
    let n = this.read() as number
    let idx = this.inputStack.length - 2 - n
    if (idx < 0 || idx >= this.inputStack.length) {
      throw new Error('PushParent: no such parent in the input stack')
    }
    this.inputStack.push(this.inputStack[idx])
  }

  processPop() {
    this.inputStack.pop()
  }

  processPushFieldCopy() {
    this.processPushField()
    this.processCopy()
  }

  processPushFieldBlank() {
    this.processPushField()
    this.processBlank()
  }

  processPushElementCopy() {
    this.processPushElement()
    this.processCopy()
  }

  processPushElementBlank() {
    this.processPushElement()
    this.processBlank()
  }

  processReturnIntoObjectPop() {
    this.processReturnIntoObject()
    this.processPop()
  }

  processReturnIntoObjectSameKeyPop() {
    this.processReturnIntoObjectSameKey()
    this.processPop()
  }

  processReturnIntoArrayPop() {
    this.processReturnIntoArray()
    this.processPop()
  }

  processObjectSetFieldValue() {
    this.processValue()
    this.processReturnIntoObject()
  }

  processObjectCopyField() {
    this.processPushField()
    this.processCopy()
    this.processReturnIntoObjectSameKey()
    this.processPop()
  }

  processObjectDeleteField() {
    let idx = this.read() as number
    let entry = this.inputEntry()
    let key = this.inputKey(entry, idx)
    let obj = this.outputObject()
    this.model.objectDeleteField(obj, key)
  }

  processArrayAppendValue() {
    let value = this.model.wrap(this.read())
    let arr = this.outputArray()
    this.model.arrayAppendValue(arr, value)
  }

  processArrayAppendSlice() {
    let left = this.read() as number
    let right = this.read() as number
    let str = this.outputArray()
    let val = this.inputEntry().value
    this.model.arrayAppendSlice(str, val, left, right)
  }

  processStringAppendString() {
    let value = this.model.wrap(this.read())
    let str = this.outputString()
    this.model.stringAppendValue(str, value)
  }

  processStringAppendSlice() {
    let left = this.read() as number
    let right = this.read() as number
    let str = this.outputString()
    let val = this.inputEntry().value
    this.model.stringAppendSlice(str, val, left, right)
  }
}
