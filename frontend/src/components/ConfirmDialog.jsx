import { useEffect, useRef } from 'react'
import './ConfirmDialog.css'

/**
 * "Are you sure?" for actions that cannot be undone.
 *
 * Cancel takes focus when it opens, so a stray Enter backs out rather than
 * confirming. Escape and a click on the backdrop cancel too.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  busyLabel = 'Working…',
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div
      className="cfm-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div className="cfm" role="alertdialog" aria-modal="true" aria-labelledby="cfm-title">
        <h2 id="cfm-title" className="cfm-title">{title}</h2>
        {message && <p className="cfm-text">{message}</p>}
        <div className="cfm-actions">
          <button ref={cancelRef} type="button" className="cfm-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`cfm-btn ${danger ? 'cfm-danger' : 'cfm-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
