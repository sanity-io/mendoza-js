import {defineConfig} from '@sanity/tsdown-config'

export default defineConfig({
  entry: ['src/index.ts', 'src/incremental.ts'],
  tsconfig: 'tsconfig.dist.json',
})
