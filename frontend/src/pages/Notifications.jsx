import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { NotificationFace, relativeTime } from '../components/notifications'
import './Notifications.css'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
]

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </svg>
  )
}

export default function Notifications() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .getNotifications(token, { unread: tab === 'unread', page })
      .then(setResult)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token, tab, page])

  useEffect(() => {
    load()
  }, [load])

  const items = result?.data || []
  const unreadHere = items.filter((n) => !n.read_at).length

  /* Same rule as the dropdown: a notification is a shortcut to the thing it is
     about, so opening it both navigates and clears it. */
  function openItem(n) {
    if (!n.read_at) {
      setResult((r) =>
        r ? { ...r, data: r.data.map((x) => (x.id === n.id ? { ...x, read_at: new Date() } : x)) } : r,
      )
      api.markNotificationRead(token, n.id).catch(() => {})
    }
    if (n.link) navigate(n.link)
  }

  async function markAll() {
    setResult((r) =>
      r ? { ...r, data: r.data.map((x) => (x.read_at ? x : { ...x, read_at: new Date() })) } : r,
    )
    try {
      await api.markAllNotificationsRead(token)
      // The Unread tab must actually empty, so it refetches rather than being
      // left showing rows that no longer belong to it.
      if (tab === 'unread') load()
    } catch (err) {
      setError(err.message)
      load()
    }
  }

  async function remove(e, n) {
    // The row is a button; without this the click would also open it.
    e.stopPropagation()
    setResult((r) => (r ? { ...r, data: r.data.filter((x) => x.id !== n.id) } : r))
    try {
      await api.deleteNotification(token, n.id)
    } catch (err) {
      setError(err.message)
      load()
    }
  }

  function switchTab(key) {
    setTab(key)
    // Page 3 of "All" is not page 3 of "Unread".
    setPage(1)
  }

  return (
    <div className="nt">
      <div className="nt-top">
        <h1 className="nt-title">Notifications</h1>
        {unreadHere > 0 && (
          <button type="button" className="nt-mark" onClick={markAll}>
            Mark all as read
          </button>
        )}
      </div>

      {error && <p className="nt-error">{error}</p>}

      <div className="nt-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`nt-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="nt-panel">
        {loading && <p className="nt-empty">Loading…</p>}

        {!loading && items.length === 0 && (
          <p className="nt-empty">
            {tab === 'unread'
              ? 'Nothing unread.'
              : 'Nothing yet. Booking replies, tutor messages and course updates show up here.'}
          </p>
        )}

        {!loading &&
          items.map((n) => (
            <div
              key={n.id}
              className={`nt-row${n.read_at ? '' : ' unread'}`}
              role="button"
              tabIndex={0}
              onClick={() => openItem(n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openItem(n)
                }
              }}
            >
              <NotificationFace
                prefix="nt"
                category={n.category}
                photoUrl={n.actor_photo_url}
                name={n.actor?.name}
              />

              <span className="nt-body">
                <span className="nt-row-title">{n.title}</span>
                {n.body && <span className="nt-row-text">{n.body}</span>}
                <span className="nt-time">{relativeTime(n.created_at)}</span>
              </span>

              {!n.read_at && <span className="nt-unread-dot" aria-hidden="true" />}

              <button
                type="button"
                className="nt-del"
                onClick={(e) => remove(e, n)}
                aria-label="Remove notification"
                title="Remove"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
      </div>

      {result && result.last_page > 1 && (
        <div className="nt-pager">
          <button
            type="button"
            className="nt-page"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="nt-page-of">
            Page {result.current_page} of {result.last_page}
          </span>
          <button
            type="button"
            className="nt-page"
            disabled={page >= result.last_page}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
