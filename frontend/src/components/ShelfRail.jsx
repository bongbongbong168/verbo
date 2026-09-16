import { useCallback, useEffect, useState } from 'react'
import useWheelScroll from '../hooks/useWheelScroll'
import './ShelfRail.css'

/**
 * A horizontally scrolling shelf with its paging arrows laid OVER the row.
 *
 * Extracted rather than copied, the same call the app made for SectionToggle,
 * EditDrawer, ArticleCover and ReaderSwitch: the podcast shelves and the
 * Dashboard's pick-up row want identical behaviour, and two copies of ends
 * detection plus a paging function is exactly how those four drifted before
 * they were pulled out.
 *
 * The arrows sit vertically centred against the row's own edges instead of in
 * the section heading. Against the heading they were a long way from the thing
 * they move and gave no clue which row they belonged to when two shelves sat
 * close together; on the edge they point at the card that is about to arrive.
 *
 * `className` is the caller's own row class, so each page keeps the card sizes
 * and gaps it already had - this owns the scrolling and the arrows, not the
 * shelf's appearance. Same split as PageTools: the component owns WHAT, the
 * page owns HOW IT LOOKS.
 */
export default function ShelfRail({ className = '', label, children }) {
  const ref = useWheelScroll()
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  /* One measurement, called from everywhere that can change the answer. Only
     the (stable) ref as a dependency, so its identity holds and the effect
     below does not resubscribe on every render. */
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    /* A row with nothing to scroll is at BOTH ends, which hides the pair -
       correct, and the same answer the wheel handler gives itself. */
    const start = el.scrollLeft <= 1
    const end = el.scrollLeft >= max - 1
    setAtStart((p) => (p === start ? p : start))
    setAtEnd((p) => (p === end ? p : end))
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    measure()
    /* THE SCROLL EVENT IS NOT ENOUGH ON ITS OWN. It does not always arrive
       here - a programmatic `scrollBy` on a surface that is not compositing
       moves the row without dispatching one - so `page()` re-measures for
       itself. This listener is for the gestures nothing else sees: the wheel,
       a trackpad swipe, a touch drag. */
    el.addEventListener('scroll', measure, { passive: true })
    /* Two observers, two different questions. Resize catches the row's own box
       changing (a window resize, the sidebar collapsing); mutation catches the
       CARDS arriving, which changes `scrollWidth` without touching that box -
       the case where a shelf finished loading and its arrows stayed hidden. */
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const mo = new MutationObserver(measure)
    mo.observe(el, { childList: true, subtree: true })

    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
      mo.disconnect()
    }
  }, [ref, measure])

  /* SMOOTH, WITH A GUARANTEE. A smooth scroll is animated off
     requestAnimationFrame, and rAF is throttled to a standstill on a surface
     that is not compositing - measured once on the podcast shelf: the click
     registered and `scrollLeft` never left 0. So ask for smooth, then a moment
     later, if the row has not moved at all, jump it. A real tab eases; a
     stalled one still ends up where the click asked for. The frozen-compositor
     rule is about STATE that never arrives, and a scroll position carries
     none - the worst case here is a row that moves without animating. */
  function page(dir) {
    const el = ref.current
    if (!el) return
    const from = el.scrollLeft
    const by = dir * el.clientWidth * 0.8
    el.scrollBy({ left: by, behavior: 'smooth' })
    window.setTimeout(() => {
      if (ref.current && ref.current.scrollLeft === from) {
        ref.current.scrollBy({ left: by, behavior: 'auto' })
      }
      measure()
    }, 220)
  }

  return (
    <div className="sr">
      <button
        type="button"
        className="sr-arrow sr-arrow-back"
        onClick={() => page(-1)}
        disabled={atStart}
        aria-label={label ? `Scroll ${label} back` : 'Scroll back'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      {/* `tabIndex` so the row is reachable by keyboard, where the arrow keys
          scroll it natively - there is no arrow-shaped hole for anyone who
          cannot use the overlay buttons. */}
      <div className={`sr-row ${className}`.trim()} ref={ref} tabIndex={0}>
        {children}
      </div>

      <button
        type="button"
        className="sr-arrow sr-arrow-next"
        onClick={() => page(1)}
        disabled={atEnd}
        aria-label={label ? `Scroll ${label} forward` : 'Scroll forward'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}
