# Mendoza decoder in TypeScript

Basic example:

```typescript
import {applyPatch} from "mendoza-js"

let left = {…};
let patch = […];
let right = applyPatch(left, patch);
```

Incremental patcher:

```typescript
import {Value, wrap, unwrap, applyPatch} from "mendoza-js/src/incremental-patcher"

let left: Value = wrap({…}, "first-version");
let patch = […];
let right: Value = applyPatch(left, patch, "second-version");

// Return the full object:
console.log(unwrap(right));
```