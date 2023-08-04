import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  tsconfig: 'tsconfig.dist.json',
  extract: {
    rules: {
      'ae-missing-release-tag': 'off',
    },
  },
})
