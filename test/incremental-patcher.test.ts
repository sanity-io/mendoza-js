import {describe, expect, test} from 'vitest'
import {incremental} from '../src/index'
import {Op} from '../src/index'

const {applyPatch, getType, rebaseValue, unwrap, wrap} = incremental

describe('incremental', () => {
  describe('wrap / unwrap', () => {
    test('wrap records the origin as start and end meta', () => {
      const value = wrap({a: 1}, 'v1')
      expect(value).toEqual({data: {a: 1}, startMeta: 'v1', endMeta: 'v1'})
    })

    test('unwrap returns the underlying data', () => {
      const data = {a: [1, 2, {b: 'c'}]}
      expect(unwrap(wrap(data, 'v1'))).toBe(data)
    })

    test('unwrap reconstructs native data from patched content', () => {
      const result = applyPatch(
        wrap({a: 1, b: ['x']}, 'v1'),
        [Op.ObjectSetFieldValue, 2, 'a'],
        'v2',
      )
      expect(result.data).toBeUndefined()
      expect(unwrap(result)).toEqual({a: 2, b: ['x']})
    })

    test('unwrap caches its result', () => {
      const result = applyPatch(wrap({a: 1}, 'v1'), [Op.ObjectSetFieldValue, 2, 'a'], 'v2')
      expect(unwrap(result)).toBe(unwrap(result))
    })
  })

  describe('getType', () => {
    test.each([
      [{}, 'object'],
      [[], 'array'],
      ['str', 'string'],
      [1, 'number'],
      [true, 'boolean'],
      [null, 'null'],
    ] as const)('wrapped %j is %s', (data, expected) => {
      expect(getType(wrap(data, 'v1'))).toBe(expected)
    })

    test('detects the type of patched (content-backed) values', () => {
      expect(getType(applyPatch(wrap({}, 'v1'), [Op.ObjectSetFieldValue, 1, 'a'], 'v2'))).toBe(
        'object',
      )
      expect(getType(applyPatch(wrap([], 'v1'), [Op.ArrayAppendValue, 1], 'v2'))).toBe('array')
      expect(getType(applyPatch(wrap('a', 'v1'), [Op.StringAppendString, 'b'], 'v2'))).toBe(
        'string',
      )
    })
  })

  describe('applyPatch', () => {
    test('empty patch returns the same value', () => {
      const value = wrap({a: 1}, 'v1')
      expect(applyPatch(value, [], 'v2')).toBe(value)
    })

    test('unknown opcode throws', () => {
      expect(() => applyPatch(wrap({}, 'v1'), [99], 'v2')).toThrow('Unknown opcode: 99')
    })

    test('Value replaces the root', () => {
      const result = applyPatch(wrap({a: 1}, 'v1'), [Op.Value, [1, 2]], 'v2')
      expect(unwrap(result)).toEqual([1, 2])
      expect(result.startMeta).toBe('v2')
    })

    test('does not mutate the input data', () => {
      const data = {a: 'hello', b: [1, 2], c: {d: 1}}
      const snapshot = JSON.parse(JSON.stringify(data))
      const input = wrap(data, 'v1')
      const result = applyPatch(
        input,
        [
          Op.PushFieldBlank,
          0,
          Op.StringAppendSlice,
          0,
          2,
          Op.StringAppendString,
          'y',
          Op.ReturnIntoObjectSameKeyPop,
          Op.PushFieldCopy,
          1,
          Op.ArrayAppendValue,
          3,
          Op.ReturnIntoObjectSameKeyPop,
        ],
        'v2',
      )
      expect(unwrap(result)).toEqual({a: 'hey', b: [1, 2, 3], c: {d: 1}})
      expect(data).toEqual(snapshot)
      expect(unwrap(input)).toEqual(snapshot)
    })

    describe('objects', () => {
      test('set, delete and copy fields', () => {
        const result = applyPatch(
          wrap({a: 1, b: 2, c: 3}, 'v1'),
          [Op.ObjectDeleteField, 0, Op.ObjectSetFieldValue, 'x', 'd'],
          'v2',
        )
        expect(unwrap(result)).toEqual({b: 2, c: 3, d: 'x'})

        const blank = applyPatch(
          wrap({a: 1, b: 2, c: 3}, 'v1'),
          [Op.Blank, Op.ObjectCopyField, 1, Op.ObjectCopyField, 2],
          'v2',
        )
        expect(unwrap(blank)).toEqual({b: 2, c: 3})
      })

      test('tracks which version each field was written in', () => {
        const result = applyPatch(wrap({a: 1, b: 2}, 'v1'), [Op.ObjectSetFieldValue, 10, 'a'], 'v2')
        if (!result.content || result.content.type !== 'object') throw new Error('expected object')
        const {a, b} = result.content.fields
        // `a` was rewritten in v2
        expect(a.startMeta).toBe('v2')
        expect(a.endMeta).toBe('v2')
        // `b` is untouched: it originates in v1 but is still alive in v2
        expect(b.startMeta).toBe('v1')
        expect(b.endMeta).toBe('v2')
        expect(result.startMeta).toBe('v2')
        expect(result.endMeta).toBe('v2')
      })

      test('metas keep their origin across several patches', () => {
        const v1 = wrap({a: 1, b: 2, c: 3}, 'v1')
        const v2 = applyPatch(v1, [Op.ObjectSetFieldValue, 20, 'b'], 'v2')
        const v3 = applyPatch(v2, [Op.ObjectSetFieldValue, 30, 'c'], 'v3')
        expect(unwrap(v3)).toEqual({a: 1, b: 20, c: 30})
        if (!v3.content || v3.content.type !== 'object') throw new Error('expected object')
        const {a, b, c} = v3.content.fields
        expect([a.startMeta, a.endMeta]).toEqual(['v1', 'v3'])
        expect([b.startMeta, b.endMeta]).toEqual(['v2', 'v3'])
        expect([c.startMeta, c.endMeta]).toEqual(['v3', 'v3'])
      })

      test('nested edits keep untouched subtrees', () => {
        const doc = {user: {name: 'a', address: {zip: 1}}, other: [1]}
        const result = applyPatch(
          wrap(doc, 'v1'),
          [
            Op.PushFieldCopy,
            1, // user
            Op.PushFieldCopy,
            0, // address
            Op.ObjectSetFieldValue,
            2,
            'zip',
            Op.ReturnIntoObjectSameKeyPop,
            Op.ReturnIntoObjectSameKeyPop,
          ],
          'v2',
        )
        expect(unwrap(result)).toEqual({user: {name: 'a', address: {zip: 2}}, other: [1]})
        if (!result.content || result.content.type !== 'object') throw new Error('expected object')
        expect(result.content.fields['other'].startMeta).toBe('v1')
      })
    })

    test('PushParent re-enters an ancestor of the current input', () => {
      const result = applyPatch(
        wrap({a: {x: 1}, b: 2}, 'v1'),
        [
          Op.PushFieldBlank,
          0,
          Op.PushParent,
          0,
          Op.ObjectCopyField,
          1,
          Op.Pop,
          Op.ReturnIntoObjectSameKeyPop,
        ],
        'v2',
      )
      expect(unwrap(result)).toEqual({a: {b: 2}, b: 2})
    })

    describe('arrays', () => {
      test('append values and slices', () => {
        const result = applyPatch(
          wrap([1, 2, 3, 4], 'v1'),
          [
            Op.Blank,
            Op.ArrayAppendSlice,
            0,
            2,
            Op.ArrayAppendValue,
            'x',
            Op.ArrayAppendSlice,
            3,
            4,
          ],
          'v2',
        )
        expect(unwrap(result)).toEqual([1, 2, 'x', 4])
      })

      test('tracks element metas when slices keep their position', () => {
        const v1 = wrap(['a', 'b', 'c'], 'v1')
        const v2 = applyPatch(v1, [Op.ArrayAppendValue, 'd'], 'v2')
        if (!v2.content || v2.content.type !== 'array') throw new Error('expected array')
        expect(v2.content.elements.map((e) => e.startMeta)).toEqual(['v1', 'v1', 'v1', 'v2'])
        expect(v2.content.elements.map((e) => e.endMeta)).toEqual(['v2', 'v2', 'v2', 'v2'])
        expect(v2.content.metas).toEqual(['v2', 'v2', 'v2', 'v2'])
      })

      test('editing an element in place', () => {
        const result = applyPatch(
          wrap({list: [{id: 1}, {id: 2}, {id: 3}]}, 'v1'),
          [
            Op.PushFieldBlank,
            0,
            Op.ArrayAppendSlice,
            0,
            1,
            Op.PushElementCopy,
            1,
            Op.ObjectSetFieldValue,
            true,
            'done',
            Op.ReturnIntoArrayPop,
            Op.ArrayAppendSlice,
            2,
            3,
            Op.ReturnIntoObjectSameKeyPop,
          ],
          'v2',
        )
        expect(unwrap(result)).toEqual({list: [{id: 1}, {id: 2, done: true}, {id: 3}]})
      })

      test('PushElementBlank and PushElementCopy', () => {
        const result = applyPatch(
          wrap([[1], [2], [3]], 'v1'),
          [
            Op.Blank,
            Op.PushElementCopy,
            2,
            Op.ReturnIntoArrayPop,
            Op.PushElementBlank,
            0,
            Op.ArrayAppendValue,
            'z',
            Op.ReturnIntoArrayPop,
          ],
          'v2',
        )
        expect(unwrap(result)).toEqual([[3], ['z']])
      })

      test('reordered slices get the current meta', () => {
        const v1 = wrap(['a', 'b', 'c'], 'v1')
        const v2 = applyPatch(v1, [Op.Blank, Op.ArrayAppendSlice, 1, 3], 'v2')
        if (!v2.content || v2.content.type !== 'array') throw new Error('expected array')
        expect(unwrap(v2)).toEqual(['b', 'c'])
        expect(v2.content.metas).toEqual(['v2', 'v2'])
      })
    })

    describe('strings', () => {
      test('append, slice and combine', () => {
        const result = applyPatch(
          wrap('hello world', 'v1'),
          [
            Op.Blank,
            Op.StringAppendSlice,
            6,
            11,
            Op.StringAppendString,
            ' ',
            Op.StringAppendSlice,
            0,
            5,
          ],
          'v2',
        )
        expect(unwrap(result)).toBe('world hello')
      })

      test('appending to the existing string keeps it', () => {
        const result = applyPatch(wrap('abc', 'v1'), [Op.StringAppendString, 'def'], 'v2')
        expect(unwrap(result)).toBe('abcdef')
      })

      test('tracks part origins', () => {
        const v1 = wrap('hello world', 'v1')
        const v2 = applyPatch(
          v1,
          [Op.Blank, Op.StringAppendSlice, 0, 6, Op.StringAppendString, 'there'],
          'v2',
        )
        if (!v2.content || v2.content.type !== 'string') throw new Error('expected string')
        expect(unwrap(v2)).toBe('hello there')
        expect(v2.content.parts.map((p) => [p.value, p.startMeta])).toEqual([
          ['hello ', 'v1'],
          ['there', 'v2'],
        ])
        for (const part of v2.content.parts) expect(part.endMeta).toBe('v2')
      })

      test('slicing out of bounds throws', () => {
        expect(() =>
          applyPatch(wrap('abc', 'v1'), [Op.Blank, Op.StringAppendSlice, 0, 10], 'v2'),
        ).toThrow('splitting string out of bounds')
      })

      test('a patch may split the same part repeatedly', () => {
        const result = applyPatch(
          wrap('abcdefgh', 'v1'),
          [
            Op.Blank,
            Op.StringAppendSlice,
            6,
            8,
            Op.StringAppendSlice,
            2,
            4,
            Op.StringAppendSlice,
            0,
            2,
            Op.StringAppendSlice,
            4,
            6,
          ],
          'v2',
        )
        expect(unwrap(result)).toBe('ghcdabef')
      })

      test('chained patches on the same string', () => {
        const v1 = wrap('hello world', 'v1')
        const v2 = applyPatch(
          v1,
          [Op.Blank, Op.StringAppendSlice, 0, 5, Op.StringAppendString, '!'],
          'v2',
        )
        const v3 = applyPatch(
          v2,
          [Op.Blank, Op.StringAppendString, '>', Op.StringAppendSlice, 1, 6],
          'v3',
        )
        expect(unwrap(v2)).toBe('hello!')
        expect(unwrap(v3)).toBe('>ello!')
      })

      test('splitting a string shared with an earlier version does not change it', () => {
        const v1 = wrap('abcdef', 'v1')
        const v2 = applyPatch(v1, [Op.Blank, Op.StringAppendSlice, 0, 3], 'v2')
        expect(unwrap(v1)).toBe('abcdef')
        expect(unwrap(v2)).toBe('abc')
        // v1's content is now split into parts but must still read the same
        const v3 = applyPatch(v1, [Op.Blank, Op.StringAppendSlice, 3, 6], 'v3')
        expect(unwrap(v3)).toBe('def')
        expect(unwrap(v1)).toBe('abcdef')
      })

      describe('UTF-8 indexing', () => {
        test.each([
          ['héllo', 0, 3, 'hé'],
          ['héllo', 3, 6, 'llo'],
          ['héllo', 1, 3, 'é'],
          ['a€b', 1, 4, '€'],
          ['a€b', 4, 5, 'b'],
          ['a😀b', 1, 5, '😀'],
          ['a😀b', 0, 1, 'a'],
          ['a😀b', 5, 6, 'b'],
          ['aé€😀z', 3, 6, '€'],
          ['aé€😀z', 6, 10, '😀'],
          ['aé€😀z', 1, 10, 'é€😀'],
        ])('slice of %j from byte %i to %i is %j', (input, from, to, expected) => {
          const result = applyPatch(
            wrap(input, 'v1'),
            [Op.Blank, Op.StringAppendSlice, from, to],
            'v2',
          )
          expect(unwrap(result)).toBe(expected)
        })

        test('mixed widths reassembled in a different order', () => {
          const result = applyPatch(
            wrap('aé€😀z', 'v1'),
            [
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
            ],
            'v2',
          )
          expect(unwrap(result)).toBe('😀€éaz')
        })

        test('appending multi-byte text and slicing it in a later patch', () => {
          const v2 = applyPatch(wrap('ab', 'v1'), [Op.StringAppendString, '€😀'], 'v2')
          expect(unwrap(v2)).toBe('ab€😀')
          // a=0..1 b=1..2 €=2..5 😀=5..9
          const v3 = applyPatch(
            v2,
            [Op.Blank, Op.StringAppendSlice, 5, 9, Op.StringAppendSlice, 2, 5],
            'v3',
          )
          expect(unwrap(v3)).toBe('😀€')
        })
      })
    })
  })

  describe('rebaseValue', () => {
    test('different types return the right value', () => {
      const left = wrap({a: 1}, 'v1')
      const right = wrap([1], 'v2')
      expect(rebaseValue(left, right)).toBe(right)
    })

    test.each([
      ['null', null],
      ['boolean', true],
      ['number', 42],
    ])('identical %s returns left', (_name, data) => {
      const left = wrap(data, 'v1')
      const right = wrap(data, 'v2')
      expect(rebaseValue(left, right)).toBe(left)
    })

    test.each([
      ['boolean', true, false],
      ['number', 1, 2],
    ])('different %s returns right', (_name, l, r) => {
      const left = wrap(l, 'v1')
      const right = wrap(r, 'v2')
      expect(rebaseValue(left, right)).toBe(right)
    })

    test('identical objects return left', () => {
      const left = wrap({a: 1, b: {c: [1, 2]}}, 'v1')
      const right = wrap({a: 1, b: {c: [1, 2]}}, 'v2')
      expect(rebaseValue(left, right)).toBe(left)
    })

    test('different objects return right, reusing identical fields from left', () => {
      const left = wrap({a: 1, b: {c: 1}, d: [1]}, 'v1')
      const right = wrap({a: 2, b: {c: 1}, d: [1]}, 'v2')
      const result = rebaseValue(left, right)
      expect(result).toBe(right)
      expect(unwrap(result)).toEqual({a: 2, b: {c: 1}, d: [1]})
      if (!result.content || result.content.type !== 'object') throw new Error('expected object')
      if (!left.content || left.content.type !== 'object') throw new Error('expected object')
      expect(result.content.fields['a'].startMeta).toBe('v2')
      expect(result.content.fields['b']).toBe(left.content.fields['b'])
      expect(result.content.fields['d']).toBe(left.content.fields['d'])
    })

    test('objects with different key sets are not identical', () => {
      const left = wrap({a: 1, b: 2}, 'v1')
      expect(rebaseValue(left, wrap({a: 1}, 'v2'))).not.toBe(left)
      expect(rebaseValue(left, wrap({a: 1, b: 2, c: 3}, 'v2'))).not.toBe(left)
      expect(unwrap(rebaseValue(left, wrap({a: 1, c: 2}, 'v2')))).toEqual({a: 1, c: 2})
    })

    test('identical arrays return left', () => {
      const left = wrap([1, {a: 'x'}], 'v1')
      const right = wrap([1, {a: 'x'}], 'v2')
      expect(rebaseValue(left, right)).toBe(left)
    })

    test('arrays of different length return right', () => {
      const left = wrap([1, 2], 'v1')
      const right = wrap([1, 2, 3], 'v2')
      expect(rebaseValue(left, right)).toBe(right)
    })

    test('arrays of the same length reuse identical elements', () => {
      const left = wrap([{a: 1}, {b: 2}], 'v1')
      const right = wrap([{a: 1}, {b: 3}], 'v2')
      const result = rebaseValue(left, right)
      expect(unwrap(result)).toEqual([{a: 1}, {b: 3}])
      if (!result.content || result.content.type !== 'array') throw new Error('expected array')
      if (!left.content || left.content.type !== 'array') throw new Error('expected array')
      expect(result.content.elements[0]).toBe(left.content.elements[0])
      expect(result.content.elements[1].startMeta).toBe('v2')
    })

    test('identical strings return left', () => {
      const left = wrap('hello', 'v1')
      expect(rebaseValue(left, wrap('hello', 'v2'))).toBe(left)
    })

    test('different strings share a common prefix and suffix with left', () => {
      const left = wrap('hello big world', 'v1')
      const right = wrap('hello small world', 'v2')
      const result = rebaseValue(left, right)
      expect(unwrap(result)).toBe('hello small world')
      if (!result.content || result.content.type !== 'string') throw new Error('expected string')
      expect(result.content.parts.map((p) => [p.value, p.startMeta])).toEqual([
        ['hello ', 'v1'],
        ['small', 'v2'],
        [' world', 'v1'],
      ])
    })

    test('string rebase handles multi-byte characters', () => {
      const left = wrap('héllo 😀 wörld', 'v1')
      const right = wrap('héllo 🎉 wörld', 'v2')
      const result = rebaseValue(left, right)
      expect(unwrap(result)).toBe('héllo 🎉 wörld')
      if (!result.content || result.content.type !== 'string') throw new Error('expected string')
      expect(result.content.parts.map((p) => [p.value, p.startMeta])).toEqual([
        ['héllo ', 'v1'],
        ['🎉', 'v2'],
        [' wörld', 'v1'],
      ])
    })

    test('string rebase with a common suffix that ends in a surrogate pair', () => {
      const result = rebaseValue(wrap('a😀', 'v1'), wrap('b😀', 'v2'))
      expect(unwrap(result)).toBe('b😀')
      if (!result.content || result.content.type !== 'string') throw new Error('expected string')
      expect(result.content.parts.map((p) => [p.value, p.startMeta])).toEqual([
        ['b', 'v2'],
        ['😀', 'v1'],
      ])
    })

    test('string rebase with a common suffix of mixed multi-byte characters', () => {
      const result = rebaseValue(wrap('x😀€é🎉', 'v1'), wrap('y😀€é🎉', 'v2'))
      expect(unwrap(result)).toBe('y😀€é🎉')
      if (!result.content || result.content.type !== 'string') throw new Error('expected string')
      expect(result.content.parts.map((p) => [p.value, p.startMeta])).toEqual([
        ['y', 'v2'],
        ['😀€é🎉', 'v1'],
      ])
    })

    test('string rebase finds the whole common suffix after a multi-byte prefix', () => {
      const result = rebaseValue(wrap('éab', 'v1'), wrap('éxab', 'v2'))
      expect(unwrap(result)).toBe('éxab')
      if (!result.content || result.content.type !== 'string') throw new Error('expected string')
      expect(result.content.parts.map((p) => [p.value, p.startMeta])).toEqual([
        ['é', 'v1'],
        ['x', 'v2'],
        ['ab', 'v1'],
      ])
    })

    test('completely different strings', () => {
      const result = rebaseValue(wrap('abc', 'v1'), wrap('xyz', 'v2'))
      expect(unwrap(result)).toBe('xyz')
    })

    test('string rebase where one side is a prefix of the other', () => {
      expect(unwrap(rebaseValue(wrap('abc', 'v1'), wrap('abcdef', 'v2')))).toBe('abcdef')
      expect(unwrap(rebaseValue(wrap('abcdef', 'v1'), wrap('abc', 'v2')))).toBe('abc')
      expect(unwrap(rebaseValue(wrap('', 'v1'), wrap('abc', 'v2')))).toBe('abc')
      expect(unwrap(rebaseValue(wrap('abc', 'v1'), wrap('', 'v2')))).toBe('')
    })

    test('rebasing patched values', () => {
      const v1 = wrap({title: 'Hello', tags: ['a']}, 'v1')
      const v2 = applyPatch(v1, [Op.ObjectSetFieldValue, 'Hi', 'title'], 'v2')
      // A document from elsewhere that happens to equal v2
      const other = wrap({title: 'Hi', tags: ['a']}, 'v3')
      const result = rebaseValue(v2, other)
      expect(result).toBe(v2)
    })
  })
})
