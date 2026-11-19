import {Patcher} from './internal-patcher'
import type {ObjectModel} from './object-model'
import type {RawPatch} from './patch'
import {utf8resolveIndex} from './utf8'
import {pushSlice} from './array'

type StringBuilder = {type: 'string'; data: string}
type ObjectBuilder = {type: 'object'; data: {[key: string]: unknown}}
type ArrayBuilder = unknown[]

type StringCursor = {source: string; byte: number; ucs: number}

class SimpleModel implements ObjectModel<unknown, StringBuilder, ObjectBuilder, ArrayBuilder> {
  // Slices of a source string are usually appended in ascending order. Remembering where the
  // previous slice ended means we don't rescan the string from the start for every slice, which
  // would make long strings with many slices quadratic.
  stringCursor: StringCursor | null = null

  wrap(data: any): unknown {
    return data
  }

  finalize(b: StringBuilder | ObjectBuilder | ArrayBuilder): unknown {
    if (Array.isArray(b)) {
      return b
    } else {
      return b.data
    }
  }

  markChanged(value: unknown) {
    return value
  }

  objectGetKeys(value: unknown): string[] {
    return Object.keys(value as any)
  }

  objectGetField(value: unknown, key: string): unknown {
    return (value as any)[key]
  }

  arrayGetElement(value: unknown, idx: number): unknown {
    return (value as any[])[idx]
  }

  copyObject(value: unknown | null): ObjectBuilder {
    let res: ObjectBuilder = {
      type: 'object',
      data: {},
    }
    if (value !== null) {
      for (let [key, val] of Object.entries(value as ObjectBuilder)) {
        res.data[key] = val
      }
    }
    return res
  }

  copyArray(value: unknown | null): ArrayBuilder {
    if (value === null) return []
    return (value as ArrayBuilder).slice()
  }

  copyString(value: unknown | null): StringBuilder {
    return {
      type: 'string',
      data: value === null ? '' : (value as string),
    }
  }

  objectSetField(target: ObjectBuilder, key: string, value: unknown): void {
    target.data[key] = value
  }

  objectDeleteField(target: ObjectBuilder, key: string): void {
    delete target.data[key]
  }

  arrayAppendValue(target: ArrayBuilder, value: unknown): void {
    target.push(value)
  }

  arrayAppendSlice(target: ArrayBuilder, source: unknown, left: number, right: number): void {
    pushSlice(target, source as ArrayBuilder, left, right)
  }

  stringAppendSlice(target: StringBuilder, source: unknown, left: number, right: number): void {
    const sourceString = source as string

    const leftPos = this.resolveStringIndex(sourceString, left)
    const rightPos = this.resolveStringIndex(sourceString, right)

    target.data += sourceString.slice(leftPos, rightPos)
  }

  resolveStringIndex(source: string, byteIdx: number): number {
    let cursor = this.stringCursor
    if (!cursor || cursor.source !== source || cursor.byte > byteIdx) {
      cursor = {source, byte: 0, ucs: 0}
    }

    const ucs = utf8resolveIndex(source, byteIdx, cursor.byte, cursor.ucs)
    this.stringCursor = {source, byte: byteIdx, ucs}
    return ucs
  }

  stringAppendValue(target: StringBuilder, value: unknown): void {
    target.data += value as string
  }
}

// Applies a patch on a JavaScript object.
export function applyPatch(left: any, patch: RawPatch): any {
  let root = left // No need to wrap because the representation is the same.
  let patcher = new Patcher(new SimpleModel(), root, patch)
  return patcher.process()
}
