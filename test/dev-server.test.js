import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'

const source = new URL('../scripts/dev-server.mjs', import.meta.url)

async function startServer(t) {
  const fixture = await mkdtemp(join(tmpdir(), 'infinite-scroll-server-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  const root = join(fixture, 'site')
  await mkdir(join(root, 'scripts'), { recursive: true })
  await mkdir(join(root, 'empty'))
  await mkdir(join(root, 'docs'))
  await copyFile(source, join(root, 'scripts/dev-server.mjs'))
  await writeFile(join(root, 'demo.html'), '<h1>Demo</h1>')
  await writeFile(join(root, 'docs/index.html'), '<h1>Docs</h1>')
  await writeFile(join(fixture, 'outside.txt'), 'outside project root')

  const child = spawn(process.execPath, [join(root, 'scripts/dev-server.mjs')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stopped = once(child, 'exit')
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await stopped
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', data => { stderr += data })
  const lines = createInterface({ input: child.stdout })
  const [line] = await Promise.race([
    once(lines, 'line'),
    stopped.then(() => { throw new Error(`Demo server exited during startup: ${stderr}`) }),
  ])
  lines.close()
  const port = Number(line.match(/http:\/\/127\.0\.0\.1:(\d+)\//)?.[1])
  assert.ok(port > 0, 'Demo URL must contain the actual listening port')

  function request(path, method = 'GET') {
    return new Promise((resolve, reject) => {
      const req = get({ hostname: '127.0.0.1', port, path, method }, response => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', data => { body += data })
        response.on('error', reject)
        response.on('end', () => resolve({ status: response.statusCode, body }))
      })
      req.on('error', reject)
    })
  }
  return { fixture, root, request }
}

test('demo server returns 404 for directories without an index and stays available', { timeout: 10_000 }, async t => {
  const { request } = await startServer(t)
  assert.equal((await request('/empty/', 'HEAD')).status, 404)
  assert.equal((await request('/empty/')).status, 404)
  assert.deepEqual(await request('/'), { status: 200, body: '<h1>Demo</h1>' })
  assert.deepEqual(await request('/docs/'), { status: 200, body: '<h1>Docs</h1>' })
})

test('demo server rejects invalid URL targets without terminating', { timeout: 10_000 }, async t => {
  const { request } = await startServer(t)
  assert.equal((await request('http://[')).status, 404)
  assert.equal((await request('/bad%ZZ')).status, 404)
  assert.equal((await request('/')).status, 200)
})

test('demo server rejects symbolic links outside its project root', { timeout: 10_000 }, async t => {
  const { fixture, root, request } = await startServer(t)
  await symlink(join(fixture, 'outside.txt'), join(root, 'outside.txt'))
  await symlink(join(fixture, 'outside.txt'), join(root, 'empty/index.html'))
  await symlink(join(root, 'demo.html'), join(root, 'inside.html'))
  assert.equal((await request('/outside.txt')).status, 404)
  assert.equal((await request('/empty/')).status, 404)
  assert.deepEqual(await request('/inside.html'), { status: 200, body: '<h1>Demo</h1>' })
})
