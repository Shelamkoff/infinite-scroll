/**
 * Infinite-scroll controller backed by IntersectionObserver.
 *
 * The controller appends an invisible sentinel to the container and invokes
 * the callback when that sentinel approaches the viewport.
 */
export class InfiniteScroll {
  /** @type {HTMLElement} */
  #container

  /** @type {HTMLElement} */
  #sentinel

  /** @type {IntersectionObserver} */
  #observer

  /** @type {boolean} */
  #inFlight = false

  /** @type {boolean} */
  #paused = false

  /** @type {boolean} */
  #resumePending = false

  /** @type {boolean} */
  #destroyed = false

  /** @type {() => boolean | void | Promise<boolean | void>} */
  #callback

  /** @type {((error: unknown) => void) | undefined} */
  #onError

  /**
   * @param {HTMLElement} container
   * @param {() => boolean | void | Promise<boolean | void>} callback
   * @param {{
   *   threshold?: number,
   *   sentinel?: string,
   *   onError?: (error: unknown) => void
   * }} [options]
   */
  constructor(container, callback, options = {}) {
    const ownerDocument = container?.ownerDocument
    const view = ownerDocument?.defaultView ?? globalThis
    if (typeof view.HTMLElement !== 'function' || !(container instanceof view.HTMLElement)) {
      throw new TypeError('InfiniteScroll container must be an HTMLElement')
    }
    if (typeof callback !== 'function') {
      throw new TypeError('InfiniteScroll callback must be a function')
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('InfiniteScroll options must be an object')
    }
    if (!ownerDocument) {
      throw new Error('InfiniteScroll requires a browser document')
    }
    const Observer = view.IntersectionObserver ?? globalThis.IntersectionObserver
    if (typeof Observer !== 'function') {
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
    this.#container = container
    this.#sentinel = ownerDocument.createElement('div')
    this.#sentinel.className = sentinel.trim()
    this.#sentinel.setAttribute('aria-hidden', 'true')

    this.#observer = new Observer(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          void this.#trigger()
        }
      },
      { rootMargin: `0px 0px ${threshold}px 0px` },
    )
    try {
      container.appendChild(this.#sentinel)
      this.#observer.observe(this.#sentinel)
    } catch (error) {
      this.destroy()
      throw error
    }
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
    if (value) {
      this.#resumePending = false
    } else if (wasPaused) {
      if (this.#inFlight) {
        this.#resumePending = true
      } else {
        this.#refreshObserver()
      }
    }
  }

  /** Disconnect the observer and remove its sentinel. Idempotent. */
  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#resumePending = false
    this.#observer.disconnect()
    this.#sentinel.remove()
  }

  async #trigger() {
    if (this.#destroyed || this.#paused || this.#inFlight) return
    this.#inFlight = true

    try {
      const shouldContinue = await this.#callback()
      if (shouldContinue === false) {
        this.#paused = true
      }
    } catch (error) {
      if (this.#onError) {
        try {
          Promise.resolve(this.#onError(error)).catch(handlerError => {
            console.error('InfiniteScroll onError failed', handlerError)
          })
        } catch (handlerError) {
          console.error('InfiniteScroll onError failed', handlerError)
        }
      } else {
        console.error('InfiniteScroll callback failed', error)
      }
    } finally {
      this.#inFlight = false
      const shouldResume = this.#resumePending
      this.#resumePending = false
      if (!this.#destroyed && this.#container.lastChild !== this.#sentinel) {
        this.#container.appendChild(this.#sentinel)
      }
      if (shouldResume && !this.#destroyed && !this.#paused) {
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
