import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import MenuDotsIcon from './MenuDotsIcon'

/* Where things stand with this tutor, worded in the reader's own time. */
function statusLine(t) {
  const fmt = (iso, opts) => new Intl.DateTimeFormat(undefined, opts).format(new Date(iso))
  const first = (t.name || 'your tutor').split(' ')[0]
  if (t.next_lesson_at) {
    return `Next lesson · ${fmt(t.next_lesson_at, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
  }
  if (t.waiting_since) return `Waiting for ${first} to confirm`
  if (t.last_lesson_at) return `Last lesson · ${fmt(t.last_lesson_at, { month: 'short', day: 'numeric' })}`
  return ''
}

function Face({ t }) {
  return t.photo_url ? (
    <img className="pf-face" src={t.photo_url} alt="" />
  ) : (
    <span className="pf-face pf-face-initial">{(t.name || '?').charAt(0).toUpperCase()}</span>
  )
}

/**
 * One row of "My Tutors": the face, the name, where things stand, and a ⋯
 * menu with Book again / Message / Hide.
 *
 * Hide is offered only once the student is DONE with this tutor - nothing
 * coming up and no request waiting - so nobody hides a tutor they are still
 * expecting. The row and the ⋯ are siblings, never nested: a button inside a
 * link is a nested interactive control.
 */
export default function MyTutorRow({ t, token, onHide }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => !wrap.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  async function message() {
    setBusy(true)
    try {
      const c = await api.openTutorConversation(token, t.profile_id)
      navigate(`/messages?c=${c.id}`)
    } catch {
      setBusy(false)
    }
  }

  const to = t.profile_id ? `/find-tutor/${t.profile_id}` : '#'

  return (
    <li className="pf-tutor" ref={wrap}>
      <Link className="pf-row" to={to}>
        <Face t={t} />
        <span className="pf-row-body">
          <span className="pf-row-name">{t.name}</span>
          <span className={`pf-row-note${t.next_lesson_at ? ' pf-row-note-next' : ''}`}>{statusLine(t)}</span>
        </span>
      </Link>

      <button
        type="button"
        className={`pf-tutor-more${open ? ' open' : ''}`}
        aria-label={`More for ${t.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MenuDotsIcon />
      </button>

      {open && (
        <div className="pf-tutor-menu" role="menu">
          {t.profile_id && (
            <button type="button" role="menuitem" onClick={() => navigate(`${to}?book=1`)}>
              Book again
            </button>
          )}
          {t.profile_id && (
            <button type="button" role="menuitem" onClick={message} disabled={busy}>
              {busy ? 'Opening…' : 'Message'}
            </button>
          )}
          <span className="pf-tutor-menu-sep" />
          {t.done ? (
            <button
              type="button"
              role="menuitem"
              className="pf-tutor-menu-hide"
              onClick={() => {
                setOpen(false)
                onHide(t)
              }}
            >
              Hide from my tutors
            </button>
          ) : (
            <p className="pf-tutor-menu-note">
              You can hide {t.name.split(' ')[0]} once you have no lessons coming up.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/** A hidden tutor, with the one action that matters: bring them back. */
export function HiddenTutorRow({ t, onUnhide }) {
  return (
    <li className="pf-tutor pf-tutor-hidden">
      <span className="pf-row pf-row-static">
        <Face t={t} />
        <span className="pf-row-body">
          <span className="pf-row-name">{t.name}</span>
          <span className="pf-row-note">{statusLine(t)}</span>
        </span>
      </span>
      <button type="button" className="pf-tutor-unhide" onClick={() => onUnhide(t)}>
        Unhide
      </button>
    </li>
  )
}
