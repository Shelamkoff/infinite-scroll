import assert from 'node:assert/strict'
import { test } from 'node:test'
import { InfiniteScroll } from '../src/InfiniteScroll.js'

class FakeElement {
  constructor() {
    this.ownerDocument = globalThis.document
    this.nodeType = 1
    this.attributes = new Map()
    this.childNodes = []
    this.className = ''
    this.parentNode = null
    this.style = {}
  }

  appendChild(child) {
    if (child.parentNode) child.remove()
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }

  get lastElementChild() {
    return this.children.at(-1) ?? null
  }

  get children() {
    return this.childNodes.filter(node => node.nodeType === 1)
  }

  get lastChild() {
    return this.childNodes.at(-1) ?? null
  }

  remove() {
    if (!this.parentNode) return
    const index = this.parentNode.childNodes.indexOf(this)
    if (index >= 0) this.parentNode.childNodes.splice(index, 1)
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

test('guards against concurrent callback runs without forcing another intersection', async () => {
  let resolveCallback
  let calls = 0
  const pending = new Promise(resolve => {
    resolveCallback = resolve
  })
  const { observer } = setup(async () => {
    calls += 1
    await pending
  })

  observer.intersect()
  observer.intersect()
  await flush()
  assert.equal(calls, 1)

  resolveCallback()
  await flush()
  assert.deepEqual(observer.unobserved, [])
  assert.equal(observer.observed.length, 1)
})

test('pauses permanently when the callback reports the end of the list', async () => {
  let calls = 0
  const { controller, observer } = setup(() => {
    calls += 1
    return false
  })

  observer.intersect()
  await flush()
  observer.intersect()
  await flush()
  assert.equal(calls, 1)

  controller.setLoading(false)
  observer.intersect()
  await flush()
  assert.equal(calls, 2)
})

test('moves the sentinel behind content appended by the callback', async () => {
  let container
  const item = new FakeElement()
  const result = setup(() => {
    container.appendChild(item)
  })
  container = result.container

  result.observer.intersect()
  await flush()

  assert.deepEqual(container.children, [item, result.sentinel])
  assert.equal(container.lastElementChild, result.sentinel)
})

test('moves the sentinel behind text appended by the callback', async () => {
  const text = {
    nodeType: 3,
    parentNode: null,
    remove: FakeElement.prototype.remove,
  }
  const { controller, observer, container, sentinel } = setup(() => {
    container.appendChild(text)
  })

  observer.intersect()
  await flush()

  assert.deepEqual(container.childNodes, [text, sentinel])
  assert.equal(container.lastChild, sentinel)
  controller.destroy()
  assert.deepEqual(container.childNodes, [text])
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
  assert.equal(observer.observed.length, 1)

  observer.intersect()
  await flush()
  assert.deepEqual(errors, [expected, expected])
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

test('defers an explicit resume until the current callback settles', async () => {
  let resolveCallback
  let calls = 0
  const pending = new Promise(resolve => { resolveCallback = resolve })
  const { controller, observer, sentinel } = setup(() => {
    calls += 1
    return calls === 1 ? pending : undefined
  })

  observer.intersect()
  controller.setLoading(true)
  controller.setLoading(false)
  observer.intersect()
  assert.equal(calls, 1)
  assert.equal(observer.observed.length, 1)

  resolveCallback()
  await flush()
  assert.deepEqual(observer.unobserved, [sentinel])
  assert.equal(observer.observed.length, 2)
  observer.intersect()
  await flush()
  assert.equal(calls, 2)
  controller.destroy()
})

for (const stop of ['pause', 'end', 'destroy']) {
  test(`does not apply a deferred resume after ${stop}`, async () => {
    let resolveCallback
    const pending = new Promise(resolve => { resolveCallback = resolve })
    const { controller, observer } = setup(() => pending)
    observer.intersect()
    controller.setLoading(true)
    controller.setLoading(false)
    if (stop === 'pause') controller.setLoading(true)
    if (stop === 'destroy') controller.destroy()

    resolveCallback(stop === 'end' ? false : undefined)
    await flush()
    assert.deepEqual(observer.unobserved, [])
    assert.equal(observer.observed.length, 1)
    controller.destroy()
  })
}

test('honors an explicit retry requested by onError', async () => {
  let calls = 0
  const { controller, observer, sentinel } = setup(() => {
    calls += 1
    if (calls === 1) throw new Error('load failed')
  }, {
    onError() {
      controller.setLoading(true)
      controller.setLoading(false)
    },
  })

  observer.intersect()
  await flush()
  assert.deepEqual(observer.unobserved, [sentinel])
  observer.intersect()
  await flush()
  assert.equal(calls, 2)
  controller.destroy()
})

for (const asynchronous of [false, true]) {
  test(`contains ${asynchronous ? 'asynchronous' : 'synchronous'} onError failures and releases the load guard`, async t => {
    const loadError = new Error('load failed')
    const handlerError = new Error('error handler failed')
    const logged = t.mock.method(console, 'error', () => {})
    let calls = 0
    const { controller, observer } = setup(() => {
      calls += 1
      if (calls === 1) throw loadError
    }, {
      onError(error) {
        assert.equal(error, loadError)
        if (asynchronous) return Promise.reject(handlerError)
        throw handlerError
      },
    })

    observer.intersect()
    await flush()
    assert.equal(logged.mock.callCount(), 1)
    assert.equal(logged.mock.calls[0].arguments[1], handlerError)
    observer.intersect()
    await flush()
    assert.equal(calls, 2)
    controller.destroy()
  })
}

test('does not let a pending error notification block later loads', async () => {
  let resolveNotification
  const notification = new Promise(resolve => { resolveNotification = resolve })
  let calls = 0
  const { controller, observer } = setup(() => {
    calls += 1
    if (calls === 1) throw new Error('load failed')
  }, { onError: () => notification })

  observer.intersect()
  await flush()
  observer.intersect()
  await flush()
  assert.equal(calls, 2)
  resolveNotification()
  controller.destroy()
})

for (const phase of ['constructor', 'observe']) {
  test(`rolls back DOM and observation when observer ${phase} fails`, t => {
    const expected = new Error(`observer ${phase} failed`)
    const originalObserver = globalThis.IntersectionObserver
    t.after(() => { globalThis.IntersectionObserver = originalObserver })
    FakeIntersectionObserver.instances = []
    globalThis.IntersectionObserver = class extends FakeIntersectionObserver {
      constructor(...args) {
        super(...args)
        if (phase === 'constructor') throw expected
      }

      observe(element) {
        super.observe(element)
        throw expected
      }
    }
    const container = new FakeElement()
    const existingItem = new FakeElement()
    container.appendChild(existingItem)

    assert.throws(() => new InfiniteScroll(container, () => {}), error => error === expected)
    assert.deepEqual(container.children, [existingItem])
    if (phase === 'observe') {
      assert.equal(FakeIntersectionObserver.instances[0].disconnectCalls, 1)
    }
  })
}

test('uses the container document and browser realm', () => {
  class OtherElement {
    constructor() {
      this.ownerDocument = otherDocument
      this.nodeType = 1
      this.attributes = new Map()
      this.childNodes = []
      this.parentNode = null
      this.style = {}
    }
  }
  for (const property of ['appendChild', 'remove', 'setAttribute', 'children', 'lastChild', 'lastElementChild']) {
    Object.defineProperty(OtherElement.prototype, property,
      Object.getOwnPropertyDescriptor(FakeElement.prototype, property))
  }
  class OtherObserver extends FakeIntersectionObserver {}
  const otherDocument = {
    defaultView: { HTMLElement: OtherElement, IntersectionObserver: OtherObserver },
    createElement: () => new OtherElement(),
  }
  const container = new OtherElement()
  const controller = new InfiniteScroll(container, () => {})

  assert.equal(container.children.length, 1)
  assert.equal(container.children[0].ownerDocument, otherDocument)
  assert.ok(FakeIntersectionObserver.instances.at(-1) instanceof OtherObserver)
  controller.destroy()
  assert.equal(container.children.length, 0)
})

test('supports a global observer polyfill when the container window has none', () => {
  const ownerDocument = {
    defaultView: { HTMLElement: FakeElement },
    createElement() {
      const element = new FakeElement()
      element.ownerDocument = ownerDocument
      return element
    },
  }
  const container = ownerDocument.createElement('section')
  const controller = new InfiniteScroll(container, () => {})

  assert.equal(container.lastChild.ownerDocument, ownerDocument)
  assert.ok(FakeIntersectionObserver.instances.at(-1) instanceof FakeIntersectionObserver)
  controller.destroy()
  assert.equal(container.children.length, 0)
})
