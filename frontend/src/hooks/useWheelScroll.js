import { useEffect, useRef } from 'react'

/**
 * Let an ordinary wheel scroll a horizontal shelf sideways.
 *
 * A mouse wheel only ever reports `deltaY`, so a row with `overflow-x: auto`
 * cannot be moved with one at all — you get shift+wheel, a trackpad swipe, or
 * nothing. Anyone on a plain mouse just sees a row that ends.
 *
 * Attached by hand rather than through React's `onWheel`, because React
 * registers wheel listeners as PASSIVE: `preventDefault()` inside one is
 * ignored, so the page would scroll down at the same moment the shelf moved
 * sideways.
 *
 * Shared by the podcast shelf and the Dashboard's pick-up row. Two copies of
 * this is exactly the drift `SectionToggle`, `ArticleCover` and `ReaderSwitch`
 * were each extracted to stop.
 */
export default function useWheelScroll() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const onWheel = (e) => {
      // A genuine sideways gesture already works; leave it alone.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      const next = el.scrollLeft + e.deltaY
      /* At either end the gesture goes back to the page. Swallowing it there is
         what makes a shelf feel like it has trapped your wheel — you reach the
         last card and the page underneath stops responding. */
      if (next < 0 || next > max) return
      e.preventDefault()
      el.scrollLeft = next
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return ref
}
