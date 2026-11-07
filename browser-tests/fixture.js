import { InfiniteScroll } from '../src/index.js'

globalThis.InfiniteScroll = InfiniteScroll
globalThis.policyViolations = []
document.addEventListener('securitypolicyviolation', event => {
  globalThis.policyViolations.push(event.violatedDirective)
})
document.body.style.margin = '0'

globalThis.nextFrames = () => new Promise(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(resolve))
})

globalThis.addItem = (container, height) => {
  const item = container.ownerDocument.createElement('article')
  item.style.height = `${height}px`
  item.textContent = 'Loaded item'
  container.appendChild(item)
  return item
}

globalThis.watchSentinel = container => {
  globalThis.intersections = []
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) globalThis.intersections.push(entry.isIntersecting)
  }, { rootMargin: '0px 0px 100px 0px' })
  observer.observe(container.lastElementChild)
  return observer
}
