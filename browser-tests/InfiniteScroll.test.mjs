import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { chromium, firefox, webkit } from 'playwright'

const browsers = { chromium, firefox, webkit }
const names = (process.env.INFINITE_SCROLL_BROWSERS ?? 'chromium').split(',')
let server
let url

before(async () => {
  const routes = new Map(await Promise.all([
    ['/browser-tests/fixture.html', 'text/html'],
    ['/browser-tests/fixture.js', 'text/javascript'],
    ['/src/index.js', 'text/javascript'],
    ['/src/InfiniteScroll.js', 'text/javascript'],
  ].map(async ([path, type]) => [path, { type, body: await readFile(new URL(`..${path}`, import.meta.url)) }])))
  server = createServer((request, response) => {
    const route = routes.get(request.url)
    response.writeHead(route ? 200 : 404, {
      'Content-Type': route?.type ?? 'text/plain',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    })
    response.end(route?.body ?? 'Not found')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  url = `http://127.0.0.1:${server.address().port}/browser-tests/fixture.html`
})

after(async () => {
  if (server?.listening) {
    const closed = once(server, 'close')
    server.close()
    await closed
  }
})

for (const name of names) {
  if (!browsers[name]) throw new Error(`Unknown browser: ${name}`)
  describe(name, () => {
    let browser

    before(async () => {
      const options = { headless: true }
      if (name === 'chromium' && process.env.INFINITE_SCROLL_CHROMIUM_EXECUTABLE) {
        options.executablePath = process.env.INFINITE_SCROLL_CHROMIUM_EXECUTABLE
        options.args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      }
      if (name === 'firefox' && process.env.INFINITE_SCROLL_FIREFOX_DISABLE_SANDBOX === '1') {
        options.env = { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1' }
      }
      if (name === 'webkit' && process.env.INFINITE_SCROLL_WEBKIT_EXECUTABLE) {
        options.executablePath = process.env.INFINITE_SCROLL_WEBKIT_EXECUTABLE
        const bin = dirname(options.executablePath)
        options.env = {
          ...process.env,
          WEBKIT_EXEC_PATH: bin,
          WEBKIT_INJECTED_BUNDLE_PATH: resolve(bin, '../lib'),
          WEBKIT_INSPECTOR_RESOURCES_PATH: resolve(bin, '../share'),
          LD_LIBRARY_PATH: process.env.INFINITE_SCROLL_WEBKIT_LIBRARY_PATH ?? process.env.LD_LIBRARY_PATH ?? '',
        }
      }
      browser = await browsers[name].launch(options)
      console.log(`Browser under test: ${name} ${browser.version()}`)
    })

    after(async () => { await browser?.close() })

    async function check(run) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
      page.setDefaultTimeout(5000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      try {
        await page.goto(url)
        await page.waitForFunction(() => typeof globalThis.InfiniteScroll === 'function')
        await run(page)
        await page.evaluate(() => nextFrames())
        assert.deepEqual(errors, [], 'No uncaught browser errors or promise rejections')
        assert.deepEqual(await page.evaluate(() => policyViolations), [])
      } finally {
        await page.close()
      }
    }

    test('scrolling loads successive pages, keeps the sentinel last and stops at the end', async () => {
      await check(async page => {
        await page.evaluate(() => {
          globalThis.feed = document.createElement('section')
          document.body.appendChild(feed)
          addItem(feed, 1400)
          globalThis.loads = 0
          globalThis.controller = new InfiniteScroll(feed, () => {
            loads += 1
            addItem(feed, 900)
            return loads < 3
          }, { threshold: 100 })
          watchSentinel(feed)
        })
        await page.waitForFunction(() => intersections.at(-1) === false)
        for (let expected = 1; expected <= 3; expected += 1) {
          await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
          await page.waitForFunction(count => loads === count, expected)
          assert.equal(await page.evaluate(() => feed.lastElementChild.className), 'infinite-scroll-sentinel')
          await page.waitForFunction(() => intersections.at(-1) === false)
        }
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
        await page.waitForFunction(() => intersections.at(-1) === true)
        await page.evaluate(() => nextFrames())
        assert.equal(await page.evaluate(() => loads), 3)
        await page.evaluate(() => controller.destroy())
      })
    })

    test('keeps the sentinel after text-only content appended by the callback', async () => {
      await check(async page => {
        await page.evaluate(() => {
          globalThis.feed = document.createElement('section')
          feed.style.cssText = 'width:320px;font:16px/20px monospace'
          document.body.appendChild(feed)
          addItem(feed, 1400)
          globalThis.loads = 0
          globalThis.textNode = document.createTextNode('Text-only page content. '.repeat(100))
          globalThis.controller = new InfiniteScroll(feed, () => {
            loads += 1
            feed.appendChild(textNode)
            return false
          }, { threshold: 100 })
          globalThis.sentinel = feed.lastElementChild
          watchSentinel(feed)
        })
        await page.waitForFunction(() => intersections.at(-1) === false)
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
        await page.waitForFunction(() => loads === 1)
        const result = await page.evaluate(() => {
          const range = document.createRange()
          range.selectNodeContents(textNode)
          return {
            sentinelLast: feed.lastChild === sentinel,
            sentinelTop: sentinel.getBoundingClientRect().top,
            textBottom: range.getBoundingClientRect().bottom,
          }
        })
        assert.equal(result.sentinelLast, true, 'The sentinel must follow all content, including text nodes')
        assert.ok(result.sentinelTop >= result.textBottom, 'The sentinel must be below the rendered text')
        await page.evaluate(() => controller.destroy())
      })
    })

    test('a sentinel that stays visible does not create an automatic request loop', async () => {
      await check(async page => {
        await page.evaluate(() => {
          globalThis.feed = document.createElement('section')
          document.body.appendChild(feed)
          globalThis.loads = 0
          globalThis.controller = new InfiniteScroll(feed, () => {
            loads += 1
            addItem(feed, 10)
          })
        })
        await page.waitForFunction(() => loads === 1)
        await page.evaluate(() => nextFrames())
        assert.equal(await page.evaluate(() => loads), 1)
        await page.evaluate(() => controller.destroy())
      })
    })

    test('repeated intersections during a pending load never start concurrent requests', async () => {
      await check(async page => {
        await page.evaluate(() => {
          const feed = document.createElement('section')
          document.body.appendChild(feed)
          addItem(feed, 1400)
          globalThis.loads = 0
          globalThis.activeLoads = 0
          globalThis.maxActiveLoads = 0
          globalThis.release = undefined
          globalThis.controller = new InfiniteScroll(feed, async () => {
            loads += 1
            activeLoads += 1
            maxActiveLoads = Math.max(maxActiveLoads, activeLoads)
            if (loads === 1) await new Promise(resolve => { globalThis.release = resolve })
            activeLoads -= 1
            return loads < 2
          }, { threshold: 100 })
          watchSentinel(feed)
        })
        await page.waitForFunction(() => intersections.at(-1) === false)
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
        await page.waitForFunction(() => loads === 1 && intersections.at(-1) === true)
        for (let crossing = 0; crossing < 8; crossing += 1) {
          await page.evaluate(() => scrollTo(0, 0))
          await page.waitForFunction(() => intersections.at(-1) === false)
          await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
          await page.waitForFunction(() => intersections.at(-1) === true)
        }
        await page.evaluate(() => release())
        await page.waitForFunction(() => activeLoads === 0)
        await page.evaluate(() => nextFrames())
        assert.deepEqual(await page.evaluate(() => ({ loads, maxActiveLoads })), { loads: 1, maxActiveLoads: 1 })
        await page.evaluate(() => scrollTo(0, 0))
        await page.waitForFunction(() => intersections.at(-1) === false)
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
        await page.waitForFunction(() => loads === 2)
        assert.equal(await page.evaluate(() => maxActiveLoads), 1)
        await page.evaluate(() => controller.destroy())
      })
    })

    test('an explicit pause and resume during a pending load is honored after it settles', async () => {
      await check(async page => {
        await page.evaluate(() => {
          const feed = document.createElement('section')
          document.body.appendChild(feed)
          globalThis.loads = 0
          globalThis.release = undefined
          globalThis.controller = new InfiniteScroll(feed, () => {
            loads += 1
            if (loads === 1) return new Promise(resolve => { globalThis.release = resolve })
            return false
          })
        })
        await page.waitForFunction(() => loads === 1)
        await page.evaluate(() => {
          controller.setLoading(true)
          controller.setLoading(false)
        })
        await page.evaluate(() => nextFrames())
        assert.equal(await page.evaluate(() => loads), 1, 'Pending loads must not overlap')
        await page.evaluate(() => release())
        await page.waitForFunction(() => loads === 2)
        await page.evaluate(() => controller.destroy())
      })
    })

    test('destroying a pending load removes its sentinel and cannot reattach it on rejection', async () => {
      await check(async page => {
        await page.evaluate(() => {
          globalThis.feed = document.createElement('section')
          document.body.appendChild(feed)
          addItem(feed, 20)
          globalThis.errors = []
          globalThis.rejectLoad = undefined
          globalThis.controller = new InfiniteScroll(feed, () => new Promise((resolve, reject) => {
            globalThis.rejectLoad = reject
          }), { onError: error => errors.push(error.message) })
        })
        await page.waitForFunction(() => typeof rejectLoad === 'function')
        await page.evaluate(() => {
          controller.destroy()
          controller.destroy()
          rejectLoad(new Error('late load failure'))
        })
        await page.waitForFunction(() => errors.length === 1)
        assert.deepEqual(await page.evaluate(() => ({
          errors, items: feed.children.length, sentinels: document.querySelectorAll('.infinite-scroll-sentinel').length,
        })), { errors: ['late load failure'], items: 1, sentinels: 0 })
      })
    })

    for (const asynchronous of [false, true]) {
      test(`${asynchronous ? 'rejected' : 'throwing'} error handlers do not leak unhandled rejections`, async () => {
        await check(async page => {
          await page.evaluate(asyncHandler => {
            const feed = document.createElement('section')
            document.body.appendChild(feed)
            globalThis.handled = []
            const fail = error => {
              handled.push(error.message)
              throw new Error('error handler failure')
            }
            globalThis.controller = new InfiniteScroll(feed, () => {
              throw new Error('load failure')
            }, { onError: asyncHandler ? async error => fail(error) : fail })
          }, asynchronous)
          await page.waitForFunction(() => handled.length === 1)
          assert.deepEqual(await page.evaluate(() => handled), ['load failure'])
          await page.evaluate(() => controller.destroy())
        })
      })
    }

    test('accepts an HTMLElement from a same-origin iframe and observes its viewport', async () => {
      await check(async page => {
        await page.evaluate(async () => {
          const frame = document.createElement('iframe')
          frame.style.cssText = 'width:400px;height:240px;border:0'
          const loaded = new Promise(resolve => { frame.onload = resolve })
          frame.src = 'about:blank'
          document.body.appendChild(frame)
          await loaded
          globalThis.frameWindow = frame.contentWindow
          const feed = frame.contentDocument.createElement('section')
          frame.contentDocument.body.appendChild(feed)
          addItem(feed, 1400)
          globalThis.loads = 0
          globalThis.controller = new InfiniteScroll(feed, () => { loads += 1; return false }, { threshold: 0 })
          globalThis.sentinelDocumentMatches = feed.lastElementChild.ownerDocument === frame.contentDocument
        })
        await page.evaluate(() => nextFrames())
        assert.equal(await page.evaluate(() => loads), 0)
        assert.equal(await page.evaluate(() => sentinelDocumentMatches), true)
        await page.evaluate(() => frameWindow.scrollTo(0, frameWindow.document.body.scrollHeight))
        await page.waitForFunction(() => loads === 1)
        await page.evaluate(() => controller.destroy())
      })
    })

    test('accepts an HTMLElement adopted into a same-origin iframe and observes its current viewport', async () => {
      await check(async page => {
        await page.evaluate(async () => {
          const frame = document.createElement('iframe')
          frame.style.cssText = 'width:400px;height:240px;border:0'
          const loaded = new Promise(resolve => { frame.onload = resolve })
          frame.src = 'about:blank'
          document.body.appendChild(frame)
          await loaded
          globalThis.frameWindow = frame.contentWindow
          const feed = document.createElement('section')
          frame.contentDocument.body.appendChild(feed)
          addItem(feed, 1400)
          globalThis.loads = 0
          globalThis.controller = new InfiniteScroll(feed, () => { loads += 1; return false }, { threshold: 0 })
          globalThis.sentinelDocumentMatches = feed.lastElementChild.ownerDocument === frame.contentDocument
        })
        await page.evaluate(() => nextFrames())
        assert.equal(await page.evaluate(() => loads), 0)
        assert.equal(await page.evaluate(() => sentinelDocumentMatches), true)
        await page.evaluate(() => frameWindow.scrollTo(0, frameWindow.document.body.scrollHeight))
        await page.waitForFunction(() => loads === 1)
        await page.evaluate(() => controller.destroy())
      })
    })

    test('accepts finite fractional and large preloading distances', async () => {
      await check(async page => {
        const errors = await page.evaluate(() => {
          const errors = []
          const feed = document.createElement('section')
          document.body.appendChild(feed)
          for (const threshold of [1e-7, 1e21]) {
            try {
              new InfiniteScroll(feed, () => false, { threshold }).destroy()
            } catch (error) {
              errors.push({ threshold, message: error.message })
            }
          }
          return errors
        })
        assert.deepEqual(errors, [])
      })
    })

    test('absolute-positioned sentinels follow updated layout heights', async () => {
      await check(async page => {
        await page.evaluate(() => {
          globalThis.feed = document.createElement('section')
          feed.style.cssText = 'position:relative;height:1400px'
          document.body.appendChild(feed)
          globalThis.loads = 0
          globalThis.height = 1400
          globalThis.controller = new InfiniteScroll(feed, () => {
            loads += 1
            height += 900
            feed.style.height = `${height}px`
            controller.updateSentinelPosition(height)
            return loads < 2
          }, { threshold: 100 })
          controller.updateSentinelPosition(height)
          watchSentinel(feed)
        })
        await page.waitForFunction(() => intersections.at(-1) === false)
        for (let expected = 1; expected <= 2; expected += 1) {
          await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
          await page.waitForFunction(count => loads === count, expected)
          await page.waitForFunction(() => intersections.at(-1) === false)
        }
        assert.equal(await page.evaluate(() => feed.lastElementChild.style.top), '3200px')
        await page.evaluate(() => controller.destroy())
      })
    })

    test('loads at the visible boundary of a nested scroll container', async () => {
      await check(async page => {
        await page.evaluate(() => {
          globalThis.scroller = document.createElement('div')
          scroller.style.cssText = 'height:320px;overflow:auto'
          const feed = document.createElement('section')
          scroller.appendChild(feed)
          document.body.appendChild(scroller)
          addItem(feed, 800)
          globalThis.loads = 0
          globalThis.controller = new InfiniteScroll(feed, () => { loads += 1; return false })
        })
        await page.evaluate(() => nextFrames())
        assert.equal(await page.evaluate(() => loads), 0)
        await page.evaluate(() => { scroller.scrollTop = scroller.scrollHeight })
        await page.waitForFunction(() => loads === 1)
        await page.evaluate(() => controller.destroy())
      })
    })

    test('repeated teardown disconnects observers and preserves content under strict CSP', async context => {
      await check(async page => {
        const result = await page.evaluate(() => {
          const feed = document.createElement('section')
          document.body.appendChild(feed)
          const content = document.createElement('article')
          content.textContent = '<img src=x onerror=alert(1)>'
          feed.appendChild(content)
          const activeObservers = new Set()
          const NativeObserver = IntersectionObserver
          globalThis.IntersectionObserver = class extends NativeObserver {
            constructor(...args) { super(...args); activeObservers.add(this) }
            disconnect() { super.disconnect(); activeObservers.delete(this) }
          }
          const started = performance.now()
          for (let cycle = 0; cycle < 500; cycle += 1) {
            const controller = new InfiniteScroll(feed, () => false, { sentinel: '<img src=x onerror=alert(1)>' })
            controller.destroy()
            controller.destroy()
          }
          const elapsedMilliseconds = performance.now() - started
          globalThis.IntersectionObserver = NativeObserver
          return {
            children: feed.children.length,
            content: feed.textContent,
            images: feed.querySelectorAll('img').length,
            observers: activeObservers.size,
            elapsedMilliseconds,
          }
        })
        const { elapsedMilliseconds, ...state } = result
        assert.deepEqual(state, {
          children: 1, content: '<img src=x onerror=alert(1)>', images: 0, observers: 0,
        })
        context.diagnostic(`500 create/destroy cycles: ${elapsedMilliseconds.toFixed(1)} ms; no remaining sentinels or observers`)
      })
    })
  })
}
