export interface InfiniteScrollOptions {
  /** Pixels from the bottom to trigger callback. Default: 200. */
  threshold?: number
  /** CSS class for the sentinel element. Default: 'infinite-scroll-sentinel'. */
  sentinel?: string
}

export class InfiniteScroll {
  constructor(
    container: HTMLElement,
    callback: () => void | Promise<void>,
    options?: InfiniteScrollOptions,
  )
  updateSentinelPosition(top: number): void
  setLoading(value: boolean): void
  destroy(): void
}
