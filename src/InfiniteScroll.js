/**
 * Infinite-scroll controller backed by IntersectionObserver.
 *
 * The controller appends an invisible sentinel to the container and invokes
 * the callback when that sentinel approaches the viewport.
 */
export class InfiniteScroll {
  /** @type {HTMLElement} */
  #sentinel

  /** @type {IntersectionObserver} */
  #observer

  /** @type {boolean} */
  #inFlight = false

  /** @type {boolean} */
  #paused = false

  /** @type {boolean} */
  #destroyed = false

  /** @type {() => void | Promise<void>} */
  #callback

  /** @type {((error: unknown) => void) | undefined} */
  #onError

  /**
   * @param {HTMLElement} container
   * @param {() => void | Promise<void>} callback
   * @param {{
   *   threshold?: number,
   *   sentinel?: string,
   *   onError?: (error: unknown) => void
   * }} [options]
   */
  constructor(container, callback, options = {}) {
    if (typeof HTMLElement === 'undefined' || !(container instanceof HTMLElement)) {
      throw new TypeError('InfiniteScroll container must be an HTMLElement')
    }
    if (typeof callback !== 'function') {
      throw new TypeError('InfiniteScroll callback must be a function')
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('InfiniteScroll options must be an object')
    }
    if (typeof document === 'undefined') {
      throw new Error('InfiniteScroll requires a browser document')
    }
    if (typeof IntersectionObserver !== 'function') {
      throw new Error('InfiniteScroll requires IntersectionObserver support')
    }

    const {
      threshold = 200,
      sentinel = 'infinite-scroll-sentinel',
      onError,
    } = options

    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new RangeError('InfiniteScroll threshold must be a finite number greater than or equal to 0')
    }
    if (typeof sentinel !== 'string' || sentinel.trim() === '') {
      throw new TypeError('InfiniteScroll sentinel must be a non-empty CSS class name')
    }
    if (onError !== undefined && typeof onError !== 'function') {
      throw new TypeError('InfiniteScroll onError must be a function')
    }

    this.#callback = callback
    this.#onError = onError
    this.#sentinel = document.createElement('div')
    this.#sentinel.className = sentinel.trim()
    this.#sentinel.setAttribute('aria-hidden', 'true')
    container.appendChild(this.#sentinel)

    this.#observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          void this.#trigger()
        }
      },
      { rootMargin: `0px 0px ${threshold}px 0px` },
    )
    this.#observer.observe(this.#sentinel)
  }

  /**
   * Move the sentinel in an absolute-positioned layout.
   * @param {number} top
   */
  updateSentinelPosition(top) {
    this.#assertActive()
    if (!Number.isFinite(top) || top < 0) {
      throw new RangeError('Sentinel position must be a finite number greater than or equal to 0')
    }
    this.#sentinel.style.position = 'absolute'
    this.#sentinel.style.top = `${top}px`
  }

  /**
   * Pause or resume automatic callback invocation.
   * @param {boolean} value
   */
  setLoading(value) {
    this.#assertActive()
    if (typeof value !== 'boolean') {
      throw new TypeError('Loading state must be a boolean')
    }

    const wasPaused = this.#paused
    this.#paused = value
    if (wasPaused && !value && !this.#inFlight) {
      this.#refreshObserver()
    }
  }

  /** Disconnect the observer and remove its sentinel. Idempotent. */
  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#observer.disconnect()
    this.#sentinel.remove()
  }

  async #trigger() {
    if (this.#destroyed || this.#paused || this.#inFlight) return
    this.#inFlight = true

    try {
      await this.#callback()
    } catch (error) {
      if (this.#onError) {
        this.#onError(error)
      } else {
        console.error('InfiniteScroll callback failed', error)
      }
    } finally {
      this.#inFlight = false
      if (!this.#destroyed && !this.#paused) {
        this.#refreshObserver()
      }
    }
  }

  #refreshObserver() {
    this.#observer.unobserve(this.#sentinel)
    this.#observer.observe(this.#sentinel)
  }

  #assertActive() {
    if (this.#destroyed) {
      throw new Error('InfiniteScroll instance has been destroyed')
    }
  }
}
