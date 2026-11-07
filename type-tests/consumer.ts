import { InfiniteScroll, type InfiniteScrollOptions } from '@shelamkoff/infinite-scroll'

const container = document.createElement('section')
const options: InfiniteScrollOptions = {
  threshold: 400,
  sentinel: 'feed-sentinel',
  onError(error) {
    if (error instanceof Error) console.error(error.message)
  },
}

const scroll = new InfiniteScroll(container, () => {}, options)
new InfiniteScroll(container, () => false)
new InfiniteScroll(container, async () => true)
new InfiniteScroll(container, async () => {})
new InfiniteScroll(container, () => {}, {
  async onError(error) {
    if (error instanceof Error) await Promise.resolve(error.message)
  },
})
scroll.setLoading(true)
scroll.setLoading(false)
scroll.updateSentinelPosition(300.5)
scroll.destroy()

// @ts-expect-error The container must be an HTML element.
new InfiniteScroll({}, () => {})
// @ts-expect-error A loading callback is required.
new InfiniteScroll(container, null)
// @ts-expect-error Callback results must be boolean or void.
new InfiniteScroll(container, () => 'more')
// @ts-expect-error Promise results follow the same callback contract.
new InfiniteScroll(container, async () => 1)
// @ts-expect-error Preload distance is a number, not a CSS length.
new InfiniteScroll(container, () => {}, { threshold: '200px' })
// @ts-expect-error The sentinel option names a CSS class.
new InfiniteScroll(container, () => {}, { sentinel: container })
// @ts-expect-error An error handler must be callable.
new InfiniteScroll(container, () => {}, { onError: true })
// @ts-expect-error Loading state accepts a boolean.
scroll.setLoading('false')
// @ts-expect-error Sentinel coordinates are numeric.
scroll.updateSentinelPosition('100px')
