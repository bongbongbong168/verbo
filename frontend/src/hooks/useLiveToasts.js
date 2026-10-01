import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { toast } from '../toast'
import { isRealtimeConnected } from './usePusherConversationUpdates'

/* Turns new notifications into on-screen toasts, on whatever page the person
   is on, and raises "lesson starting soon" reminders.

   - Pusher's private `users.{id}` channel says "you have a new notification"
     (an id, no content); this fetches the rows through the API, which is
     scoped to the signed-in account, so a toast can never be about someone
     else.
   - When the socket is down it polls instead, every 30s while visible.
   - A watermark (the newest notification id seen) means opening a tab never
     replays history as a burst of toasts.
   - Reminders are computed here from My Learning because the server runs no
     scheduler; each lesson is reminded once per browser. */

/* Only runs while the live channel is DOWN (no Pusher keys locally, or a
   dropped socket) and the tab is visible: 12 small requests a minute against
   the 300/min bucket, for toasts that land within ~5s instead of 30. */
const POLL_MS = 5_000
const REMIND_REFRESH_MS = 5 * 60_000
const REMIND_CHECK_MS = 30_000
const REMIND_WINDOW_MS = 15 * 60_000
const REMINDED_KEY = 'ts-reminded'

function when(iso) {
  if (!iso) return ''
  const at = new Date(iso)
  const now = new Date()
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((day - today) / 86400000)
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const date = days === 0 ? 'today' : days === 1 ? 'tomorrow'
    : at.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  return `${date} at ${time}`
}

/** One notification row -> toast options, or null to stay quiet. */
function toToast(n, go, here) {
  const who = n.actor?.name || 'Your tutor'
  const d = n.data || {}
  switch (n.type) {
    case 'booking_confirmed':
      return {
        type: 'success',
        title: 'Lesson confirmed',
        message: d.starts_at ? `${who} confirmed your lesson for ${when(d.starts_at)}.` : `${who} confirmed your lesson.`,
        actionLabel: 'View booking',
        onAction: () => go('/bookings?tab=upcoming'),
      }
    case 'booking_declined':
      return {
        type: 'error',
        title: 'Lesson request declined',
        message: `${who} is unavailable for this time.`,
        actionLabel: 'Find another tutor',
        onAction: () => go('/find-tutor'),
      }
    case 'booking_cancelled': {
      // Told to whichever side did NOT cancel. A student whose tutor called it
      // off is offered another time; a tutor is just pointed at the list.
      const byTutor = d.cancelled_by === 'tutor'
      return {
        type: 'error',
        title: 'Lesson cancelled',
        message: `${who} cancelled the lesson${d.starts_at ? ` for ${when(d.starts_at)}` : ''}.`,
        actionLabel: byTutor ? 'Find another time' : 'View bookings',
        onAction: () => go(byTutor ? '/find-tutor' : '/bookings?tab=past'),
      }
    }
    case 'booking_requested':
      return {
        type: 'info',
        title: 'New lesson request',
        message: `${who} requested ${d.lesson || 'a lesson'}${d.starts_at ? ` for ${when(d.starts_at)}` : ''}.`,
        actionLabel: 'Review request',
        onAction: () => go('/bookings?tab=requests'),
      }
    case 'message': {
      // Already reading that thread: the message is on screen, so a toast
      // would only repeat it.
      if (d.conversation_id && here.pathname === '/messages'
        && new URLSearchParams(here.search).get('c') === String(d.conversation_id)) {
        return null
      }
      const course = d.course
      return {
        type: 'info',
        title: course ? n.title : `New message from ${who}`,
        message: course ? `${who}: ${d.preview || ''}`.trim() : (d.preview || n.body || ''),
        actionLabel: 'Open message',
        onAction: () => go(n.link || '/messages'),
      }
    }
    default:
      // Anything else the bell carries: its own title and sentence.
      return {
        type: n.type === 'tutor_application_rejected' ? 'error'
          : n.type === 'tutor_application_approved' || n.type === 'course_enrolled' ? 'success' : 'info',
        title: n.title,
        message: n.body || '',
        actionLabel: n.link ? 'Open' : undefined,
        onAction: n.link ? () => go(n.link) : undefined,
      }
  }
}

function readReminded() {
  try {
    return JSON.parse(localStorage.getItem(REMINDED_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function writeReminded(map) {
  try { localStorage.setItem(REMINDED_KEY, JSON.stringify(map)) } catch { /* private mode */ }
}

export default function useLiveToasts(token, userId) {
  const navigate = useNavigate()
  const location = useLocation()
  // Handlers outlive renders; read the latest route and navigate from refs.
  const here = useRef(location)
  here.current = location
  const go = useRef(navigate)
  go.current = navigate

  // ---- notifications -> toasts ----
  useEffect(() => {
    if (!token || !userId) return undefined
    let live = true
    let mark = null
    let busy = false
    let again = false

    const pull = async () => {
      if (busy) { again = true; return }
      busy = true
      try {
        const res = await api.getNotificationsSince(token, mark)
        if (!live) return
        if (mark !== null) {
          for (const n of res.data || []) {
            const opts = toToast(n, (to) => go.current(to), here.current)
            // The person who did it, where they have a photo.
            if (opts) toast.show({ ...opts, avatar: n.actor_photo_url })
          }
        }
        mark = Math.max(mark ?? 0, Number(res.latest_id) || 0)
      } catch {
        // A missed toast is fine: the bell and the Notifications page still
        // have the row. Never surface an error for an ornament.
      } finally {
        busy = false
        if (again && live) { again = false; pull() }
      }
    }

    pull() // sets the watermark only
    const onSignal = () => pull()
    const onResync = (e) => { if (e.detail?.change === 'resync') pull() }
    window.addEventListener('verbo:notification-created', onSignal)
    window.addEventListener('verbo:conversation-updated', onResync)
    const poll = setInterval(() => {
      if (!isRealtimeConnected() && document.visibilityState === 'visible') pull()
    }, POLL_MS)
    // A hidden tab skips the poll (a toast nobody sees would just expire), so
    // catch up the moment it is looked at again.
    const onVisible = () => { if (document.visibilityState === 'visible') pull() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      live = false
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('verbo:notification-created', onSignal)
      window.removeEventListener('verbo:conversation-updated', onResync)
    }
  }, [token, userId])

  // ---- "lesson starting soon" ----
  useEffect(() => {
    if (!token || !userId) return undefined
    let live = true
    let items = []

    const refresh = async () => {
      try {
        const data = await api.getMyLearning(token, 10)
        if (live) items = Array.isArray(data) ? data : []
      } catch { /* try again next round */ }
    }

    const check = () => {
      const now = Date.now()
      const reminded = readReminded()
      let changed = false
      // Forget reminders for lessons long gone, so the map does not grow.
      for (const [k, at] of Object.entries(reminded)) {
        if (now - Date.parse(at) > 86_400_000) { delete reminded[k]; changed = true }
      }
      for (const item of items) {
        // A private request the tutor has not accepted is not a lesson yet.
        if (item.kind === 'private' && item.status !== 'confirmed') continue
        const start = Date.parse(item.starts_at)
        const left = start - now
        const key = `${item.key}:${item.starts_at}`
        if (left <= 0 || left > REMIND_WINDOW_MS || reminded[key]) continue
        reminded[key] = item.starts_at
        changed = true
        const mins = Math.max(1, Math.round(left / 60000))
        const who = item.tutor || 'your tutor'
        toast.show({
          type: 'warning',
          title: 'Lesson starting soon',
          message: `Your lesson with ${who} starts in ${mins} minute${mins === 1 ? '' : 's'}.`,
          duration: 10_000,
          actionLabel: 'View booking',
          onAction: () => go.current(item.kind === 'group' ? item.href : '/bookings?tab=upcoming'),
        })
      }
      if (changed) writeReminded(reminded)
    }

    refresh().then(() => live && check())
    const r = setInterval(refresh, REMIND_REFRESH_MS)
    const c = setInterval(check, REMIND_CHECK_MS)
    return () => {
      live = false
      clearInterval(r)
      clearInterval(c)
    }
  }, [token, userId])
}
