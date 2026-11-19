import {bench, do_not_optimize, group} from 'mitata'
import {applyPatch} from 'mendoza'
import {
  editEveryElement,
  largeArraySlice,
  longStringSlices,
  STRING_SLICE_CASES,
  typingSession,
  wideObjectEdit,
} from './fixtures'

group(() => {
  for (const width of [100, 1_000, 10_000]) {
    const {doc, patch} = wideObjectEdit(width)
    bench(`simple: wide object edit, width=${width}`, () => do_not_optimize(applyPatch(doc, patch)))
  }
})

group(() => {
  for (const length of [1_000, 10_000]) {
    const {doc, patch} = editEveryElement(length)
    bench(`simple: edit every element, length=${length}`, () =>
      do_not_optimize(applyPatch(doc, patch)))
  }
})

group(() => {
  for (const {length, slices} of STRING_SLICE_CASES) {
    const {doc, patch} = longStringSlices(length, slices)
    bench(`simple: string slices, length=${length} slices=${slices}`, () =>
      do_not_optimize(applyPatch(doc, patch)))
  }
})

group(() => {
  for (const length of [10_000, 100_000, 1_000_000]) {
    const {doc, patch} = largeArraySlice(length)
    bench(`simple: array slice, length=${length}`, () => do_not_optimize(applyPatch(doc, patch)))
  }
})

group(() => {
  for (const count of [100, 1_000]) {
    const {doc, patches} = typingSession(count)
    bench(`simple: typing session, patches=${count}`, () => {
      let current: unknown = doc
      for (const patch of patches) current = applyPatch(current, patch)
      do_not_optimize(current)
    })
  }
})
