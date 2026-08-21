import { useEffect } from 'react'
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
  children,
}) {
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
          {flash && <p className="ed-saved">{flash}</p>}
          {children}
        </div>
      </aside>
    </div>
  )
}
