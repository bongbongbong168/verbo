import { useEffect, useRef, useState } from 'react'
import { subscribe, toast } from '../toast'
import './ToastStack.css'

/* The on-screen toasts (prefix `ts-`). Mounted ONCE in Layout, inside the
   page column: a sticky zero-height anchor holds an absolutely positioned
   stack, so the toasts stay inside Verbo (not `position: fixed` over the whole
   window) yet remain in view however far the page is scrolled.

   Focus is never moved here. The region is aria-live, so a screen reader
   hears each toast without being pulled away from what it was reading. */

/* Solid circle in the type colour with a white mark: tick, cross, "!" or
   "i" (the supplied set). The circle is drawn here so the glyph can be
   knocked out in white on any background. */
function Icon({ type }) {
  // Saving: a lavender ring with a turning arc. At rest (a tab that never
  // composites) it is simply a ring with an arc, which still reads as busy.
  if (type === 'loading') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="ts-spin">
        <circle cx="12" cy="12" r="9" fill="none" stroke="#e7e3f6" strokeWidth="3" />
        <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="#a89ce3" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }
  const mark = {
    stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none',
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      {type === 'success' && <path {...mark} d="m7.5 12.3 3 3 6-6.3" />}
      {type === 'error' && <path {...mark} d="m8.5 8.5 7 7M15.5 8.5l-7 7" />}
      {type === 'warning' && (
        <>
          <path {...mark} d="M12 6.8v6.4" />
          <circle cx="12" cy="16.9" r="1.4" fill="#fff" />
        </>
      )}
      {type === 'info' && (
        <>
          <circle cx="12" cy="7.2" r="1.4" fill="#fff" />
          <path {...mark} d="M12 10.8v6.4" />
        </>
      )}
    </svg>
  )
}

function ToastItem({ t }) {
  const [paused, setPaused] = useState(false)
  // Time left on this toast's clock; hovering stops it, leaving restarts it.
  const remaining = useRef(t.duration)
  const startedAt = useRef(0)

  // A toast changed in place (Saving… -> Saved) starts a fresh clock.
  useEffect(() => {
    remaining.current = t.duration
  }, [t.rev, t.duration])

  useEffect(() => {
    // A loading toast waits for its save; it has no clock of its own.
    if (paused || t.leaving || t.type === 'loading') return undefined
    startedAt.current = Date.now()
    const id = setTimeout(() => toast.dismiss(t.id), remaining.current)
    return () => {
      clearTimeout(id)
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
    }
  }, [paused, t.id, t.leaving, t.type, t.rev])

  const act = () => {
    toast.dismiss(t.id)
    t.onAction?.()
  }

  return (
    <div className={`ts-slot${t.leaving ? ' ts-leaving' : ''}`}>
      <div className="ts-slot-inner">
        <div
          className={`ts-toast ts-${t.type}${!t.message && !t.actionLabel ? " ts-solo" : ""}`}
          role={t.type === 'error' ? 'alert' : 'status'}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {t.avatar ? (
            /* Their face says who; the small badge keeps saying what kind. */
            <span className="ts-face">
              <img src={t.avatar} alt="" />
              <span className="ts-badge"><Icon type={t.type} /></span>
            </span>
          ) : (
            <span className="ts-icon"><Icon type={t.type} /></span>
          )}
          <div className="ts-body">
            <p className="ts-title">{t.title}</p>
            {t.message && <p className="ts-message">{t.message}</p>}
          </div>
          {/* The action sits in the row, beside the close, not under the text. */}
          {t.actionLabel && (
            <button type="button" className="ts-action" onClick={act}>
              {t.actionLabel}
            </button>
          )}
          <button
            type="button"
            className="ts-close"
            aria-label="Dismiss"
            onClick={() => toast.dismiss(t.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
          {/* Ornament only: the setTimeout above is what dismisses. A strip
              frozen by a tab that never composites just stays full. */}
          {t.type !== 'loading' && (
            /* Keyed on rev so the strip restarts when the toast changes. */
            <span
              key={t.rev}
              className={`ts-progress${paused ? " ts-paused" : ""}`}
              style={{ animationDuration: `${t.duration}ms` }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default function ToastStack() {
  const [items, setItems] = useState([])
  useEffect(() => subscribe(setItems), [])

  return (
    <div className="ts-anchor">
      <div className="ts-stack" role="region" aria-label="Alerts" aria-live="polite">
        {items.map((t) => <ToastItem key={t.id} t={t} />)}
      </div>
    </div>
  )
}
