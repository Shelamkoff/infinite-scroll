/**
 * Infinite-scroll helper backed by IntersectionObserver.
 *
 * Appends an invisible sentinel element to the container.
 * When the sentinel enters the viewport (+ threshold), fires the callback.
 * Blocks repeat calls while loading is in progress.
 *
 * For flow-layout containers (grid, flex) the sentinel sits at the end
 * naturally. For absolute-positioned layouts (e.g. masonry) call
 * updateSentinelPosition() after each layout pass.
 */
export class InfiniteScroll {
  /** @type {HTMLElement} */
  #sentinel

  /** @type {IntersectionObserver} */
  #observer

  /** @type {boolean} */
  #loading = false

  /** @type {() => void | Promise<void>} */
  #callback

  /**
   * @param {HTMLElement} container
   * @param {() => void | Promise<void>} callback
   * @param {{ threshold?: number, sentinel?: string }} [options]
   */
  constructor(container, callback, options = {}) {
    const { threshold = 200, sentinel = 'infinite-scroll-sentinel' } = options
    this.#callback = callback

    this.#sentinel = document.createElement('div')
    this.#sentinel.className = sentinel
    this.#sentinel.setAttribute('aria-hidden', 'true')
    container.appendChild(this.#sentinel)

    this.#observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !this.#loading) {
          this.#trigger()
        }
      },
      { rootMargin: `0px 0px ${threshold}px 0px` },
    )

    this.#observer.observe(this.#sentinel)
  }

  /**
   * Move the sentinel to a specific position.
   * Only needed for absolute-positioned layouts (masonry).
   * @param {number} top
   */
  updateSentinelPosition(top) {
    this.#sentinel.style.position = 'absolute'
    this.#sentinel.style.top = `${top}px`
  }

  /**
   * Manually set loading state.
   * @param {boolean} value
   */
  setLoading(value) {
    this.#loading = value
  }

  /** Disconnect observer and remove sentinel from the DOM. */
  destroy() {
    this.#observer.disconnect()
    this.#sentinel.remove()
  }

  async #trigger() {
    this.#loading = true
    try {
      await this.#callback()
    } finally {
      this.#loading = false

      // Force re-evaluation: if the sentinel is still in the viewport
      // after new content was appended, the observer won't fire again
      // without an exit→enter transition. Unobserve+observe resets it.
      this.#observer.unobserve(this.#sentinel)
      this.#observer.observe(this.#sentinel)
    }
  }
}
