import { useEffect, useRef } from 'react'
import { toast } from '../toast'
import './EditDrawer.css'

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

/**
 * The chrome every edit drawer shares: scrim, sliding panel, header, tab strip
 * and the scrolling body. Callers supply the tab bodies.
 *
 * Shared as a component rather than copied per page — two near-identical
 * drawers against two near-identical stylesheets is exactly how the Podcast
 * and Read toggles silently drifted apart before SectionToggle.
 */
export default function EditDrawer({
  title,
  subtitle,
  tabs,
  tab,
  onTabChange,
  onClose,
  error,
  flash,
  busy,
  busyLabel = 'Saving…',
  closeMessage = 'Saved',
  children,
}) {
  /* Saving is a toast, not a banner inside the drawer (the banner pushed the
     whole tab down and back up). While `busy` a "Saving…" toast spins; the
     success message (flash) or the error then turns THAT toast into the
     result. Effects run in declaration order, so a save that sets its flash
     and clears busy in one render settles as success before the busy effect
     would drop the spinner. */
  const savingRef = useRef(null)

  useEffect(() => {
    if (!flash) return
    if (savingRef.current) {
      savingRef.current.success(flash)
      savingRef.current = null
    } else {
      toast.show({ type: 'success', title: flash, duration: 3000 })
    }
  }, [flash])

  useEffect(() => {
    if (error && savingRef.current) {
      savingRef.current.error("Couldn't save", error)
      savingRef.current = null
    }
  }, [error])

  /* A create closes the drawer the moment it succeeds, so the busy effect
     never sees busy go false and the spinner would hang forever. Settle it
     on unmount instead. */
  const closeRef = useRef(closeMessage)
  closeRef.current = closeMessage
  useEffect(() => () => {
    if (savingRef.current) {
      savingRef.current.success(closeRef.current)
      savingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (busy && !savingRef.current) {
      savingRef.current = toast.saving(busyLabel)
    } else if (!busy && savingRef.current) {
      // Finished without a message worth saying: just drop the spinner.
      savingRef.current.done()
      savingRef.current = null
    }
  }, [busy])

  // Esc closes, matching every other dismissible overlay in the app.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ed-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="ed" role="dialog" aria-label={title}>
        <header className="ed-head">
          <div>
            <p className="ed-title">{title}</p>
            {subtitle && <p className="ed-sub">{subtitle}</p>}
          </div>
          <button type="button" className="ed-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="ed-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={'ed-tab' + (tab === t ? ' active' : '')}
              onClick={() => onTabChange(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="ed-body">
          {error && <p className="ed-error">{error}</p>}
          {children}
        </div>
      </aside>
    </div>
  )
}
