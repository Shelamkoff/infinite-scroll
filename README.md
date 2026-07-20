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
additional intersections are ignored. After it settles, the observer is
refreshed so loading can continue even when the sentinel remains visible.

## API

### `new InfiniteScroll(container, callback, options?)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `threshold` | `number` | `200` | Preload distance below the viewport in pixels |
| `sentinel` | `string` | `infinite-scroll-sentinel` | CSS class assigned to the generated sentinel |
| `onError` | `(error: unknown) => void` | logs to console | Receives callback failures |

The browser must support `IntersectionObserver`.

### `setLoading(value)`

Pauses loading when `true` and resumes it when `false`.

```js
infiniteScroll.setLoading(true)
infiniteScroll.setLoading(false)
```

### `updateSentinelPosition(top)`

Use this after laying out an absolute-positioned container:

```js
infiniteScroll.updateSentinelPosition(containerHeight)
```

### `destroy()`

Disconnects the observer and removes the generated sentinel. Calling it more
than once is safe. Other instance methods throw after destruction.

## Development

```bash
npm test
npm run build
npm run demo
```

The package targets Node.js 20+ for its development scripts. Runtime code is
browser-native ESM.

## License

MIT
