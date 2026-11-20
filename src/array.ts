// Spreading into `push()` passes every element as a function argument, which overflows the call
// stack for large arrays. Spreading in chunks keeps the speed of a single `push()` for small
// slices without the size limit.
const PUSH_CHUNK_SIZE = 8192

/** Appends `source[left..right)` to `target`. */
export function pushSlice<T>(target: T[], source: T[], left: number, right: number): void {
  for (let start = left; start < right; start += PUSH_CHUNK_SIZE) {
    target.push(...source.slice(start, Math.min(start + PUSH_CHUNK_SIZE, right)))
  }
}
