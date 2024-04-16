# mendoza-js

[![npm stat](https://img.shields.io/npm/dm/mendoza.svg?style=flat-square)](https://npm-stat.com/charts.html?package=mendoza)
[![npm version](https://img.shields.io/npm/v/mendoza.svg?style=flat-square)](https://www.npmjs.com/package/mendoza)
[![gzip size][gzip-badge]][bundlephobia]
[![size][size-badge]][bundlephobia]

[Mendoza](https://github.com/sanity-io/mendoza) decoder in TypeScript.

## Installation

```bash
npm install mendoza
```

or

```bash
pnpm install mendoza
```

or

```bash
yarn add mendoza
```

## Usage

Basic example:

```typescript
import {applyPatch} from "mendoza"

let left = {…};
let patch = […];
let right = applyPatch(left, patch);
```

Incremental patcher:

```typescript
import {incremental} from "mendoza"

const {Value, rebaseValue, wrap, unwrap, getType, applyPatch} = incremental

// Create an empty initial version:
const ROOT = wrap(null, null);

// Input of patches:
let patches = […];

// `origin` can be whatever you want to identify where a change comes from:
let origin = 0;

// Reference to the latest version:
let value = ROOT;

// Rebasing is for maintaing history across deleted versions:
let rebaseTarget;

for (let patch of patches) {
  // Apply the patch:
  let newValue = applyPatch(value, patch, origin);

  // Rebase if needed:
  if (rebaseTarget) {
    newValue = rebaseValue(rebaseTarget, newValue);
  }

  // If the document was deleted, store the previous version so we can rebase:
  if (getType(newValue) === "null") {
    rebaseTarget = value;
  } else {
    rebaseTarget = null;
  }

  value = newValue;
  origin++;
}

// Return the final full object:
console.log(unwrap(value));
```

## License

MIT © [Sanity.io](https://www.sanity.io/)

## Release new version

Run the ["CI & Release" workflow](https://github.com/sanity-io/mendoza-js/actions).
Make sure to select the main branch and check "Release new version".

Semantic release will only release on configured branches, so it is safe to run release on any branch.

[gzip-badge]: https://img.shields.io/bundlephobia/minzip/mendoza?label=gzip%20size&style=flat-square
[size-badge]: https://img.shields.io/bundlephobia/min/mendoza?label=size&style=flat-square
[bundlephobia]: https://bundlephobia.com/package/mendoza
