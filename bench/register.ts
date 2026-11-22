// @env node
import {registerHooks} from 'node:module'

// The source uses extensionless relative imports (resolved by TypeScript and tsdown), which
// Node.js type stripping can't resolve on its own. Benchmarking the source directly means we
// don't need a build step between edits.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
    const hasExtension = /\.[cm]?[jt]s$/.test(specifier)
    if (isRelative && !hasExtension && context.parentURL?.endsWith('.ts')) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})
