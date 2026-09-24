import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import MessageAttachment from '../components/MessageAttachment'
import PageTools from '../components/PageTools'
import { invalidateUnreadMessages } from '../hooks/useUnreadMessages'
import { isRealtimeConnected } from '../hooks/usePusherConversationUpdates'
import './Messages.css'

/* Laid out from design/message.png: a "Chat" title with an accent rule, then a
   374px thread panel beside a wide conversation panel. Colours are this app's
   palette rather than the mockup's neutral greys. */

const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const cardDateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
/* "Stickers" are emoji, inserted into the message text — a real sticker set
   would need artwork, licensing and its own storage, and none of that helps
   someone arrange a Chinese lesson. Weighted toward what a tutor and student
   actually send each other. */
const EMOJI = [
  '👋',
  '🙂',
  '😄',
  '😅',
  '🙏',
  '👍',
  '👌',
  '🎉',
  '❤️',
  '🔥',
  '💪',
  '✨',
  '📚',
  '✍️',
  '🗓️',
  '⏰',
  '✅',
  '❓',
  '💡',
  '🀄',
  '🇨🇳',
  '🎧',
  '😴',
  '🤔',
]

/* One status vocabulary, shared with the Bookings page. */
const STATUS = {
  held: { label: 'Awaiting payment', tone: 'wait' },
  pending: { label: 'Pending tutor confirmation', tone: 'wait' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  declined: { label: 'Declined', tone: 'no' },
  cancelled: { label: 'Cancelled', tone: 'off' },
  expired: { label: 'Expired', tone: 'off' },
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V6M6 12l6-6 6 6" />
    </svg>
  )
}

function ClipIcon() {
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
      <path d="M20 11.5 12.3 19a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3 3 0 1 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.2-2.2l7-7" />
    </svg>
  )
}

function SmileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.7 14.2a4 4 0 0 0 6.6 0" />
      <circle cx="9.3" cy="10" r="0.9" fill="currentColor" />
      <circle cx="14.7" cy="10" r="0.9" fill="currentColor" />
    </svg>
  )
}

function CalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  )
}

function TimeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.55" />
      <circle cx="12" cy="12" r="1.55" />
      <circle cx="12" cy="19" r="1.55" />
    </svg>
  )
}

function Avatar({ name, src, className = '' }) {
  if (src) return <img className={`ms-avatar ${className}`} src={src} alt="" />
  return (
    <span className={`ms-avatar ms-avatar-fallback ${className}`} aria-hidden="true">
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * Messages: tutor threads and course groups.
 *
 * There is deliberately no "new message" button and no user directory. The
 * search box filters the threads you already have — it does not find people.
 */
/* How often the page re-checks when the live channel is unavailable. Two
   requests a tick, so 5s is ~24/min against the shared 300/min bucket. */
const FALLBACK_POLL_MS = 5000

export default function Messages() {
  const { token } = useAuth()
  const [params, setParams] = useSearchParams()

  const [threads, setThreads] = useState({ tutors: [], courses: [] })
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  /* Which message is one click away from being deleted, and which is in
     flight. Two pieces of state rather than one, because a message being
     deleted must stop being armed — otherwise the label flickers back to
     "Tap again" if the request is slow. */
  const [armedId, setArmedId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [file, setFile] = useState(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [error, setError] = useState(null)
  const [openMessageMenu, setOpenMessageMenu] = useState(null)

  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  const inputRef = useRef(null)
  const openId = params.get('c')

  const loadThreads = useCallback(
    () =>
      api
        .getConversations(token)
        .then(setThreads)
        .catch((err) => setError(err.message)),
    [token],
  )

  useEffect(() => {
    loadThreads().finally(() => setLoading(false))
  }, [loadThreads])

  // Opening a thread marks it read server-side, so the list is refetched
  // afterwards to clear the badge rather than guessing at it locally.
  const openThread = useCallback(
    (id) => {
      api
        .getConversation(token, id)
        .then((c) => {
          setActive(c)
          loadThreads()
          /* Opening a thread marks the other side's messages read, so the
             rail's badge is wrong the instant this returns. Dropping the
             cached count means the sidebar's next tick asks for a real one
             instead of showing unread messages you are looking at. */
          invalidateUnreadMessages()
        })
        .catch((err) => setError(err.message))
    },
    [token, loadThreads],
  )

  useEffect(() => {
    if (openId) openThread(openId)
    else setActive(null)
  }, [openId, openThread])

  useEffect(() => {
    const closeMessageMenu = (event) => {
      if (!event.target.closest('.ms-message-actions')) setOpenMessageMenu(null)
    }
    document.addEventListener('pointerdown', closeMessageMenu)
    return () => document.removeEventListener('pointerdown', closeMessageMenu)
  }, [])

  /* Re-read the open thread and merge it in. Messages still in flight
     (sending / failed) exist only here, so they are kept on the end rather
     than wiped by a refetch that landed mid-send. */
  const refreshActive = useCallback(
    (id) =>
      api
        .getConversation(token, id)
        .then((c) => {
          setActive((current) => {
            if (current && String(current.id) !== String(c.id)) return current
            const onServer = new Set(c.messages.map((m) => m.client_id).filter(Boolean))
            const inFlight = (current?.messages || []).filter(
              (m) => m.delivery_state && m.delivery_state !== 'sent' && !onServer.has(m.client_id),
            )
            return { ...c, messages: [...c.messages, ...inFlight] }
          })
          // Viewing it just marked the new messages read.
          invalidateUnreadMessages()
        })
        // A background refresh that fails leaves the thread as it was.
        .catch(() => {}),
    [token],
  )

  /* Pusher announces a private, content-free conversation change; the page
     then reads the change through Verbo's API, so the chat body never sits in
     a broadcast payload.

     EVERY change refreshes the thread list, not only the open thread's —
     a message in another chat has to move that chat up and show its preview,
     which used to wait until you left the page and came back. The open thread
     is refetched only while the tab is visible: refetching marks messages
     read, and a hidden tab has not read anything. Coming back to the tab
     catches up instead. */
  useEffect(() => {
    const refresh = (event) => {
      const changedId = event?.detail?.conversation_id
      if (
        openId &&
        document.visibilityState === 'visible' &&
        (changedId == null || String(changedId) === String(openId))
      ) {
        /* The list waits for the thread: opening it is what marks the new
           message read, and a list fetched alongside it raced ahead and kept
           the unread badge on the chat you were looking at. */
        refreshActive(openId).then(loadThreads)
      } else {
        loadThreads()
      }
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    /* Safety net for when the live channel is down (no Pusher key, a refused
       subscription, a dropped socket): chat still arrives within a few
       seconds. It costs nothing while Pusher is connected, because the
       check skips the request entirely. */
    const timer = setInterval(() => {
      if (!isRealtimeConnected() && document.visibilityState === 'visible') refresh()
    }, FALLBACK_POLL_MS)

    window.addEventListener('verbo:conversation-updated', refresh)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(timer)
      window.removeEventListener('verbo:conversation-updated', refresh)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [openId, loadThreads, refreshActive])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [active?.messages?.length])

  /* One flat list, courses included — the design shows a single column. The
     course rows keep their student count so the two kinds stay tellable apart. */
  const rows = useMemo(() => {
    const all = [
      ...threads.tutors.map((t) => ({ ...t, kind: 'tutor' })),
      ...threads.courses.map((t) => ({ ...t, kind: 'course' })),
    ].sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))

    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((t) =>
      [t.title, t.preview].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
  }, [threads, search])

  async function send(e) {
    e.preventDefault()
    const body = draft.trim()
    // A picture on its own is a perfectly good message, so either will do.
    if (!body && !file) return

    const clientId = globalThis.crypto?.randomUUID?.()
      || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const temporary = {
      id: `local:${clientId}`,
      client_id: clientId,
      body,
      kind: 'text',
      sender_id: null,
      sender_name: null,
      mine: true,
      created_at: new Date().toISOString(),
      read_at: null,
      attachment: file ? {
        name: file.name,
        mime: file.type,
        size: file.size,
        is_image: file.type.startsWith('image/'),
      } : null,
      delivery_state: 'sending',
    }

    // Clear and paint first. A slow request must never make typing feel slow.
    setActive((current) => current
      ? { ...current, messages: [...current.messages, temporary] }
      : current)
    setDraft('')
    setFile(null)
    setShowEmoji(false)
    if (fileRef.current) fileRef.current.value = ''
    setSending(true)
    setError(null)
    try {
      const saved = await api.sendMessage(token, active.id, body, file, clientId)
      setActive((current) => current
        ? {
            ...current,
            messages: current.messages.map((message) =>
              message.client_id === clientId
                ? { ...saved, delivery_state: 'sent' }
                : message,
            ),
          }
        : current)
      // The affected thread alone moves to the top; no whole-list refetch.
      setThreads((current) => {
        const patch = (items) => items.map((thread) => thread.id === active.id
          ? { ...thread, preview: saved.body || 'Sent an attachment', last_message_at: saved.created_at }
          : thread)
        return { tutors: patch(current.tutors), courses: patch(current.courses) }
      })
    } catch (err) {
      setActive((current) => current
        ? {
            ...current,
            messages: current.messages.map((message) =>
              message.client_id === clientId
                ? { ...message, delivery_state: 'failed' }
                : message,
            ),
          }
        : current)
      setError('Message failed to send. Use Retry to try again.')
    } finally {
      setSending(false)
    }
  }

  /**
   * Take back a message you sent.
   *
   * First click arms, second deletes — and the arming lapses after 4s on a
   * timer rather than on blur, because blur never fires if focus never landed
   * on the button in the first place. Same reasoning as Scan's delete.
   *
   * Removed from the thread locally rather than by refetching: the server has
   * already confirmed it is gone, and reloading the whole conversation to
   * learn one thing we know would jump the scroll position.
   */
  async function unsend(id) {
    if (armedId !== id) {
      setArmedId(id)
      setTimeout(() => setArmedId((cur) => (cur === id ? null : cur)), 4000)
      return
    }

    setArmedId(null)
    setDeletingId(id)
    try {
      await api.deleteMessage(token, id)
      setActive((a) =>
        a ? { ...a, messages: a.messages.filter((m) => m.id !== id) } : a,
      )
      // The thread list shows a preview of the last message, which may be the
      // one that just went.
      loadThreads()
      setOpenMessageMenu(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  /* Inserted at the caret rather than appended, so an emoji can land mid
     sentence where the writer put it. */
  function insertEmoji(emoji) {
    const el = inputRef.current
    if (!el) {
      setDraft((d) => d + emoji)
      return
    }
    const start = el.selectionStart ?? draft.length
    const end = el.selectionEnd ?? draft.length
    const next = draft.slice(0, start) + emoji + draft.slice(end)
    setDraft(next)
    // Restore the caret after React re-renders with the new value.
    requestAnimationFrame(() => {
      el.focus()
      const at = start + emoji.length
      el.setSelectionRange(at, at)
    })
  }

  /* Messages are grouped under one date heading per day, as in the design. */
  const grouped = useMemo(() => {
    if (!active) return []
    const out = []
    for (const m of active.messages) {
      const day = new Date(m.created_at).toDateString()
      if (!out.length || out[out.length - 1].day !== day)
        out.push({ day, at: m.created_at, items: [] })
      out[out.length - 1].items.push(m)
    }
    return out
  }, [active])

  if (loading) return <p className="ms-note">Loading messages…</p>

  return (
    <div className="ms-page">
      <div className="ms-top">
        <h1 className="ms-title">Chat</h1>
        <div className="ms-tools">
          <PageTools />
        </div>
      </div>

      <div className="ms-layout">
        <aside className="ms-panel ms-list-panel">
          <div className="ms-list-head">
            <h2 className="ms-h2">Messages</h2>
            <label className="ms-search">
              <SearchIcon />
              {/* Filters the threads you already have. There is no user search
                  because there is no directory to search. */}
              <input
                type="search"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>

          {rows.length === 0 ? (
            <p className="ms-empty">
              {search
                ? 'No conversations match that.'
                : 'No conversations yet. Message a tutor from their profile, or join a course.'}
            </p>
          ) : (
            <ul className="ms-threads">
              {rows.map((t) => (
                <li key={`${t.kind}-${t.id}`}>
                  <button
                    type="button"
                    className={`ms-thread${String(t.id) === String(openId) ? ' active' : ''}`}
                    onClick={() => setParams({ c: String(t.id) })}
                  >
                    <Avatar name={t.title} src={t.photo_url} />
                    <span className="ms-thread-text">
                      <span className="ms-thread-name">
                        {t.title}
                        {t.kind === 'course' && <em className="ms-tag">Group</em>}
                      </span>
                      <span className="ms-preview">
                        {t.preview || (t.kind === 'course' ? t.subtitle : 'No messages yet')}
                      </span>
                    </span>
                    {t.unread > 0 && <span className="ms-badge">{t.unread}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="ms-panel ms-chat">
          {!active ? (
            <p className="ms-empty ms-empty-chat">Pick a conversation.</p>
          ) : (
            <>
              <header className="ms-chat-head">
                {/* Phone only (hidden by CSS above 767px). On a phone the open
                    conversation replaces the thread list, so without this there
                    is no way back to it but the browser's own back button —
                    which is not an affordance anyone should have to find. */}
                <button
                  type="button"
                  className="ms-back"
                  onClick={() => setParams({}, { replace: true })}
                  aria-label="Back to messages"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 5l-7 7 7 7" />
                  </svg>
                </button>
                <Avatar name={active.title} src={active.photo_url} className="ms-avatar-lg" />
                <div className="ms-chat-who">
                  <p className="ms-chat-name">{active.title}</p>
                  <p className="ms-chat-role">
                    {active.role_label}
                    {active.type === 'course' && active.course && (
                      <span className="ms-chat-sub"> · {active.course.level}</span>
                    )}
                  </p>
                </div>
                {active.profile_id && (
                  <Link to={`/find-tutor/${active.profile_id}`} className="ms-profile-btn">
                    View profile
                    <ArrowIcon />
                  </Link>
                )}
              </header>

              {/* The context card: why this conversation exists. Without it a
                  tutor opening a thread has to guess why they are being
                  contacted. */}
              {/* Two lines, not one run-on: the lesson is what this is ABOUT, so
                  it gets its own line; the when/how-long/how-much are support
                  and sit beneath in a smaller row. */}
              {active.booking && (
                <div
                  className={`ms-context ms-context-${STATUS[active.booking.status]?.tone || 'off'}`}
                >
                  <div className="ms-context-body">
                    <div className="ms-context-top">
                      <span className="ms-context-status">
                        {STATUS[active.booking.status]?.label || active.booking.status}
                      </span>
                      <span className="ms-context-lesson">
                        {active.booking.lesson?.name || 'Private lesson'}
                      </span>
                    </div>

                    <div className="ms-context-facts">
                      {active.booking.starts_at && (
                        <span>
                          <CalIcon />
                          {cardDateFmt.format(new Date(active.booking.starts_at))}
                        </span>
                      )}
                      {active.booking.starts_at && (
                        <span>
                          <TimeIcon />
                          {clockFmt.format(new Date(active.booking.starts_at))}
                          {active.booking.duration_minutes
                            ? ` · ${active.booking.duration_minutes} min`
                            : ''}
                        </span>
                      )}
                      {active.booking.lesson?.price != null && (
                        <span className="ms-context-price">${active.booking.lesson.price}</span>
                      )}
                    </div>
                  </div>

                  <Link to="/bookings" className="ms-context-link">
                    View booking
                    <ArrowIcon />
                  </Link>
                </div>
              )}

              {active.course && (
                <div className="ms-context ms-context-brand">
                  <div className="ms-context-body">
                    {/* Deliberately NOT the course title — the header above is
                        already the course name, and repeating it here would
                        spend the card's one strong line saying nothing new. */}
                    <div className="ms-context-top">
                      <span className="ms-context-status">Group course</span>
                      <span className="ms-context-lesson">
                        {active.course.level || 'All levels'}
                      </span>
                    </div>
                    {active.course.starts_on && (
                      <div className="ms-context-facts">
                        <span>
                          <CalIcon />
                          {cardDateFmt.format(new Date(active.course.starts_on))} –{' '}
                          {cardDateFmt.format(new Date(active.course.ends_on))}
                        </span>
                      </div>
                    )}
                  </div>

                  <Link to={`/courses/${active.course.id}`} className="ms-context-link">
                    View course
                    <ArrowIcon />
                  </Link>
                </div>
              )}

              <div className="ms-scroll">
                {grouped.length === 0 && <p className="ms-empty">No messages yet — say hello.</p>}

                {grouped.map((group) => (
                  <div key={group.day}>
                    <p className="ms-daymark">
                      <span>{dayFmt.format(new Date(group.at))}</span>
                    </p>

                    {group.items.map((m, i) => {
                      /* A booking event — requested, accepted, declined,
                         cancelled — is written by the app, not typed. Drawing
                         it as a bubble would put words in someone's mouth, so
                         it gets a centred note instead. It also takes no part
                         in the run logic below: an event between two messages
                         does not break one person's utterance in two. */
                      if (m.kind === 'event') {
                        return (
                          <p className="ms-event" key={m.id}>
                            <span>{m.body}</span>
                          </p>
                        )
                      }

                      /* Consecutive messages from one person are a single
                         utterance broken into parts, so only the FIRST of a run
                         wears the avatar. The others get a spacer of the same
                         width, which is what keeps every bubble in the run on
                         one straight left edge instead of stepping in and out. */
                      const prev = group.items
                        .slice(0, i)
                        .reverse()
                        .find((x) => x.kind !== 'event')
                      const startsRun = !prev || prev.sender_id !== m.sender_id
                      return (
                      <div
                        key={m.id}
                        className={
                          `ms-row${m.mine ? ' mine' : ''}` + (startsRun ? '' : ' ms-row-cont')
                        }
                      >
                        {!m.mine &&
                          (startsRun ? (
                            <Avatar
                              name={m.sender_name}
                              src={m.sender_photo_url}
                              className="ms-avatar-sm"
                            />
                          ) : (
                            <span className="ms-avatar-gap" aria-hidden="true" />
                          ))}
                        <div className="ms-bubble-wrap">
                          {/* A course thread has many senders, so the name
                              matters there in a way it does not in a pair. */}
                          {!m.mine && active.type === 'course' && (
                            <span className="ms-sender">{m.sender_name}</span>
                          )}
                          {m.attachment && (
                            <MessageAttachment
                              messageId={m.id}
                              attachment={m.attachment}
                              token={token}
                              mine={m.mine}
                            />
                          )}
                          {/* A file can arrive with no words, so the bubble is
                              only drawn when there is something to say. */}
                          {m.body && <p className="ms-bubble">{m.body}</p>}
                          <time className="ms-time">
                            <span>{clockFmt.format(new Date(m.created_at))}</span>
                            {m.mine && m.delivery_state === 'sending' && (
                              <span className="ms-message-state">Sending…</span>
                            )}
                            {m.mine && m.delivery_state === 'failed' && (
                              <span className="ms-message-state ms-message-state-failed">Failed</span>
                            )}
                            {m.mine && m.read_at && <span className="ms-message-read">Read</span>}
                            {m.mine && m.delivery_state === 'failed' && (
                              <button
                                type="button"
                                className="ms-retry"
                                onClick={() => {
                                  setDraft(m.body || '')
                                  setActive((current) => current
                                    ? { ...current, messages: current.messages.filter((item) => item.id !== m.id) }
                                    : current)
                                  inputRef.current?.focus()
                                }}
                              >
                                Retry
                              </button>
                            )}
                            {m.mine && !String(m.id).startsWith('local:') && (
                              <span className="ms-message-actions">
                                <button
                                  type="button"
                                  className="ms-message-more"
                                  aria-label="Message options"
                                  aria-expanded={openMessageMenu === m.id}
                                  onClick={() => setOpenMessageMenu((current) => current === m.id ? null : m.id)}
                                >
                                  <MoreIcon />
                                </button>
                                {openMessageMenu === m.id && (
                                  <span className="ms-message-menu">
                                    <button
                                      type="button"
                                      className={armedId === m.id ? 'armed' : ''}
                                      onClick={() => unsend(m.id)}
                                      disabled={deletingId === m.id}
                                    >
                                      {deletingId === m.id
                                        ? 'Deleting…'
                                        : armedId === m.id
                                          ? 'Tap again to delete'
                                          : 'Delete'}
                                    </button>
                                  </span>
                                )}
                              </span>
                            )}
                          </time>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {error && <p className="ms-error">{error}</p>}

              <div className="ms-composer-wrap">
                {/* The chosen file is shown before sending, with a way out —
                    attaching the wrong thing should not need a message sent to
                    discover it. */}
                {file && (
                  <div className="ms-pending">
                    <ClipIcon />
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null)
                        if (fileRef.current) fileRef.current.value = ''
                      }}
                      aria-label="Remove attachment"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {showEmoji && (
                  <div className="ms-emoji" role="listbox" aria-label="Emoji">
                    {EMOJI.map((e) => (
                      <button key={e} type="button" onClick={() => insertEmoji(e)}>
                        {e}
                      </button>
                    ))}
                  </div>
                )}

                <form className="ms-composer" onSubmit={send}>
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.ppt,.pptx"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    className="ms-tool"
                    onClick={() => fileRef.current?.click()}
                    aria-label="Attach a file"
                    title="Attach a document or picture"
                  >
                    <ClipIcon />
                  </button>
                  <button
                    type="button"
                    className={`ms-tool${showEmoji ? ' active' : ''}`}
                    onClick={() => setShowEmoji((v) => !v)}
                    aria-label="Emoji"
                    aria-expanded={showEmoji}
                  >
                    <SmileIcon />
                  </button>

                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Message..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={sending || (!draft.trim() && !file)}
                    aria-label="Send"
                  >
                    <SendIcon />
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
