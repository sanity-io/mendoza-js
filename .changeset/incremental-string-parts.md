---
'mendoza': major
---

fix!: incremental patches on strings no longer get slower, or use more memory, the more versions a string has

This changes how the incremental patcher represents strings, which breaks code that relies on string content being a plain object:

- `StringPart.uses` has been removed.
- String content is now a class instance, and `parts` is a getter rather than an own property. Spreading, `JSON.stringify()`, `structuredClone()` and deep-equality checks no longer see `parts`.
- Patching a value with string content that was not created by the incremental patcher (for instance a plain object built by hand or deserialized) throws `expected string content`, even though the exported `StringContent` and `StringPart` types still describe plain objects.
- A `parts` array is a snapshot. When a later version splits a part that another version shares, the parts in an array you are holding on to get shorter, but the pieces split off them are only added when you read `parts` again.
