// @env node
import {parseArgs} from 'node:util'
import {run} from 'mitata'

import './simple-patcher'
import './incremental-patcher'

const {values, positionals} = parseArgs({
  allowPositionals: true,
  options: {json: {type: 'boolean', default: false}},
})

const [filter] = positionals

await run({
  filter: filter ? new RegExp(filter, 'i') : undefined,
  format: values.json ? 'json' : 'mitata',
})
