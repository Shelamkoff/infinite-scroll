import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this check with npm run test:package')
const directory = await mkdtemp(join(tmpdir(), 'infinite-scroll-package-'))

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Package check failed (${result.status}):\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout
}

try {
  run(process.execPath, [npm, 'run', 'build'])
  const [pack] = JSON.parse(run(process.execPath, [
    npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory,
  ]))
  const names = pack.files.map(file => file.path)
  for (const required of [
    'dist/src/index.js', 'dist/src/index.d.ts',
    'dist/src/InfiniteScroll.js', 'dist/src/InfiniteScroll.d.ts',
    'README.md', 'README.ru.md', 'LICENSE', 'package.json',
  ]) {
    assert.ok(names.includes(required), `${required} is missing from the package`)
  }
  assert.ok(names.every(name => name.startsWith('dist/')
    || ['package.json', 'README.md', 'README.ru.md', 'LICENSE'].includes(name)))

  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  // Installing the tarball with scripts disabled verifies the distributed files,
  // independently of the repository and without build tools in the consumer.
  run(process.execPath, [
    npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    join(directory, pack.filename),
  ], directory)
  await cp(join(root, 'package-tests/consumer.mjs'), join(directory, 'consumer.mjs'))
  console.log(run(process.execPath, ['consumer.mjs'], directory).trim())
  await cp(join(root, 'type-tests/consumer.ts'), join(directory, 'consumer.ts'))
  await cp(join(root, 'type-tests/tsconfig.json'), join(directory, 'tsconfig.json'))
  console.log(run(process.execPath, [join(root, 'scripts/check-types.mjs'), join(directory, 'tsconfig.json')]).trim())
  const installed = JSON.parse(await readFile(join(directory, 'node_modules/@shelamkoff/infinite-scroll/package.json'), 'utf8'))
  assert.equal(installed.version, pack.version)
  console.log(`Package verified: ${pack.filename}; ${names.length} files; ${pack.size} bytes packed; ${pack.unpackedSize} bytes unpacked`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
