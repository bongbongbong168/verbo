import { useEffect } from 'react'
import { api } from '../api'

const key = 'verbo:notification-cursor'
const emptyCursors = { afterNotificationId: 0 }
// Railway may end a long-poll request before its 20-second server timeout.
// Never reconnect in a tight loop in that case: notifications can wait for
// the next check, while conversation messages are delivered by Pusher.
const NEXT_POLL_DELAY_MS = 20_000
const RETRY_DELAY_MS = 3_000

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
      try {
        controller = new AbortController()
        const update = await api.pollRealtime(token, { ...cursors, bootstrap, signal: controller.signal })
        if (!live) return
        cursors = { afterNotificationId: update.after_notification_id }
        persistCursors(cursors)
        if (!bootstrap && update.notifications.length) {
          window.dispatchEvent(new CustomEvent('verbo:realtime', { detail: update }))
        }
        setTimeout(() => listen(false), NEXT_POLL_DELAY_MS)
      } catch (error) {
        if (live && error?.name !== 'AbortError') setTimeout(() => listen(false), RETRY_DELAY_MS)
      }
    }

    listen(!cursors.afterNotificationId)
    return () => {
      live = false
      controller?.abort()
    }
  }, [token])
}
