import {bench, do_not_optimize, group} from 'mitata'
import type {RawPatch} from 'mendoza'
import {applyPatch, wrap} from 'mendoza/incremental'
import {
  appendToArray,
  editEveryElement,
  largeArraySlice,
  longStringSlices,
  STRING_SLICE_CASES,
  typingSession,
  wideObjectEdit,
} from './fixtures'

// The incremental model caches derived content on the wrapped value, so every iteration wraps
// the document again to avoid measuring a warm cache.
function applyFresh(doc: unknown, patch: RawPatch): void {
  do_not_optimize(applyPatch(wrap(doc, 'v1'), patch, 'v2'))
}

group(() => {
  for (const width of [100, 1_000, 10_000]) {
    const {doc, patch} = wideObjectEdit(width)
    bench(`incremental: wide object edit, width=${width}`, () => applyFresh(doc, patch))
  }
})

group(() => {
  for (const length of [1_000, 10_000]) {
    const {doc, patch} = editEveryElement(length)
    bench(`incremental: edit every element, length=${length}`, () => applyFresh(doc, patch))
  }
})

group(() => {
  for (const {length, slices} of STRING_SLICE_CASES) {
    const {doc, patch} = longStringSlices(length, slices)
    bench(`incremental: string slices, length=${length} slices=${slices}`, () =>
      applyFresh(doc, patch))
  }
})

group(() => {
  for (const length of [10_000, 100_000, 1_000_000]) {
    const {doc, patch} = largeArraySlice(length)
    bench(`incremental: array slice, length=${length}`, () => applyFresh(doc, patch))
  }
})

group(() => {
  for (const length of [1_000, 100_000]) {
    const {doc, patch} = appendToArray(length)
    bench(`incremental: append to array, length=${length}`, () => applyFresh(doc, patch))
  }
})

group(() => {
  for (const count of [100, 1_000]) {
    const {doc, patches} = typingSession(count)
    bench(`incremental: typing session, patches=${count}`, () => {
      let current = wrap(doc, 'v0')
      for (const [i, patch] of patches.entries()) {
        current = applyPatch(current, patch, `v${i + 1}`)
      }
      do_not_optimize(current)
    })
  }
})
