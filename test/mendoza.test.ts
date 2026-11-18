import {applyPatch} from 'mendoza'
import {expect, test} from 'vitest'

test('patches correctly', () => {
  const left = {name: 'Bob Bobson', age: 30, skills: ['Go', 'Patching', 'Playing']}
  const patch = [19, 1, 10, 1, 14, 'firstName', 11, 2, 20, 'Diffing', 21, 0, 2, 15]
  const right = applyPatch(left, patch)
  expect(right).toEqual({firstName: 'Bob Bobson', age: 30, skills: ['Diffing', 'Go', 'Patching']})
})

test('string slices after multi-byte characters resolve both bounds in UTF-8 bytes', () => {
  // Blank, then StringAppendSlice(3, 6): a valid middle slice. The Go differ only emits
  // prefix and suffix slices, but other encoders may produce slices like this.
  // `é` is 2 bytes and `€` is 3 bytes.
  expect(applyPatch('aé€😀z', [2, 23, 3, 6])).toBe('€')
})
