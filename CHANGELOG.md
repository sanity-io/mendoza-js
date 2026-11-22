<!-- markdownlint-disable --><!-- textlint-disable -->

## 5.0.0

### Major Changes

- incremental patches on strings no longer get slower, or use more memory, the more versions a string has ([9f085e9](https://github.com/sanity-io/mendoza-js/commit/9f085e9a85a9c6d20f96f5892b9f6479cf849ead))

  This changes how the incremental patcher represents strings, which breaks code that relies on string content being a plain object:

  - `StringPart.uses` has been removed.
  - String content is now a class instance, and `parts` is a getter rather than an own property. Spreading, `JSON.stringify()`, `structuredClone()` and deep-equality checks no longer see `parts`.
  - Patching a value with string content that was not created by the incremental patcher (for instance a plain object built by hand or deserialized) throws `expected string content`, even though the exported `StringContent` and `StringPart` types still describe plain objects.
  - A `parts` array is a snapshot. When a later version splits a part that another version shares, the parts in an array you are holding on to get shorter, but the pieces split off them are only added when you read `parts` again.

### Patch Changes

- `ArrayAppendSlice` no longer overflows the call stack for large slices ([#102](https://github.com/sanity-io/mendoza-js/pull/102)) ([9faa837](https://github.com/sanity-io/mendoza-js/commit/9faa837fc140197f720573988e96041d9bdf90ae))
- incremental patches that append to an existing array no longer change the array in earlier versions ([#106](https://github.com/sanity-io/mendoza-js/pull/106)) ([0d96836](https://github.com/sanity-io/mendoza-js/commit/0d968364a8397ed1cf5dd50eb1ce64a411100f34))
- array element metas in the incremental patcher now keep their origin when elements stay in place ([#108](https://github.com/sanity-io/mendoza-js/pull/108)) ([3493b78](https://github.com/sanity-io/mendoza-js/commit/3493b7809e6f00f9edec297b81a0a5412096c1d6))

  Previously, any patch that rebuilt an array gave every element in it the meta of that patch.

- faster object copies when applying patches ([#105](https://github.com/sanity-io/mendoza-js/pull/105)) ([c827920](https://github.com/sanity-io/mendoza-js/commit/c827920332326bbeb28c7808703119792173629a))
- faster opcode dispatch when applying patches ([#104](https://github.com/sanity-io/mendoza-js/pull/104)) ([ae5141a](https://github.com/sanity-io/mendoza-js/commit/ae5141a48ba71b6204a7a74a0c0c32543db8d18b))
- avoid rescanning the source string for every string slice in `applyPatch` ([#103](https://github.com/sanity-io/mendoza-js/pull/103)) ([5c5ae69](https://github.com/sanity-io/mendoza-js/commit/5c5ae69993f55b0fdbe4f7d802ecaff9d38b3284))
- `rebaseValue()` no longer throws when two strings share a suffix that ends in an emoji or another character outside the Basic Multilingual Plane ([#111](https://github.com/sanity-io/mendoza-js/pull/111)) ([0771fcf](https://github.com/sanity-io/mendoza-js/commit/0771fcf34d9785170033b79c394b3f374cb98877))

## 4.0.0

### Major Changes

- esm-only, require node >= 22.12, modernize tooling ([#96](https://github.com/sanity-io/mendoza-js/pull/96)) ([f45aa14](https://github.com/sanity-io/mendoza-js/commit/f45aa14fb7cb0044c72e7db02a371bc23cb30b20))

  BREAKING CHANGES:

  - The package is now ESM-only. The CommonJS build (`dist/index.cjs`) and the `main` field are gone, so `require('mendoza')` only works on runtimes with `require(esm)`, which includes Node 22.12 and later.
  - The minimum supported Node version is now 22.12.

  Also new: the `Op` opcode table is now exported, for building and reading raw patches.

# 📓 Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.0.8](https://github.com/sanity-io/mendoza-js/compare/v3.0.7...v3.0.8) (2024-12-04)

### Bug Fixes

- stricter typescript output ([8d27d5b](https://github.com/sanity-io/mendoza-js/commit/8d27d5baee0d79e09836424563c028764a4d2a49))

## [3.0.7](https://github.com/sanity-io/mendoza-js/compare/v3.0.6...v3.0.7) (2024-04-11)

### Bug Fixes

- install snippets in README ([19d0c17](https://github.com/sanity-io/mendoza-js/commit/19d0c171ecb64dde168e812dfad89ec70b349f7f))

## [3.0.6](https://github.com/sanity-io/mendoza-js/compare/v3.0.5...v3.0.6) (2024-03-18)

### Bug Fixes

- **deps:** update dependency @sanity/pkg-utils to ^5.0.4 ([#55](https://github.com/sanity-io/mendoza-js/issues/55)) ([6479553](https://github.com/sanity-io/mendoza-js/commit/64795537dce1367d42001cb0a23ff7ae37ac05f7))

## [3.0.5](https://github.com/sanity-io/mendoza-js/compare/v3.0.4...v3.0.5) (2024-02-26)

### Bug Fixes

- **deps:** update dependency @sanity/pkg-utils to ^4.3.0 ([#32](https://github.com/sanity-io/mendoza-js/issues/32)) ([b10eb77](https://github.com/sanity-io/mendoza-js/commit/b10eb7770335e678f3621bc7ce2937421b9b2ac1))

## [3.0.4](https://github.com/sanity-io/mendoza-js/compare/v3.0.3...v3.0.4) (2024-01-25)

### Bug Fixes

- **deps:** update dependency typescript to ^5.3.3 ([#25](https://github.com/sanity-io/mendoza-js/issues/25)) ([ab0d3db](https://github.com/sanity-io/mendoza-js/commit/ab0d3db68cdbec36576fb3b8372d9ee36ae8e083))

## [3.0.3](https://github.com/sanity-io/mendoza-js/compare/v3.0.2...v3.0.3) (2023-08-04)

### Bug Fixes

- don't use TS private class fields ([7ca1455](https://github.com/sanity-io/mendoza-js/commit/7ca145567e9ccdb73522072bea5197257b5ceb11))
- Next.js build issue with the `SimpleModel` instance ([393f721](https://github.com/sanity-io/mendoza-js/commit/393f7218d1fb77188d253e62e4ccedde681815ca))

## [3.0.2](https://github.com/sanity-io/mendoza-js/compare/v3.0.1...v3.0.2) (2023-08-04)

### Bug Fixes

- don't use TS private class fields ([65bba5a](https://github.com/sanity-io/mendoza-js/commit/65bba5ac3da5e771438c5f7d3228f726333b62dc))

## [3.0.1](https://github.com/sanity-io/mendoza-js/compare/v3.0.0...v3.0.1) (2023-08-04)

### Bug Fixes

- solve issue affecting Next.js and swcMinify in production ([7b4c271](https://github.com/sanity-io/mendoza-js/commit/7b4c2716dc4025b61738d6bdf5a12183b5cb360f))

## [3.0.0](https://github.com/sanity-io/mendoza-js/compare/v2.1.2...v3.0.0) (2023-08-04)

### ⚠ BREAKING CHANGES

- export modern ESM and CJS syntax
- bump minimum required node to v14.18

### Features

- export modern ESM and CJS syntax ([53c36bf](https://github.com/sanity-io/mendoza-js/commit/53c36bf9193e6c5bea0c24289b9189de27f5d78e))

### Bug Fixes

- bump minimum required node to v14.18 ([f351fc1](https://github.com/sanity-io/mendoza-js/commit/f351fc15e0fa55267305a918d065324754cd798e))

## [2.1.2](https://github.com/sanity-io/mendoza-js/compare/v2.1.1...v2.1.2) (2023-08-04)

### Bug Fixes

- setup release automation and provenance ([14d24c7](https://github.com/sanity-io/mendoza-js/commit/14d24c7bf51660848519f9964673fd694e161654))
