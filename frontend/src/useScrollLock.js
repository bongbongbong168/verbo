import { useEffect } from 'react'

/* Stops the page scrolling behind a modal.

   It locks <html>, not <body>. fonts.css gives html `overflow-y: scroll`, so
   the viewport is html's scroller: `body { overflow: hidden }` never stopped
   it, and it turned body into a clip box, which unpinned the sticky sidebar
   and rails - they jumped down the moment a dialog opened.

   Hiding html's scrollbar widens the page by its gutter, so that width is
   handed back as padding and nothing moves sideways. */
export default function useScrollLock() {
  useEffect(() => {
    const root = document.documentElement
    const gutter = window.innerWidth - root.clientWidth
    const prev = { overflow: root.style.overflow, paddingRight: root.style.paddingRight }
    root.style.overflow = 'hidden'
    if (gutter > 0) root.style.paddingRight = `${gutter}px`
    return () => {
      root.style.overflow = prev.overflow
      root.style.paddingRight = prev.paddingRight
    }
  }, [])
}
