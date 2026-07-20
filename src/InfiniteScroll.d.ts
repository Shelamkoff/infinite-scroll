export interface InfiniteScrollOptions {
  /** Pixels from the bottom to trigger callback. Default: 200. */
  threshold?: number
  /** CSS class for the sentinel element. Default: 'infinite-scroll-sentinel'. */
  sentinel?: string
  /** Receives callback errors. Errors are logged when this handler is omitted. */
  onError?: (error: unknown) => void
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
