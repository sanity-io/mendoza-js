import {describe, expect, test} from 'vitest'
import {applyPatch} from '../src/index'
import {Op} from '../src/index'

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

describe('applyPatch', () => {
  describe('general', () => {
    test('empty patch returns the input unchanged', () => {
      const doc = {a: 1}
      expect(applyPatch(doc, [])).toBe(doc)
    })

    test('unknown opcode throws', () => {
      expect(() => applyPatch({}, [99])).toThrow('Unknown opcode: 99')
    })

    test('does not mutate the input document', () => {
      const doc = deepFreeze({a: 'hello', b: [1, 2, 3], c: {d: true}})
      const snapshot = JSON.parse(JSON.stringify(doc))
      const result = applyPatch(doc, [
        Op.ObjectDeleteField,
        0,
        Op.ObjectSetFieldValue,
        1,
        'x',
        Op.PushFieldBlank,
        0,
        Op.ArrayAppendSlice,
        0,
        1,
        Op.ArrayAppendValue,
        'new',
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(doc).toEqual(snapshot)
      expect(result).not.toBe(doc)
    })

    test('unchanged subtrees keep their identity', () => {
      const doc = {a: {deep: [1, 2]}, b: 1}
      const result = applyPatch(doc, [Op.ObjectSetFieldValue, 2, 'b'])
      expect(result).toEqual({a: {deep: [1, 2]}, b: 2})
      expect(result.a).toBe(doc.a)
    })
  })

  describe('Value / Blank / Copy', () => {
    test('Value replaces the root', () => {
      expect(applyPatch({a: 1}, [Op.Value, {b: [1, 2]}])).toEqual({b: [1, 2]})
    })

    test('Value can produce primitives and null', () => {
      expect(applyPatch({a: 1}, [Op.Value, 42])).toBe(42)
      expect(applyPatch({a: 1}, [Op.Value, null])).toBe(null)
      expect(applyPatch({a: 1}, [Op.Value, false])).toBe(false)
      expect(applyPatch({a: 1}, [Op.Value, 'str'])).toBe('str')
    })

    test('Blank starts from an empty object', () => {
      expect(applyPatch({a: 1, b: 2}, [Op.Blank, Op.ObjectSetFieldValue, 3, 'c'])).toEqual({c: 3})
    })

    test('Blank followed by nothing yields null', () => {
      expect(applyPatch({a: 1}, [Op.Blank])).toBe(null)
    })

    test('Blank starts from an empty array', () => {
      expect(applyPatch({a: 1}, [Op.Blank, Op.ArrayAppendValue, 'x'])).toEqual(['x'])
    })

    test('Blank starts from an empty string', () => {
      expect(applyPatch('abc', [Op.Blank, Op.StringAppendString, 'xyz'])).toBe('xyz')
    })

    test('Copy pushes the current input onto the output', () => {
      const doc = {a: {b: 1}}
      // Enter "a", blank the output, then overwrite it with a copy of the input
      const result = applyPatch(doc, [Op.PushFieldBlank, 0, Op.Pop])
      expect(result).toBe(null)

      const copied = applyPatch(doc, [Op.PushField, 0, Op.Copy, Op.ReturnIntoObjectSameKeyPop])
      expect(copied).toEqual(doc)
      expect(copied.a).toBe(doc.a)
    })
  })

  describe('objects', () => {
    test('ObjectSetFieldValue adds a field', () => {
      expect(applyPatch({a: 1}, [Op.ObjectSetFieldValue, 2, 'b'])).toEqual({a: 1, b: 2})
    })

    test('ObjectSetFieldValue overwrites a field', () => {
      expect(applyPatch({a: 1}, [Op.ObjectSetFieldValue, {x: 1}, 'a'])).toEqual({a: {x: 1}})
    })

    test('ObjectDeleteField removes a field by sorted index', () => {
      const doc = {c: 3, a: 1, b: 2}
      // Keys are sorted: a=0, b=1, c=2
      expect(applyPatch(doc, [Op.ObjectDeleteField, 0])).toEqual({b: 2, c: 3})
      expect(applyPatch(doc, [Op.ObjectDeleteField, 1])).toEqual({a: 1, c: 3})
      expect(applyPatch(doc, [Op.ObjectDeleteField, 2])).toEqual({a: 1, b: 2})
    })

    test('multiple deletions refer to the original key indices', () => {
      const doc = {a: 1, b: 2, c: 3}
      expect(applyPatch(doc, [Op.ObjectDeleteField, 0, Op.ObjectDeleteField, 2])).toEqual({b: 2})
    })

    test('ObjectCopyField copies fields into a blank object', () => {
      const doc = {name: 'Michael', age: 20, extra: true}
      // Sorted keys: age=0, extra=1, name=2
      expect(
        applyPatch(doc, [Op.Blank, Op.ObjectCopyField, 2, Op.ObjectSetFieldValue, 30, 'age']),
      ).toEqual({name: 'Michael', age: 30})
    })

    test('PushFieldCopy + ReturnIntoObjectPop renames a field', () => {
      // Example from the format documentation
      const doc = {name: 'Michael Bluth', age: 20}
      const result = applyPatch(doc, [
        Op.ObjectDeleteField,
        1, // name (sorted: age=0, name=1)
        Op.ObjectSetFieldValue,
        30,
        'age',
        Op.PushFieldCopy,
        1,
        Op.ReturnIntoObjectPop,
        'fullName',
      ])
      expect(result).toEqual({age: 30, fullName: 'Michael Bluth'})
    })

    test('PushField + Copy + ReturnIntoObject (unfused primitives)', () => {
      const doc = {a: 1, b: 2}
      const result = applyPatch(doc, [Op.PushField, 1, Op.Copy, Op.ReturnIntoObject, 'c', Op.Pop])
      expect(result).toEqual({a: 1, b: 2, c: 2})
    })

    test('Value + ReturnIntoObject (unfused ObjectSetFieldValue)', () => {
      expect(applyPatch({a: 1}, [Op.Value, 'v', Op.ReturnIntoObject, 'b'])).toEqual({
        a: 1,
        b: 'v',
      })
    })

    test('nested edit with ReturnIntoObjectSameKeyPop', () => {
      const doc = {user: {address: {zip: 1111, city: 'Oslo'}}}
      const result = applyPatch(doc, [
        Op.PushFieldCopy,
        0, // user
        Op.PushFieldCopy,
        0, // address
        Op.ObjectSetFieldValue,
        1234,
        'zip',
        Op.ReturnIntoObjectSameKeyPop,
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(result).toEqual({user: {address: {zip: 1234, city: 'Oslo'}}})
      expect(doc.user.address.zip).toBe(1111)
    })

    test('PushParent re-enters an ancestor of the current input', () => {
      const doc = {a: {x: 1}, b: 2}
      const result = applyPatch(doc, [
        Op.PushFieldBlank,
        0, // a
        Op.PushParent,
        0, // back to the root
        Op.ObjectCopyField,
        1, // copy "b" from the root into the new "a"
        Op.Pop,
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(result).toEqual({a: {b: 2}, b: 2})
    })

    test('PushParent can reach grandparents', () => {
      const doc = {a: {c: {x: 1}}, b: 2}
      const result = applyPatch(doc, [
        Op.PushFieldBlank,
        0, // a
        Op.PushField,
        0, // a.c
        Op.PushParent,
        1, // root
        Op.ObjectCopyField,
        1, // copy "b"
        Op.Pop,
        Op.Pop,
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(result).toEqual({a: {b: 2}, b: 2})
    })

    test('PushParent without a matching ancestor throws', () => {
      expect(() => applyPatch({a: 1}, [Op.PushParent, 0])).toThrow('PushParent')
      expect(() => applyPatch({a: {b: 1}}, [Op.PushField, 0, Op.PushParent, 1])).toThrow(
        'PushParent',
      )
    })

    test('ReturnIntoObjectSameKey + Pop (unfused)', () => {
      const result = applyPatch({a: {x: 1}}, [
        Op.PushField,
        0,
        Op.Copy,
        Op.ObjectSetFieldValue,
        2,
        'y',
        Op.ReturnIntoObjectSameKey,
        Op.Pop,
      ])
      expect(result).toEqual({a: {x: 1, y: 2}})
    })

    test('PushFieldBlank replaces a field with a fresh value', () => {
      const doc = {a: {x: 1, y: 2}, b: 1}
      const result = applyPatch(doc, [
        Op.PushFieldBlank,
        0,
        Op.ObjectSetFieldValue,
        3,
        'z',
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(result).toEqual({a: {z: 3}, b: 1})
    })

    test('handles unicode and special keys', () => {
      const doc = {'ключ': 1, 'with space': 2, '': 3}
      const result = applyPatch(doc, [Op.ObjectSetFieldValue, 4, '🔑'])
      expect(result).toEqual({'ключ': 1, 'with space': 2, '': 3, '🔑': 4})
    })

    test('keys are sorted by default UTF-16 order', () => {
      const doc = {b: 1, B: 2, a: 3, _: 4}
      // Sorted: B, _, a, b
      expect(applyPatch(doc, [Op.ObjectDeleteField, 0])).toEqual({b: 1, a: 3, _: 4})
      expect(applyPatch(doc, [Op.ObjectDeleteField, 3])).toEqual({B: 2, a: 3, _: 4})
    })
  })

  describe('arrays', () => {
    test('ArrayAppendValue appends to a blank array', () => {
      expect(
        applyPatch({}, [Op.Blank, Op.ArrayAppendValue, 1, Op.ArrayAppendValue, {a: 1}]),
      ).toEqual([1, {a: 1}])
    })

    test('ArrayAppendValue appends to a copy of the existing array', () => {
      const doc = [1, 2]
      expect(applyPatch(doc, [Op.ArrayAppendValue, 3])).toEqual([1, 2, 3])
      expect(doc).toEqual([1, 2])
    })

    test('ArrayAppendSlice copies a range of the input', () => {
      const doc = {skills: ['JS', 'TS', 'Rust', 'Zig']}
      const result = applyPatch(doc, [
        Op.PushFieldBlank,
        0,
        Op.ArrayAppendSlice,
        0,
        2,
        Op.ArrayAppendValue,
        'Go',
        Op.ArrayAppendSlice,
        3,
        4,
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(result).toEqual({skills: ['JS', 'TS', 'Go', 'Zig']})
    })

    test('ArrayAppendSlice with an empty range appends nothing', () => {
      expect(applyPatch([1, 2, 3], [Op.Blank, Op.ArrayAppendSlice, 1, 1])).toEqual([])
    })

    test('ArrayAppendSlice can reorder and duplicate', () => {
      expect(
        applyPatch(
          ['a', 'b', 'c'],
          [
            Op.Blank,
            Op.ArrayAppendSlice,
            2,
            3,
            Op.ArrayAppendSlice,
            0,
            2,
            Op.ArrayAppendSlice,
            0,
            1,
          ],
        ),
      ).toEqual(['c', 'a', 'b', 'a'])
    })

    test('PushElementCopy + ReturnIntoArrayPop copies an element into a blank array', () => {
      const result = applyPatch(
        ['a', 'b', 'c'],
        [
          Op.Blank,
          Op.PushElementCopy,
          2,
          Op.ReturnIntoArrayPop,
          Op.PushElementCopy,
          0,
          Op.ReturnIntoArrayPop,
        ],
      )
      expect(result).toEqual(['c', 'a'])
    })

    test('PushElement + Copy + ReturnIntoArray + Pop (unfused)', () => {
      const result = applyPatch(
        ['a', 'b'],
        [Op.Blank, Op.PushElement, 1, Op.Copy, Op.ReturnIntoArray, Op.Pop],
      )
      // The Blank output entry stays below; the top (array) is the result
      expect(result).toEqual(['b'])
    })

    test('editing an element in place', () => {
      const doc = {
        items: [
          {id: 1, v: 'a'},
          {id: 2, v: 'b'},
          {id: 3, v: 'c'},
        ],
      }
      const result = applyPatch(doc, [
        Op.PushFieldBlank,
        0,
        Op.ArrayAppendSlice,
        0,
        1,
        Op.PushElementCopy,
        1,
        Op.ObjectSetFieldValue,
        'B',
        'v',
        Op.ReturnIntoArrayPop,
        Op.ArrayAppendSlice,
        2,
        3,
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(result).toEqual({
        items: [
          {id: 1, v: 'a'},
          {id: 2, v: 'B'},
          {id: 3, v: 'c'},
        ],
      })
      expect(result.items[0]).toBe(doc.items[0])
      expect(result.items[2]).toBe(doc.items[2])
    })

    test('PushElementBlank starts from nothing at an element', () => {
      const result = applyPatch({list: [{a: 1}, {b: 2}]}, [
        Op.PushFieldBlank,
        0,
        Op.PushElementBlank,
        0,
        Op.ObjectSetFieldValue,
        1,
        'z',
        Op.ReturnIntoArrayPop,
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(result).toEqual({list: [{z: 1}]})
    })

    test('nested arrays', () => {
      const result = applyPatch(
        [
          [1, 2],
          [3, 4],
        ],
        [
          Op.Blank,
          Op.PushElementBlank,
          1,
          Op.ArrayAppendSlice,
          1,
          2,
          Op.ReturnIntoArrayPop,
          Op.ArrayAppendValue,
          [9],
        ],
      )
      expect(result).toEqual([[4], [9]])
    })
  })

  describe('strings', () => {
    test('StringAppendString appends to a copy of the input string', () => {
      expect(applyPatch('hello', [Op.StringAppendString, ' world'])).toBe('hello world')
    })

    test('StringAppendSlice picks parts of the input', () => {
      expect(
        applyPatch('hello world', [
          Op.Blank,
          Op.StringAppendSlice,
          6,
          11,
          Op.StringAppendString,
          ' ',
          Op.StringAppendSlice,
          0,
          5,
        ]),
      ).toBe('world hello')
    })

    test('StringAppendSlice with empty range yields empty string', () => {
      expect(applyPatch('abc', [Op.Blank, Op.StringAppendSlice, 1, 1])).toBe('')
    })

    test('string edits inside an object', () => {
      const result = applyPatch({title: 'Hello world'}, [
        Op.PushFieldBlank,
        0,
        Op.StringAppendSlice,
        0,
        6,
        Op.StringAppendString,
        'there',
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(result).toEqual({title: 'Hello there'})
    })

    test('string edits inside an array element', () => {
      const result = applyPatch(
        ['foo', 'bar'],
        [
          Op.Blank,
          Op.ArrayAppendSlice,
          0,
          1,
          Op.PushElementBlank,
          1,
          Op.StringAppendSlice,
          0,
          2,
          Op.StringAppendString,
          'z',
          Op.ReturnIntoArrayPop,
        ],
      )
      expect(result).toEqual(['foo', 'baz'])
    })

    describe('UTF-8 indexing', () => {
      // Slice indices are UTF-8 byte offsets, not UTF-16 code units.
      test('two-byte characters', () => {
        // h=1, é=2, l=1, l=1, o=1
        expect(applyPatch('héllo', [Op.Blank, Op.StringAppendSlice, 0, 3])).toBe('hé')
        expect(applyPatch('héllo', [Op.Blank, Op.StringAppendSlice, 3, 6])).toBe('llo')
        expect(applyPatch('héllo', [Op.Blank, Op.StringAppendSlice, 1, 3])).toBe('é')
      })

      test('three-byte characters', () => {
        // €=3 bytes
        expect(applyPatch('a€b', [Op.Blank, Op.StringAppendSlice, 1, 4])).toBe('€')
        expect(applyPatch('a€b', [Op.Blank, Op.StringAppendSlice, 4, 5])).toBe('b')
      })

      test('four-byte characters (surrogate pairs)', () => {
        // 😀=4 bytes, 2 UTF-16 code units
        expect(applyPatch('a😀b', [Op.Blank, Op.StringAppendSlice, 1, 5])).toBe('😀')
        expect(applyPatch('a😀b', [Op.Blank, Op.StringAppendSlice, 5, 6])).toBe('b')
        expect(applyPatch('a😀b', [Op.Blank, Op.StringAppendSlice, 0, 1])).toBe('a')
      })

      test('mixed widths, reassembled', () => {
        const input = 'aé€😀z'
        // a=0..1, é=1..3, €=3..6, 😀=6..10, z=10..11
        const result = applyPatch(input, [
          Op.Blank,
          Op.StringAppendSlice,
          6,
          10,
          Op.StringAppendSlice,
          3,
          6,
          Op.StringAppendSlice,
          1,
          3,
          Op.StringAppendSlice,
          0,
          1,
          Op.StringAppendSlice,
          10,
          11,
        ])
        expect(result).toBe('😀€éaz')
      })
    })
  })

  describe('realistic patches', () => {
    test('patches correctly', () => {
      const left = {name: 'Bob Bobson', age: 30, skills: ['Go', 'Patching', 'Playing']}
      const patch = [19, 1, 10, 1, 14, 'firstName', 11, 2, 20, 'Diffing', 21, 0, 2, 15]
      const right = applyPatch(left, patch)
      expect(right).toEqual({
        firstName: 'Bob Bobson',
        age: 30,
        skills: ['Diffing', 'Go', 'Patching'],
      })
    })

    test('combining several operations on a document', () => {
      const doc = {
        _id: 'doc1',
        title: 'Hello world',
        tags: ['a', 'b', 'c'],
        meta: {views: 1, draft: true},
      }
      // Sorted keys: _id=0, meta=1, tags=2, title=3
      const result = applyPatch(doc, [
        Op.PushFieldCopy,
        1,
        Op.ObjectDeleteField,
        1, // draft (sorted: draft=0, views=1) - delete views
        Op.ObjectSetFieldValue,
        2,
        'views',
        Op.ReturnIntoObjectSameKeyPop,
        Op.PushFieldBlank,
        2,
        Op.ArrayAppendSlice,
        0,
        2,
        Op.ArrayAppendValue,
        'd',
        Op.ReturnIntoObjectSameKeyPop,
        Op.PushFieldBlank,
        3,
        Op.StringAppendString,
        'Goodbye',
        Op.StringAppendSlice,
        5,
        11,
        Op.ReturnIntoObjectSameKeyPop,
      ])
      expect(result).toEqual({
        _id: 'doc1',
        title: 'Goodbye world',
        tags: ['a', 'b', 'd'],
        meta: {draft: true, views: 2},
      })
    })
  })
})
