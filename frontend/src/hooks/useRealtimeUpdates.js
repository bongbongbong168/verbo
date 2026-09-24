import { useEffect } from 'react'
import { api } from '../api'

const key = 'verbo:notification-cursor'
const emptyCursors = { afterNotificationId: 0 }

function restoreCursors() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || '{}')
    return {
      afterNotificationId: Number.isSafeInteger(saved.afterNotificationId) && saved.afterNotificationId >= 0
        ? saved.afterNotificationId
        : 0,
    }
  } catch {
    // Storage can be unavailable or contain an old malformed value. Updates
    // should recover from that rather than preventing Layout from rendering.
    return { ...emptyCursors }
  }
}

function persistCursors(cursors) {
  try {
    sessionStorage.setItem(key, JSON.stringify(cursors))
  } catch {
    // Private-mode storage restrictions only cost the resume cursor; the live
    // connection itself must keep working.
  }
}

/** One long-lived authenticated update loop for notifications. */
export default function useRealtimeUpdates(token) {
  useEffect(() => {
    if (!token) return undefined
    let live = true
    let cursors = restoreCursors()
    let controller

    async function listen(bootstrap = false) {
      const startedAt = Date.now()
      try {
        controller = new AbortController()
        const update = await api.pollRealtime(token, { ...cursors, bootstrap, signal: controller.signal })
        if (!live) return
        cursors = { afterNotificationId: update.after_notification_id }
        persistCursors(cursors)
        if (!bootstrap && update.notifications.length) {
          window.dispatchEvent(new CustomEvent('verbo:realtime', { detail: update }))
        }
        /* A long poll that answered instantly with nothing to say means the
           server is not holding the connection (a bug, or a host that cuts
           it). Re-asking at once would spin in a tight loop and burn the
           shared rate limit, so back off unless there was real news. */
        const quiet = !update.notifications.length && Date.now() - startedAt < 1000
        setTimeout(() => listen(false), bootstrap || !quiet ? 0 : 5000)
      } catch (error) {
        if (live && error?.name !== 'AbortError') setTimeout(() => listen(false), 3000)
      }
    }

    listen(!cursors.afterNotificationId)
    return () => {
      live = false
      controller?.abort()
    }
  }, [token])
}
