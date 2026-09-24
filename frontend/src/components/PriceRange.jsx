import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './PriceRange.css'

/**
 * Pick a price by dragging, not by picking a bracket.
 *
 * This replaced four fixed bands ("Under $15", "$15 - $30"…). Bands are a
 * guess at where the interesting boundaries are, and they were wrong in both
 * directions: somebody with $28 in mind had to take the whole $15-$30 shelf,
 * and a band with nobody in it had to be hidden by hand so it could not lead
 * to an empty page.
 *
 * The BOUNDS come from the tutors who actually exist, so the left end is the
 * cheapest real rate and the right end the dearest. That kills the old "$50+"
 * bracket outright — with a derived maximum there is no "and above" to catch.
 *
 * Built on two real `<input type="range">` elements rather than divs and
 * pointer maths. That is what makes it work with a keyboard (arrows, Home,
 * End), with a screen reader (it announces as a slider with a value), and
 * under a finger on a phone — none of which a hand-rolled track gives you.
 */
export default function PriceRange({ min, max, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [panelLeft, setPanelLeft] = useState(null)
  const root = useRef(null)
  const panel = useRef(null)

  // `value` is null while no price filter is set.
  const lo = value?.min ?? min
  const hi = value?.max ?? max
  const active = value != null

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  /* Right-aligning is normally enough, but the collapsed sidebar owns the
     first 76px of a phone. A 260px panel hanging from a Price pill near the
     middle can still begin underneath that rail. Measure the actual main
     content edge and clamp the panel between it and the viewport's right edge. */
  useLayoutEffect(() => {
    if (!open || !root.current || !panel.current) return undefined

    function positionPanel() {
      const anchorRect = root.current.getBoundingClientRect()
      const mainRect = root.current.closest('.sb-main')?.getBoundingClientRect()
      const panelWidth = panel.current.offsetWidth
      const leftEdge = Math.max(8, (mainRect?.left ?? 0) + 8)
      const rightEdge = Math.min(window.innerWidth - 8, (mainRect?.right ?? window.innerWidth) - 8)
      const preferred = anchorRect.right - panelWidth
      const viewportLeft = Math.min(
        Math.max(preferred, leftEdge),
        Math.max(leftEdge, rightEdge - panelWidth),
      )

      setPanelLeft(viewportLeft - anchorRect.left)
    }

    positionPanel()
    window.addEventListener('resize', positionPanel)
    return () => window.removeEventListener('resize', positionPanel)
  }, [open])

  /* The two thumbs must not cross. Clamping rather than swapping: a thumb that
     swaps identity mid-drag jumps out from under the finger holding it. */
  const setLo = (n) => onChange({ min: Math.min(Number(n), hi), max: hi })
  const setHi = (n) => onChange({ min: lo, max: Math.max(Number(n), lo) })

  const pct = (n) => ((n - min) / (max - min)) * 100

  return (
    <div className="pr" ref={root}>
      <button
        type="button"
        className={'pr-btn' + (open ? ' open' : '') + (active ? ' set' : '')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{active ? `$${lo} – $${hi}` : 'Price'}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="pr-pop"
          ref={panel}
          style={panelLeft == null ? undefined : { left: panelLeft, right: 'auto' }}
        >
          <div className="pr-head">
            <span className="pr-read">
              ${lo} <span className="pr-dash">–</span> ${hi}
              <span className="pr-per">/hr</span>
            </span>
            {active && (
              <button type="button" className="pr-clear" onClick={() => onChange(null)}>
                Any price
              </button>
            )}
          </div>

          <div className="pr-track">
            {/* The lit span between the thumbs. Inline positioning because it
                is data, not styling — it moves with the values. */}
            <span
              className="pr-fill"
              style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
            />
            <input
              type="range"
              className="pr-input pr-input-lo"
              min={min}
              max={max}
              value={lo}
              onChange={(e) => setLo(e.target.value)}
              aria-label="Minimum price per hour"
            />
            <input
              type="range"
              className="pr-input pr-input-hi"
              min={min}
              max={max}
              value={hi}
              onChange={(e) => setHi(e.target.value)}
              aria-label="Maximum price per hour"
            />
          </div>

          <div className="pr-ends">
            <span>${min}</span>
            <span>${max}</span>
          </div>
        </div>
      )}
    </div>
  )
}
