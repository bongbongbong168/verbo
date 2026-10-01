import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import useScrollLock from '../useScrollLock'
import './ConfirmDelete.css'

/**
 * The app's one "are you sure?" pop-up for deletes, drawn like the Classes
 * page's delete-class dialog it was copied from: dark scrim, white card,
 * Cancel focused on the left, the red action on the right.
 *
 * A plain async function rather than a component, so any delete handler can
 * ask without the page having to render anything:
 *
 *   if (!(await confirmDelete({ title: 'Delete this word?' }))) return
 *
 * It mounts its own small React root at the end of #root (keeping the app's
 * zoom, and escaping any transformed drawer) and removes it on answer. It
 * needs no context - it only shows text and two buttons.
 */
export function confirmDelete(opts = {}) {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    ;(document.getElementById('root') || document.body).appendChild(host)
    const root = createRoot(host)
    const answer = (yes) => {
      root.unmount()
      host.remove()
      resolve(yes)
    }
    root.render(<ConfirmDelete {...opts} onAnswer={answer} />)
  })
}

function ConfirmDelete({ title = 'Delete this?', text = 'This cannot be undone.', action = 'Delete', onAnswer }) {
  useScrollLock()

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onAnswer(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onAnswer])

  return (
    <div
      className="dc-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onAnswer(false)
      }}
    >
      <div className="dc" role="alertdialog" aria-modal="true" aria-labelledby="dc-title" aria-describedby="dc-text">
        <h2 id="dc-title" className="dc-title">{title}</h2>
        {text && <p id="dc-text" className="dc-text">{text}</p>}
        <div className="dc-actions">
          <button type="button" className="dc-cancel" onClick={() => onAnswer(false)} autoFocus>
            Cancel
          </button>
          <button type="button" className="dc-go" onClick={() => onAnswer(true)}>
            {action}
          </button>
        </div>
      </div>
    </div>
  )
}
