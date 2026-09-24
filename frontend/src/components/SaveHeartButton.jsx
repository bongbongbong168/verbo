import { useEffect, useState } from 'react'
import './SaveHeartButton.css'

export default function SaveHeartButton({ saved, onToggle, label }) {
  const [busy, setBusy] = useState(false)
  const [isSaved, setIsSaved] = useState(saved)

  useEffect(() => setIsSaved(saved), [saved])

  async function toggle(event) {
    event.preventDefault()
    event.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const result = await onToggle()
      if (typeof result?.saved === 'boolean') setIsSaved(result.saved)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={`shb${isSaved ? ' saved' : ''}`}
      aria-label={`${isSaved ? 'Remove' : 'Save'} ${label}`}
      aria-pressed={isSaved}
      onClick={toggle}
      disabled={busy}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15l-7-4-7 4V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      </svg>
    </button>
  )
}
