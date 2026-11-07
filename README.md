# @shelamkoff/infinite-scroll

A small, framework-agnostic infinite-scroll controller built on
`IntersectionObserver`. It adds one sentinel to your container, prevents
overlapping loads, reports callback failures, and also works with
absolute-positioned layouts.

[Live demo](https://shelamkoff.github.io/infinite-scroll/) ·
[Русская версия](README.ru.md)

## Features

- No scroll event listener
- One in-flight load at a time
- Keeps the generated sentinel after newly appended content
- Configurable preloading distance
- Pause and resume control
- Error callback for failed loads
- Explicit sentinel positioning for masonry-style layouts
- ESM package with TypeScript declarations
- No runtime dependencies

## Install

```bash
npm install @shelamkoff/infinite-scroll
```

## Quick start

```js
import { InfiniteScroll } from '@shelamkoff/infinite-scroll'

const feed = document.querySelector('.feed')

const infiniteScroll = new InfiniteScroll(feed, async () => {
  const items = await fetchNextPage()
  appendItems(feed, items)
}, {
  threshold: 400,
  onError(error) {
    showRetryMessage(error)
  },
})
```

The callback may be synchronous or return a promise. While it is running,
additional intersections are ignored. One callback is made per observer
intersection, so a sentinel that remains visible does not create a request
loop. Return `false` when the end of the list is reached:

```js
const infiniteScroll = new InfiniteScroll(feed, async () => {
  const page = await fetchNextPage()
  appendItems(feed, page.items)
  return page.hasMore
})
```

## API

### `new InfiniteScroll(container, callback, options?)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `threshold` | `number` | `200` | Preload distance below the viewport in pixels |
| `sentinel` | `string` | `infinite-scroll-sentinel` | CSS class assigned to the generated sentinel |
| `onError` | `(error: unknown) => void` | logs to console | Receives callback failures |

`IntersectionObserver` must be available in the container's window or through a
global polyfill. Containers from same-origin iframes are supported: the sentinel
uses the container's document, and the observer uses its window when available.

The observer uses the viewport as its root. An ancestor with `overflow` still
clips intersections, so `threshold` does not add a preload margin inside a
nested scroll container.

### `setLoading(value)`

Pauses loading when `true` and resumes it when `false`.

```js
infiniteScroll.setLoading(true)
infiniteScroll.setLoading(false)
```

Returning `false` from the load callback uses the same paused state. Call
`setLoading(false)` only if new data becomes available later.

If loading is paused and resumed while a callback is still running, the
observer is refreshed after that callback settles. A subsequent pause,
`destroy()`, or a `false` result cancels that pending refresh. Resuming does not
start a concurrent callback.

### Failed loads and retries

`onError` receives synchronous exceptions and rejected load promises. An error
thrown or rejected by `onError` itself is logged without leaving an unhandled
promise rejection. An asynchronous error notification does not block later loads.

The controller does not retry a failure immediately. To retry while the
sentinel is still visible, explicitly pause and resume from your retry action:

```js
retryButton.addEventListener('click', () => {
  infiniteScroll.setLoading(true)
  infiniteScroll.setLoading(false)
})
```

The controller also does not automatically fill a short viewport with repeated
requests. If a small page leaves the sentinel visible, another load needs a new
intersection or an explicit pause/resume. Applications that fill the viewport
should request another check only after confirming that content was appended.

### `updateSentinelPosition(top)`

Use this after laying out an absolute-positioned container:

```js
infiniteScroll.updateSentinelPosition(containerHeight)
```

The container must establish the sentinel's positioning context, typically with
`position: relative`. `top` is a finite, non-negative offset in CSS pixels.

### `destroy()`

Disconnects the observer and removes the generated sentinel. Calling it more
than once is safe. Other instance methods throw after destruction.

An already running callback is not cancelled. The application owns its network
requests and DOM writes: abort outstanding fetches with an `AbortController`, or
ignore their results when the view is disposed. A late callback failure is still
reported through `onError`.

The controller does not retain loaded items, virtualize the feed, or remove old
content. DOM growth and pagination state belong to the application.

## Development

```bash
npm ci
npx playwright install chromium firefox webkit
npm run verify
npm test
npm run demo
```

`verify` checks unit and development-server regressions, strict TypeScript
consumers, an installed npm tarball, and real browser behavior. `prepublishOnly`
runs the same checks. CI checks package consumption on Node.js 20 and 24 and
runs Chromium, Firefox, and WebKit scenarios.

The package targets Node.js 20+ for its development scripts. Runtime code is
browser-native ESM. Importing the module without a DOM is safe; constructing a
controller requires a browser document.

## License

MIT
