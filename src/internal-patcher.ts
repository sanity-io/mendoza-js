import {ObjectModel} from './object-model'
import {RawPatch} from './patch'

type InputEntry<V> = {
  value: V
  key?: string
  keys?: string[]
}

type OutputEntry<V, S, O, A> = {
  value: V | null
  writeValue?: S | O | A
}

export function applyPatchToModel<V, S, O, A>(
  model: ObjectModel<V, S, O, A>,
  root: V,
  patch: RawPatch
) {
  const processors = [
    processValue,
    processCopy,
    processBlank,
    processReturnIntoArray,
    processReturnIntoObject,
    processReturnIntoObjectSameKey,
    processPushField,
    processPushElement,
    processPushParent,
    processPop,
    processPushFieldCopy,
    processPushFieldBlank,
    processPushElementCopy,
    processPushElementBlank,
    processReturnIntoObjectPop,
    processReturnIntoObjectSameKeyPop,
    processReturnIntoArrayPop,
    processObjectSetFieldValue,
    processObjectCopyField,
    processObjectDeleteField,
    processArrayAppendValue,
    processArrayAppendSlice,
    processStringAppendString,
    processStringAppendSlice
  ]

  const inputStack: InputEntry<V>[] = []
  const outputStack: OutputEntry<V, S, O, A>[] = []
  let i = 0

  return process()

  function read(): unknown {
    return patch[i++]
  }

  function process() {
    inputStack.push({value: root})
    outputStack.push({value: root})

    for (; i < patch.length; ) {
      const opcode = read() as number
      const processor = processors[opcode]
      if (!processor) throw new Error(`Unknown opcode: ${opcode}`)
      processor()
    }

    let entry = outputStack.pop()!
    return finalizeOutput(entry)
  }

  function inputEntry(): InputEntry<V> {
    return inputStack[inputStack.length - 1]
  }

  function inputKey(entry: InputEntry<V>, idx: number): string {
    if (!entry.keys) {
      entry.keys = model.objectGetKeys(entry.value).sort()
    }

    return entry.keys[idx]
  }

  function outputEntry(): OutputEntry<V, S, O, A> {
    return outputStack[outputStack.length - 1]
  }

  function outputArray(): A {
    let entry = outputEntry()

    if (!entry.writeValue) {
      entry.writeValue = model.copyArray(entry.value)
    }

    return entry.writeValue as A
  }

  function outputObject(): O {
    let entry = outputEntry()

    if (!entry.writeValue) {
      entry.writeValue = model.copyObject(entry.value)
    }

    return entry.writeValue as O
  }

  function outputString(): S {
    let entry = outputEntry()

    if (!entry.writeValue) {
      entry.writeValue = model.copyString(entry.value)
    }

    return entry.writeValue as S
  }

  function finalizeOutput(entry: OutputEntry<V, S, O, A>): V {
    if (entry.writeValue) {
      return model.finalize(entry.writeValue)
    } else {
      return entry.value!
    }
  }

  // Processors:

  function processValue() {
    let value = model.wrap(read())
    outputStack.push({value})
  }

  function processCopy() {
    let input = inputEntry()
    outputStack.push({value: input.value})
  }

  function processBlank() {
    outputStack.push({value: null})
  }

  function processReturnIntoArray() {
    let entry = outputStack.pop()!
    let result = finalizeOutput(entry)
    let arr = outputArray()
    model.arrayAppendValue(arr, result)
  }

  function processReturnIntoObject() {
    let key = read() as string
    let entry = outputStack.pop()!
    let result = finalizeOutput(entry)
    result = model.markChanged(result)
    let obj = outputObject()
    model.objectSetField(obj, key, result)
  }

  function processReturnIntoObjectSameKey() {
    let input = inputEntry()
    let entry = outputStack.pop()!
    let result = finalizeOutput(entry)
    let obj = outputObject()
    model.objectSetField(obj, input.key!, result)
  }

  function processPushField() {
    let idx = read() as number
    let entry = inputEntry()
    let key = inputKey(entry, idx)
    let value = model.objectGetField(entry.value, key)
    inputStack.push({value, key})
  }

  function processPushParent() {
    throw new Error('`processPushParent` is not implemented')
  }

  function processPushElement() {
    let idx = read() as number
    let entry = inputEntry()
    let value = model.arrayGetElement(entry.value, idx)
    inputStack.push({value})
  }

  function processPop() {
    inputStack.pop()
  }

  function processPushFieldCopy() {
    processPushField()
    processCopy()
  }

  function processPushFieldBlank() {
    processPushField()
    processBlank()
  }

  function processPushElementCopy() {
    processPushElement()
    processCopy()
  }

  function processPushElementBlank() {
    processPushElement()
    processBlank()
  }

  function processReturnIntoObjectPop() {
    processReturnIntoObject()
    processPop()
  }

  function processReturnIntoObjectSameKeyPop() {
    processReturnIntoObjectSameKey()
    processPop()
  }

  function processReturnIntoArrayPop() {
    processReturnIntoArray()
    processPop()
  }

  function processObjectSetFieldValue() {
    processValue()
    processReturnIntoObject()
  }

  function processObjectCopyField() {
    processPushField()
    processCopy()
    processReturnIntoObjectSameKey()
    processPop()
  }

  function processObjectDeleteField() {
    let idx = read() as number
    let entry = inputEntry()
    let key = inputKey(entry, idx)
    let obj = outputObject()
    model.objectDeleteField(obj, key)
  }

  function processArrayAppendValue() {
    let value = model.wrap(read())
    let arr = outputArray()
    model.arrayAppendValue(arr, value)
  }

  function processArrayAppendSlice() {
    let left = read() as number
    let right = read() as number
    let str = outputArray()
    let val = inputEntry().value
    model.arrayAppendSlice(str, val, left, right)
  }

  function processStringAppendString() {
    let value = model.wrap(read())
    let str = outputString()
    model.stringAppendValue(str, value)
  }

  function processStringAppendSlice() {
    let left = read() as number
    let right = read() as number
    let str = outputString()
    let val = inputEntry().value
    model.stringAppendSlice(str, val, left, right)
  }
}
