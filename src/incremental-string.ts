import type {StringContent, StringPart} from './incremental-patcher'

/**
 * A string part that links to the part that was split off its end, if any. Splitting a part
 * shortens it in place and inserts the new part right after it in this chain.
 */
export type ChainedStringPart<T> = StringPart<T> & {
  next: ChainedStringPart<T> | null
  /** ID of the last string this part was added to. */
  owner: number
}

// Incremented on every split, so strings can tell cheaply whether their parts may be out of date.
let splitCount = 0
let nextStringId = 0

/**
 * The contents of a string in the incremental model.
 *
 * Parts are shared between versions, and a later version may split a part that an earlier
 * version also contains. Updating every string that contains a part on each split would get slower
 * the more versions share it, and would keep every version alive. Instead, each string remembers
 * where its parts ended in the split chain when they were added, and picks up the pieces that were
 * split off since then the next time it is read.
 */
export class IncrementalString<T> implements StringContent<T> {
  readonly type = 'string'

  #id = nextStringId++
  // `#parts[i]` and everything after it in the split chain up to (not including) `#ends[i]` is
  // part of this string.
  #parts: ChainedStringPart<T>[]
  #ends: (ChainedStringPart<T> | null)[]
  #splitCount: number

  constructor(parts: ChainedStringPart<T>[] = []) {
    this.#parts = parts
    this.#ends = []
    for (let part of parts) {
      part.owner = this.#id
      this.#ends.push(part.next)
    }
    this.#splitCount = splitCount
  }

  get parts(): ChainedStringPart<T>[] {
    if (this.#splitCount !== splitCount) {
      this.#refresh()
    }
    return this.#parts
  }

  append(part: ChainedStringPart<T>): void {
    // A string never contains the same part twice, since splitting one occurrence would then
    // split the others too and shift the positions of every part after them. Repeated text gets
    // its own part instead. Strings are built one at a time, so checking the last owner is enough.
    if (part.owner === this.#id) {
      part = {...part, next: null}
    }
    part.owner = this.#id

    // No need to refresh first: the existing entries pick up their split pieces when read.
    this.#parts.push(part)
    this.#ends.push(part.next)
  }

  /**
   * Splits the part at `index` at the given UCS-2 index, which is `leftSize` bytes into it in
   * UTF-8. This string is updated in place; other strings that contain the part see the split the
   * next time they are read.
   */
  splitPart(index: number, ucsIndex: number, leftSize: number): void {
    let parts = this.parts
    let part = parts[index]

    let newPart: ChainedStringPart<T> = {
      value: part.value.slice(ucsIndex),
      utf8size: part.utf8size - leftSize,
      startMeta: part.startMeta,
      endMeta: part.endMeta,
      next: part.next,
      owner: this.#id,
    }
    part.value = part.value.slice(0, ucsIndex)
    part.utf8size = leftSize
    part.next = newPart
    splitCount++

    parts.splice(index + 1, 0, newPart)
    this.#ends.splice(index, 1, newPart, newPart.next)
    this.#splitCount = splitCount
  }

  #refresh(): void {
    let parts: ChainedStringPart<T>[] = []
    let ends: (ChainedStringPart<T> | null)[] = []

    for (let i = 0; i < this.#parts.length; i++) {
      let end = this.#ends[i]
      for (let part: ChainedStringPart<T> | null = this.#parts[i]; part && part !== end;) {
        parts.push(part)
        ends.push(part.next)
        part = part.next
      }
    }

    this.#parts = parts
    this.#ends = ends
    this.#splitCount = splitCount
  }
}
