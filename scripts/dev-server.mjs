import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)))
const host = process.env.HOST ?? '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '4173', 10)
const requestedEntry = process.argv[2] ?? '/demo.html'
const entryPath = requestedEntry.startsWith('/') ? requestedEntry : `/${requestedEntry}`

if (!entryPath.endsWith('.html')) throw new TypeError('Demo entry must point to an HTML file')

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
])

function send(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(message)
}

function isWithinRoot(path) {
  const fromRoot = relative(root, path)
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot)
}

async function resolveRequestPath(requestUrl) {
  let pathname
  try {
    const url = new URL(requestUrl ?? '/', 'http://localhost')
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }

  if (pathname === '/') pathname = entryPath
  const candidate = resolve(root, `.${pathname}`)
  if (!isWithinRoot(candidate)) return null

  try {
    let filePath = await realpath(candidate)
    if (!isWithinRoot(filePath)) return null
    let info = await stat(filePath)
    if (info.isDirectory()) {
      filePath = await realpath(join(filePath, 'index.html'))
      if (!isWithinRoot(filePath)) return null
      info = await stat(filePath)
    }
    return info.isFile() ? filePath : null
  } catch {
    return null
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Method not allowed')
    return
  }

  const filePath = await resolveRequestPath(request.url)
  if (!filePath) {
    send(response, 404, 'Not found')
    return
  }

  const headers = {
    'Content-Type': contentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (request.method === 'HEAD') {
    response.writeHead(200, headers)
    response.end()
    return
  }
  const stream = createReadStream(filePath)
  stream.on('error', () => {
    if (response.headersSent) response.destroy()
    else send(response, 404, 'Not found')
  })
  response.on('close', () => stream.destroy())
  stream.on('open', () => {
    response.writeHead(200, headers)
    stream.pipe(response)
  })
})

server.on('error', error => {
  console.error(error.message)
  process.exitCode = 1
})

server.listen(port, host, () => {
  const listeningPort = server.address().port
  console.log(`Infinite Scroll demo: http://${host}:${listeningPort}${entryPath}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit()))
}
