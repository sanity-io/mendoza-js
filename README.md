# mendoza-js

[![Open on npmx.dev](https://npmx.dev/api/registry/badge/downloads-month/mendoza)](https://npmx.dev/package/mendoza)
[![Latest version](https://npmx.dev/api/registry/badge/version/mendoza)](https://npmx.dev/package/mendoza)
[![Pre-gzip size](https://npmx.dev/api/registry/badge/size/mendoza)](https://npmx.dev/package/mendoza)
[![Number of dependencies](https://npmx.dev/api/registry/badge/dependencies/mendoza)](https://npmx.dev/package/mendoza)
[![Node versions supported](https://npmx.dev/api/registry/badge/engines/mendoza)](https://npmx.dev/package/mendoza)

[Mendoza](https://github.com/sanity-io/mendoza) decoder in TypeScript.

## Installation

```bash
npm install mendoza
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
import {applyPatch, getType, rebaseValue, unwrap, wrap} from "mendoza/incremental"

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

Releases use [changesets](https://github.com/changesets/changesets). A changeset is generated from the PR title, so PR titles must follow conventional commits. Merging the "chore: version packages" PR on `main` publishes to npm with provenance.
