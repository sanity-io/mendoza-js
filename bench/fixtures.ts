import {Op, type RawPatch} from 'mendoza'

export interface Fixture<T> {
  doc: T
  patch: RawPatch
}

/**
 * Real documents come from `JSON.parse()`, which gives V8 objects with a different (and for
 * copying, much faster) internal layout than objects built up by assigning keys in a loop.
 */
function fromJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/**
 * An object with `width` keys under `items`, and a patch that changes a single nested field.
 * Exercises object copying and key sorting, which scale with the width of the object.
 */
export function wideObjectEdit(width: number): Fixture<{items: Record<string, unknown>}> {
  const items: Record<string, unknown> = {}
  for (let i = 0; i < width; i++) {
    items[`k${String(i).padStart(6, '0')}`] = {title: `t${i}`, n: i}
  }

  const patch: RawPatch = [
    Op.PushFieldCopy,
    0,
    Op.PushFieldCopy,
    width >> 1,
    Op.ObjectSetFieldValue,
    'new',
    'title',
    Op.ReturnIntoObjectSameKeyPop,
    Op.ReturnIntoObjectSameKeyPop,
  ]

  return {doc: fromJson({items}), patch}
}

/**
 * An array of `length` objects, and a patch that changes a field in every element.
 * Produces a long patch with many small operations, so it mostly measures opcode dispatch.
 */
export function editEveryElement(length: number): Fixture<{items: unknown[]}> {
  const items = Array.from({length}, (_, i) => ({_key: `k${i}`, title: `t${i}`, n: i}))
  const patch: RawPatch = [Op.PushFieldBlank, 0]
  for (let i = 0; i < length; i++) {
    patch.push(Op.PushElementCopy, i, Op.ObjectSetFieldValue, i + 1, 'n', Op.ReturnIntoArrayPop)
  }
  patch.push(Op.ReturnIntoObjectSameKeyPop)
  return {doc: fromJson({items}), patch}
}

export const STRING_SLICE_CASES = [
  {length: 10_000, slices: 10},
  {length: 100_000, slices: 10},
  {length: 100_000, slices: 100},
]

/**
 * An ASCII string of `length` characters, and a patch that rebuilds it from `slices` slices with
 * a character inserted between each.
 */
export function longStringSlices(length: number, slices: number): Fixture<string> {
  const step = Math.floor(length / slices)
  const patch: RawPatch = [Op.Blank]
  for (let i = 0; i < slices; i++) {
    patch.push(Op.StringAppendSlice, i * step, (i + 1) * step - 1, Op.StringAppendString, 'x')
  }
  return {doc: 'a'.repeat(length), patch}
}

/**
 * An array of `length` numbers, and a patch that copies all of it with a single slice and appends
 * one value.
 */
export function largeArraySlice(length: number): Fixture<number[]> {
  const doc = Array.from({length}, (_, i) => i)
  return {doc, patch: [Op.Blank, Op.ArrayAppendSlice, 0, length, Op.ArrayAppendValue, -1]}
}

/**
 * A sequence of `count` patches that each insert a single character into the `body` field,
 * simulating someone typing. Each patch applies to the result of the previous one.
 */
export function typingSession(count: number): {doc: {body: string}; patches: RawPatch[]} {
  const body = 'hello world'.repeat(50)
  const patches: RawPatch[] = []
  let length = body.length
  for (let i = 1; i <= count; i++) {
    const pos = (i * 7919) % length
    patches.push([
      Op.PushFieldBlank,
      0,
      Op.StringAppendSlice,
      0,
      pos,
      Op.StringAppendString,
      'x',
      Op.StringAppendSlice,
      pos,
      length,
      Op.ReturnIntoObjectSameKeyPop,
    ])
    length++
  }
  return {doc: fromJson({body}), patches}
}
