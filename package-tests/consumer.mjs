import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { InfiniteScroll } from '@shelamkoff/infinite-scroll'

assert.equal(typeof InfiniteScroll, 'function')
assert.equal(typeof globalThis.document, 'undefined')
assert.throws(() => new InfiniteScroll(null, () => {}), TypeError)

const manifest = JSON.parse(readFileSync(
  createRequire(import.meta.url).resolve('@shelamkoff/infinite-scroll/package.json'),
  'utf8',
))
assert.equal(manifest.name, '@shelamkoff/infinite-scroll')
assert.equal(manifest.type, 'module')
console.log('Installed ESM exports passed; importing is safe without a browser document')
