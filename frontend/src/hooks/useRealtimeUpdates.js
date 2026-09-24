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
      try {
        controller = new AbortController()
        const update = await api.pollRealtime(token, { ...cursors, bootstrap, signal: controller.signal })
        if (!live) return
        cursors = { afterNotificationId: update.after_notification_id }
        persistCursors(cursors)
        if (!bootstrap && update.notifications.length) {
          window.dispatchEvent(new CustomEvent('verbo:realtime', { detail: update }))
        }
        setTimeout(() => listen(false), 0)
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
