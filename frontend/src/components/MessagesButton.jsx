import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import './MessagesButton.css'

/**
 * Messages, as the first of the three top-right controls.
 *
 * A plain link, not a menu: the bell opens a panel because a notification is
 * read and dismissed in place, whereas a message is answered on the thread
 * page. Giving this a dropdown would add a screen nobody needs on the way to
 * the one they actually want.
 *
 * Drawn rather than exported: the bell beside it is a baked PNG that carries
 * its own chip, so this reproduces that chip in CSS and strokes the glyph in
 * the same navy. Values are measured off `icon-bell-plain.png` rather than
 * guessed — chip #f2f2f2, glyph #2b2643, glyph 38.6% of the chip's diameter.
 */
export default function MessagesButton() {
  const { token } = useAuth()
  const [unread, setUnread] = useState(0)

  /* Polled on the same one-minute cadence as the bell, for the same reason:
     there are no websockets here, and a tighter poll would spend the shared
     300/min bucket on a number that is only ever a few minutes stale.
     Failures are swallowed — the button must still work as a link when the
     count cannot be fetched. */
  useEffect(() => {
    if (!token) return undefined

    let live = true
    const load = () =>
      api
        .getUnreadMessages(token)
        .then((d) => live && setUnread(d.unread ?? 0))
        .catch(() => {})

    load()
    const id = setInterval(load, 60000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [token])

  return (
    <Link
      to="/messages"
      className="mg-trigger"
      aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
      title="Messages"
    >
      {/* FILLED, not stroked. The bell beside it is a solid silhouette, and an
          outline of the same height reads noticeably lighter next to it — the
          pair stops looking like one set. No internal detail either: the bell
          carries none, so a bubble with dots knocked out of it would be the
          more decorated of the two. */}
      <svg
        className="mg-icon"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6.6 3.6h10.8a3.6 3.6 0 0 1 3.6 3.6v6.1a3.6 3.6 0 0 1-3.6 3.6h-6.7l-4.2 3.3a.85.85 0 0 1-1.37-.67V16.6A3.6 3.6 0 0 1 3 13.3V7.2a3.6 3.6 0 0 1 3.6-3.6Z" />
      </svg>

      {/* Presence, not a count — the same decision the bell's dot makes. The
          exact number does not change what you do about it, and a numeral on a
          42px control competes with the glyph for the same small space. The
          real count reaches screen readers through the aria-label above. */}
      {unread > 0 && <span className="mg-dot" aria-hidden="true" />}
    </Link>
  )
}
