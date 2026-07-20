import assert from 'node:assert/strict'
import { test } from 'node:test'
import { InfiniteScroll } from '../src/InfiniteScroll.js'

class FakeElement {
  constructor() {
    this.attributes = new Map()
    this.children = []
    this.className = ''
    this.parentNode = null
    this.style = {}
  }

  appendChild(child) {
    child.parentNode = this
    this.children.push(child)
    return child
  }

  remove() {
    if (!this.parentNode) return
    const index = this.parentNode.children.indexOf(this)
    if (index >= 0) this.parentNode.children.splice(index, 1)
    this.parentNode = null
  }

  setAttribute(name, value) {
    this.attributes.set(name, value)
  }
}

class FakeIntersectionObserver {
  static instances = []

  constructor(callback, options) {
    this.callback = callback
    this.options = options
    this.observed = []
    this.unobserved = []
    this.disconnectCalls = 0
    FakeIntersectionObserver.instances.push(this)
  }

  observe(element) {
    this.observed.push(element)
  }

  unobserve(element) {
    this.unobserved.push(element)
  }

  disconnect() {
    this.disconnectCalls += 1
  }

  intersect(value = true) {
    this.callback([{ isIntersecting: value }])
  }
}

globalThis.HTMLElement = FakeElement
globalThis.document = { createElement: () => new FakeElement() }
globalThis.IntersectionObserver = FakeIntersectionObserver

const flush = () => new Promise(resolve => setImmediate(resolve))

function setup(callback = () => {}, options) {
  FakeIntersectionObserver.instances = []
  const container = new FakeElement()
  const controller = new InfiniteScroll(container, callback, options)
  return {
    container,
    controller,
    observer: FakeIntersectionObserver.instances[0],
    sentinel: container.children[0],
  }
}

test('creates and observes a configured sentinel', () => {
  const { observer, sentinel } = setup(() => {}, {
    threshold: 480,
    sentinel: 'feed-sentinel',
  })

  assert.equal(sentinel.className, 'feed-sentinel')
  assert.equal(sentinel.attributes.get('aria-hidden'), 'true')
  assert.equal(observer.options.rootMargin, '0px 0px 480px 0px')
  assert.deepEqual(observer.observed, [sentinel])
})

test('guards against concurrent callback runs and refreshes afterward', async () => {
  let resolveCallback
  let calls = 0
  const pending = new Promise(resolve => {
    resolveCallback = resolve
  })
  const { observer, sentinel } = setup(async () => {
    calls += 1
    await pending
  })

  observer.intersect()
  observer.intersect()
  await flush()
  assert.equal(calls, 1)

  resolveCallback()
  await flush()
  assert.deepEqual(observer.unobserved, [sentinel])
  assert.equal(observer.observed.length, 2)
})

test('pauses and resumes observation without invoking while paused', async () => {
  let calls = 0
  const { controller, observer } = setup(() => {
    calls += 1
  })

  controller.setLoading(true)
  observer.intersect()
  await flush()
  assert.equal(calls, 0)

  controller.setLoading(false)
  observer.intersect()
  await flush()
  assert.equal(calls, 1)
})

test('does not reconnect after destroy during an in-flight callback', async () => {
  let resolveCallback
  const pending = new Promise(resolve => {
    resolveCallback = resolve
  })
  const { container, controller, observer } = setup(() => pending)

  observer.intersect()
  await flush()
  controller.destroy()
  controller.destroy()
  resolveCallback()
  await flush()

  assert.equal(container.children.length, 0)
  assert.equal(observer.disconnectCalls, 1)
  assert.equal(observer.observed.length, 1)
})

test('routes callback failures to onError and remains usable', async () => {
  const expected = new Error('network')
  const errors = []
  const { observer } = setup(
    () => {
      throw expected
    },
    { onError: error => errors.push(error) },
  )

  observer.intersect()
  await flush()
  assert.deepEqual(errors, [expected])
  assert.equal(observer.observed.length, 2)
})

test('positions the sentinel and rejects invalid public input', () => {
  const { controller, sentinel } = setup()
  controller.updateSentinelPosition(320.5)
  assert.equal(sentinel.style.position, 'absolute')
  assert.equal(sentinel.style.top, '320.5px')

  assert.throws(() => controller.updateSentinelPosition(Number.NaN), RangeError)
  assert.throws(() => controller.setLoading('yes'), TypeError)
  controller.destroy()
  assert.throws(() => controller.updateSentinelPosition(0), /destroyed/)
  assert.throws(() => controller.setLoading(false), /destroyed/)
})

test('validates constructor arguments and environment support', () => {
  assert.throws(() => new InfiniteScroll({}, () => {}), TypeError)
  assert.throws(() => new InfiniteScroll(new FakeElement(), null), TypeError)
  assert.throws(() => setup(() => {}, { threshold: -1 }), RangeError)
  assert.throws(() => setup(() => {}, { threshold: Infinity }), RangeError)
  assert.throws(() => setup(() => {}, { sentinel: ' ' }), TypeError)
  assert.throws(() => setup(() => {}, { onError: true }), TypeError)

  const Observer = globalThis.IntersectionObserver
  delete globalThis.IntersectionObserver
  assert.throws(
    () => new InfiniteScroll(new FakeElement(), () => {}),
    /IntersectionObserver/,
  )
  globalThis.IntersectionObserver = Observer
})
