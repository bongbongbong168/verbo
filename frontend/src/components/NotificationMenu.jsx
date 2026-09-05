import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { fetchThrough, isFresh, readCache, writeCache } from '../dataCache'
/* The dot-free variant of the export. The original bakes in a lavender
   notification dot AND cuts a notch out of the bell to seat it, so it could
   never turn off — it would claim unread items at zero. The red count badge
   is the real signal; see scratchpad/debell2.py for how the notch was
   rebuilt by mirroring the bell's own symmetric left half. */
import iconBell from '../assets/dashboard/icon-bell-plain.png'
import { NotificationFace, relativeTime } from './notifications'
import './NotificationMenu.css'

/* How often the badge re-checks. Long on purpose: this app has no websockets,
   and a tight poll would burn the shared 300/min bucket for a number that is
   only ever a few minutes stale. */
const POLL_MS = 60000

/* Shared with nothing else, but held in the app-wide cache so the count
   survives the remount that every page navigation causes. */
const UNREAD_KEY = 'notifications:unread'

/** The number of rows the dropdown shows before "View all". */
const PREVIEW = 5

export default function NotificationMenu() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [armed, setArmed] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)

  /* Cached, because this bell renders on EVERY page and therefore remounts on
     every navigation — which restarted the interval and refired the request,
     turning a one-minute poll into one request per page switch. Reusing a count
     younger than the poll interval also stops the badge blinking off and back
     on as you move between pages. */
  const loadCount = useCallback(
    (force = false) => {
      if (!force && isFresh(UNREAD_KEY, POLL_MS)) {
        setUnread(readCache(UNREAD_KEY)?.unread ?? 0)
        return
      }
      fetchThrough(UNREAD_KEY, () => api.getUnreadNotifications(token), { force: true })
        .then((d) => setUnread(d.unread))
        // A failed count must never surface — the bell keeps its last value.
        .catch(() => {})
    },
    [token],
  )

  // The badge is the only thing polled. The list itself loads on open.
  useEffect(() => {
    if (!token) return
    loadCount()
    const id = setInterval(() => loadCount(true), POLL_MS)
    return () => clearInterval(id)
  }, [token, loadCount])

  /* Disarm on a timer rather than on blur: blur never fires if focus never
     landed on the button, which is exactly what happens when the pointer moves
     away without clicking. Also disarms when the panel closes, so reopening it
     never presents a control already primed to delete. */
  useEffect(() => {
    if (!armed) return undefined
    const id = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])

  useEffect(() => {
    if (!open) setArmed(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    let live = true
    setLoading(true)
    api
      .getNotifications(token, { limit: PREVIEW })
      .then((d) => {
        if (!live) return
        setItems(d.data || [])
        setUnread(d.unread ?? 0)
      })
      .catch(() => {})
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [open, token])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  /* Clicking a notification is a shortcut to the thing it is about, so it
     navigates AND clears itself. The read call is fire-and-forget: the badge
     is already corrected locally, and failing to record it must not block the
     navigation the user actually asked for. */
  function openItem(n) {
    setOpen(false)
    if (!n.read_at) {
      setUnread((u) => Math.max(0, u - 1))
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date() } : x)))
      api.markNotificationRead(token, n.id).catch(() => {})
    }
    if (n.link) navigate(n.link)
  }

  async function markAll() {
    setUnread(0)
    setItems((list) => list.map((x) => (x.read_at ? x : { ...x, read_at: new Date() })))
    try {
      await api.markAllNotificationsRead(token)
      // Through the cache too, or navigating away and back inside the poll
      // window would restore the count we just cleared.
      writeCache(UNREAD_KEY, { unread: 0 })
    } catch {
      // Put the real number back rather than leaving a cleared badge that lies.
      // Forced: the cached count is precisely what cannot be trusted here.
      loadCount(true)
    }
  }

  /* Arms on the first click and empties on the second — the pattern Scan's
     delete and Bookings' "Clear all" already use. This is a real delete with no
     undo, and the panel is small enough that the button sits under the pointer
     you were already moving. */
  async function clearAll() {
    if (!armed) {
      setArmed(true)
      return
    }

    setArmed(false)
    const previous = items
    setItems([])
    setUnread(0)
    try {
      await api.clearAllNotifications(token)
      writeCache(UNREAD_KEY, { unread: 0 })
    } catch {
      // Put the list back rather than leaving an empty panel that lies about
      // what the server holds.
      setItems(previous)
      loadCount(true)
    }
  }

  return (
    <div className="nm" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`nm-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <img src={iconBell} alt="" />
        {/* Presence, not a count. The exact number does not change what you do
            about it — you open the panel either way — and a numeral on a 42px
            button competes with the glyph for the same small space. The real
            count is still announced to screen readers via aria-label above. */}
        {unread > 0 && <span className="nm-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="nm-pop" role="menu">
          <div className="nm-head">
            <span className="nm-title">Notifications</span>
            <span className="nm-head-actions">
              {unread > 0 && (
                <button type="button" className="nm-mark" onClick={markAll}>
                  Mark all as read
                </button>
              )}
              {/* Only offered when there is something to clear — a Clear all
                  above an empty list is a control that can only disappoint. */}
              {items.length > 0 && (
                <button
                  type="button"
                  className={`nm-clear${armed ? ' armed' : ''}`}
                  onClick={clearAll}
                >
                  {armed ? 'Tap again' : 'Clear all'}
                </button>
              )}
            </span>
          </div>

          <div className="nm-list">
            {loading && items.length === 0 && <p className="nm-empty">Loading…</p>}

            {!loading && items.length === 0 && (
              <p className="nm-empty">
                Nothing yet. Booking replies and new messages show up here.
              </p>
            )}

            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`nm-item${n.read_at ? '' : ' unread'}`}
                onClick={() => openItem(n)}
                role="menuitem"
              >
                <NotificationFace
                  prefix="nm"
                  category={n.category}
                  photoUrl={n.actor_photo_url}
                  name={n.actor?.name}
                />
                <span className="nm-body">
                  <span className="nm-item-title">{n.title}</span>
                  {n.body && <span className="nm-item-text">{n.body}</span>}
                  <span className="nm-time">{relativeTime(n.created_at)}</span>
                </span>
                {!n.read_at && <span className="nm-unread-dot" aria-hidden="true" />}
              </button>
            ))}
          </div>

          <Link className="nm-all" to="/notifications" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      )}
    </div>
  )
}
