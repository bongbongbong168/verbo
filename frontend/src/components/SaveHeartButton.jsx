import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../toast'
import { invalidate } from '../dataCache'
import './SaveHeartButton.css'

export default function SaveHeartButton({ saved, onToggle, label }) {
  const [busy, setBusy] = useState(false)
  const [isSaved, setIsSaved] = useState(saved)
  const navigate = useNavigate()

  useEffect(() => setIsSaved(saved), [saved])

  async function toggle(event) {
    event.preventDefault()
    event.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const result = await onToggle()
      // Some callers return the new state, some only update their own; when
      // nothing comes back, a successful toggle means the opposite of before.
      const now = typeof result?.saved === 'boolean' ? result.saved : !isSaved
      setIsSaved(now)
      announceSave(now, label, navigate)
    } catch (err) {
      toast.show({ type: 'error', title: "Couldn't save that", message: err.message })
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

/* Tells the learner where a save went and gives them one tap to get there.
   Everything saved (tutors, podcasts, articles) lives in Settings > Saved;
   without this the bookmark just changed colour and the list stayed hidden.
   Exported so the article page's own Save button says the same thing. */
export function announceSave(saved, label, navigate) {
  /* Every cached list that carries a saved flag. Without this, returning to
     a page within the 30s freshness window painted the OLD state, so a
     podcast just saved showed as unsaved again. */
  invalidate('podcasts', 'podcasts-continue', 'articles', 'tutors', 'articles:', 'rec:', 'recent-views:', 'podcast:', 'article:', 'tutor:')
  if (saved) {
    toast.show({
      type: 'success',
      title: 'Saved',
      message: label ? `${label} is in your saved list.` : 'Added to your saved list.',
      actionLabel: 'View saved',
      onAction: () => navigate('/settings?s=saved'),
    })
  } else {
    toast.show({ type: 'info', title: 'Removed from saved', message: label || undefined })
  }
}
