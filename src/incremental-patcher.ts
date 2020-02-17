import {ObjectModel} from './object-model'
import {RawPatch} from './patch'
import {Patcher} from './internal-patcher'

// The incremental patcher allows you to apply multiple patches and tracks the history of every element.
// It also allows you to extract a simple diff between the documents.

type Origin = any

export type Value = {
  data?: unknown
  content?: Content
  origin: Origin
}

export type Type = 'array' | 'string' | 'object' | 'number' | 'boolean' | 'null'

export type Content = ObjectContent | ArrayContent | StringContent

export type ObjectContent = {
  type: 'object'
  fields: {[key: string]: Value}
}

export type ArrayContent = {
  type: 'array'
  elements: Value[]
}

export type StringContent = {
  type: 'string'
  parts: StringPart[]
}

export type StringPart = {
  value: string
  utf8size: number
  uses: StringContent[]
  origin: Origin
}

function utf8charSize(code: number): 1 | 2 | 3 | 4 {
  if (code >> 16) {
    return 4
  } else if (code >> 11) {
    return 3
  } else if (code >> 7) {
    return 2
  } else {
    return 1
  }
}

function utf8stringSize(str: string): number {
  let b = 0
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)!
    let size = utf8charSize(code)
    if (size == 4) i++
    b += size
  }
  return b
}

class Model implements ObjectModel<Value, StringContent, ObjectContent, ArrayContent> {
  private origin: Origin

  constructor(origin: Origin) {
    this.origin = origin
  }

  wrap(data: any): Value {
    return {data, origin: this.origin}
  }

  wrapWithOrigin(data: any, origin: Origin): Value {
    return {data, origin}
  }

  asObject(value: Value): ObjectContent {
    if (!value.content) {
      let fields: ObjectContent['fields'] = {}
      for (let [key, val] of Object.entries(value.data as any)) {
        fields[key] = this.wrapWithOrigin(val, value.origin)
      }
      value.content = {type: 'object', fields}
    }

    return value.content as ObjectContent
  }

  asArray(value: Value): ArrayContent {
    if (!value.content) {
      let elements = (value.data as unknown[]).map(item => this.wrapWithOrigin(item, value.origin))
      value.content = {type: 'array', elements}
    }

    return value.content as ArrayContent
  }

  asString(value: Value): StringContent {
    if (!value.content) {
      let str = value.data as string

      let part: StringPart = {
        value: str,
        utf8size: utf8stringSize(str),
        uses: [],
        origin: value.origin
      }
      value.content = this.stringFromParts([part])
    }

    return value.content as StringContent
  }

  stringFromParts(parts: StringPart[]): StringContent {
    let str: StringContent = {
      type: 'string',
      parts
    }

    for (let part of parts) {
      part.uses.push(str)
    }

    return str
  }

  objectGetKeys(value: Value): string[] {
    if (value.content) {
      return Object.keys((value.content as ObjectContent).fields)
    } else {
      return Object.keys(value.data as any)
    }
  }

  objectGetField(value: Value, key: string): Value {
    let obj = this.asObject(value)
    return obj.fields[key]
  }

  arrayGetElement(value: Value, idx: number): Value {
    let arr = this.asArray(value)
    return arr.elements[idx]
  }

  finalize(content: StringContent | ObjectContent | ArrayContent): Value {
    return {content, origin: this.origin}
  }

  copyString(value: Value | null): StringContent {
    if (value) {
      let other = this.asString(value)
      return this.stringFromParts(other.parts.slice())
    } else {
      return {
        type: 'string',
        parts: []
      }
    }
  }

  copyObject(value: Value | null): ObjectContent {
    let obj: ObjectContent = {
      type: 'object',
      fields: {}
    }

    if (value) {
      let other = this.asObject(value)
      Object.assign(obj.fields, other.fields)
    }

    return obj
  }

  copyArray(value: Value | null): ArrayContent {
    let elements = value ? this.asArray(value).elements : []

    return {
      type: 'array',
      elements
    }
  }

  objectSetField(target: ObjectContent, key: string, value: Value): void {
    target.fields[key] = value
  }

  objectDeleteField(target: ObjectContent, key: string): void {
    delete target.fields[key]
  }

  arrayAppendValue(target: ArrayContent, value: Value): void {
    target.elements.push(value)
  }

  arrayAppendSlice(target: ArrayContent, source: Value, left: number, right: number): void {
    let slice = this.asArray(source).elements.slice(left, right)
    target.elements.push(...slice)
  }

  stringAppendValue(target: StringContent, value: Value): void {
    let str = this.asString(value)
    for (let part of str.parts) {
      this.stringAppendPart(target, part)
    }
  }

  stringAppendPart(target: StringContent, part: StringPart): void {
    target.parts.push(part)
    part.uses.push(target)
  }

  resolveStringPart(str: StringContent, from: number, len: number): number {
    if (len === 0) return from

    for (let i = from; i < str.parts.length; i++) {
      let part = str.parts[i]

      if (len === part.utf8size) {
        // Matches perfect!
        return i + 1
      }

      if (len < part.utf8size) {
        // It's a part of this chunk. We now need to split it up.
        this.splitString(part, len)
        return i + 1
      }

      len -= part.utf8size
    }

    throw new Error('splitting string out of bounds')
  }

  splitString(part: StringPart, idx: number) {
    let leftValue
    let rightValue
    let leftSize = idx
    let rightSize = part.utf8size - leftSize

    // idx is here in UTF-8 index, not codepoint index.
    // This means we might to adjust for multi-byte characters.
    if (part.utf8size !== part.value.length) {
      let byteCount = 0

      for (idx = 0; byteCount < leftSize; idx++) {
        let code = part.value.codePointAt(idx)!
        let size = utf8charSize(code)
        if (size === 4) idx++ // Surrogate pair.
        byteCount += size
      }
    }

    leftValue = part.value.slice(0, idx)
    rightValue = part.value.slice(idx)

    let newPart: StringPart = {
      value: rightValue,
      utf8size: rightSize,
      uses: part.uses.slice(),
      origin: part.origin
    }

    part.value = leftValue
    part.utf8size = leftSize

    for (let use of part.uses) {
      // Insert the new part.
      let idx = use.parts.indexOf(part)
      if (idx === -1) throw new Error('bug: mismatch between string parts and use.')
      use.parts.splice(idx + 1, 0, newPart)
    }
  }

  stringAppendSlice(target: StringContent, source: Value, left: number, right: number): void {
    let str = this.asString(source)
    let firstPart = this.resolveStringPart(str, 0, left)
    let lastPart = this.resolveStringPart(str, firstPart, right - left)

    for (let i = firstPart; i < lastPart; i++) {
      let part = str.parts[i]
      this.stringAppendPart(target, part)
    }
  }
}

// Turns a native JavaScript object into a Value with a given origin.
export function wrap(data: any, origin: Origin): Value {
  return {data, origin}
}

// Converts a Value into a native JavaScript type.
export function unwrap(value: Value): any {
  if (typeof value.data !== 'undefined') return value.data

  let result: any
  let content = value.content!
  switch (content.type) {
    case 'string':
      result = content.parts.map(part => part.value).join('')
      break
    case 'array':
      result = content.elements.map(val => unwrap(val))
      break
    case 'object': {
      result = {}
      for (let [key, val] of Object.entries(content.fields)) {
        result[key] = unwrap(val)
      }
    }
  }

  value.data = result
  return result
}

// Returns the type of a Value.
export function getType(value: Value): Type {
  if (value.content) return value.content.type
  if (Array.isArray(value.data!)) return 'array'
  if (value.data === null) return 'null'

  return typeof value.data as Type
}

// Updates the `right` value such that it reuses as much as possible from the `left` value.
export function rebaseValue(left: Value, right: Value): Value {
  let leftType = getType(left)
  let rightType = getType(right)
  if (leftType !== rightType) return right

  let model = new Model(right.origin)

  switch (leftType) {
    case 'object': {
      let leftObj = model.asObject(left)
      let rightObj = model.asObject(right)

      for (let [key, rightVal] of Object.entries(rightObj.fields)) {
        let leftVal = leftObj.fields[key]
        if (leftVal) {
          rightObj.fields[key] = rebaseValue(leftVal, rightVal)
        }
      }

      break
    }
    case 'array': {
      let leftArr = model.asArray(left)
      let rightArr = model.asArray(right)

      if (leftArr.elements.length !== rightArr.elements.length) {
        break
      }

      for (let i = 0; i < rightArr.elements.length; i++) {
        rightArr.elements[i] = rebaseValue(leftArr.elements[i], rightArr.elements[i])
      }

      break
    }
    case 'null':
    case 'boolean':
    case 'number':
    case 'string': {
      if (unwrap(left) === unwrap(right)) return left
      break
    }
  }

  return right
}

export function applyPatch(left: Value, patch: RawPatch, origin: Origin) {
  let model = new Model(origin)
  let patcher = new Patcher(model, left, patch)
  return patcher.process()
}
