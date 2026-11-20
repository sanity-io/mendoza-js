export function utf8charSize(code: number): 1 | 2 | 3 | 4 {
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

export function utf8stringSize(str: string): number {
  let b = 0
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)!
    let size = utf8charSize(code)
    if (size == 4) i++
    b += size
  }
  return b
}

/** Converts an UTF-8 byte index into a UCS-2 index. */
export function utf8resolveIndex(str: string, idx: number) {
  let byteCount = 0
  let ucsIdx = 0

  for (ucsIdx = 0; byteCount < idx; ucsIdx++) {
    let code = str.codePointAt(ucsIdx)!
    let size = utf8charSize(code)
    if (size === 4) ucsIdx++ // Surrogate pair.
    byteCount += size
  }

  return ucsIdx
}

export function commonPrefix(str: string, str2: string) {
  let len = Math.min(str.length, str2.length)
  let b = 0
  for (let i = 0; i < len;) {
    let aPoint = str.codePointAt(i)!
    let bPoint = str2.codePointAt(i)!
    if (aPoint !== bPoint) return b
    let size = utf8charSize(aPoint)
    b += size
    i += size === 4 ? 2 : 1
  }
  return b
}

/**
 * Returns the length in UTF-8 bytes of the common suffix of two strings, not overlapping a common
 * prefix of `prefix` UTF-8 bytes.
 */
export function commonSuffix(str: string, str2: string, prefix: number = 0) {
  // The prefix is in UTF-8 bytes, but the strings are indexed in UTF-16 code units
  let len = Math.min(str.length, str2.length) - utf8resolveIndex(str, prefix)
  let b = 0
  for (let i = 0; i < len;) {
    let aPoint = codePointBefore(str, str.length - i)
    let bPoint = codePointBefore(str2, str2.length - i)
    if (aPoint !== bPoint) return b
    let size = utf8charSize(aPoint)
    b += size
    i += size === 4 ? 2 : 1
  }
  return b
}

/**
 * Returns the code point that ends right before UTF-16 index `end`. Unlike `codePointAt()`, this
 * reads both halves of a surrogate pair when `end - 1` is the second half.
 */
function codePointBefore(str: string, end: number): number {
  let low = str.charCodeAt(end - 1)
  if (low >= 0xdc00 && low <= 0xdfff && end >= 2) {
    let high = str.charCodeAt(end - 2)
    if (high >= 0xd800 && high <= 0xdbff) {
      return (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000
    }
  }
  return low
}
