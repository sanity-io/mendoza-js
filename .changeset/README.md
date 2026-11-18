# Changesets

This folder is used by [changesets](https://github.com/changesets/changesets) to track upcoming
releases. Changeset files are normally generated automatically from the PR title by the
`generate-changeset` workflow, so you usually don't need to add one yourself.

To add one manually:

```sh
pnpm changeset
```

Merging the "Version Packages" PR on `main` publishes a new release to npm.
