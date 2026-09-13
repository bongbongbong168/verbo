import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { fetchThrough, invalidate, isFresh, readCache } from '../dataCache'

/* How often the count re-checks.
 *
 * Shorter than the bell's minute, because this is the number a person watches
 * while they are waiting for a reply — a minute of nothing is what "I have to
 * refresh to see it" actually was. Still nowhere near a tight poll: there are
 * no websockets here, and the whole client shares a 300/min bucket. */
export const MESSAGES_POLL_MS = 20000

/* Held in the app-wide cache because the sidebar renders on every page and so
 * remounts on every navigation. Without it a "20 second poll" would really be
 * one request per page switch, and the badge would blink off and back on as
 * you moved around. Same reasoning as the bell's own count. */
const KEY = 'messages:unread'

/** Drop the cached count so the next read is a real request. */
export function invalidateUnreadMessages() {
  invalidate(KEY)
}

/**
 * How many messages are sitting unread across every thread you can read.
 *
 * Returns the number and a `refresh` to call the moment the client already
 * knows it is stale — opening a thread marks it read, and waiting out the poll
 * would leave the badge claiming unread messages the person is looking at.
 */
export default function useUnreadMessages(token) {
  const [unread, setUnread] = useState(() => readCache(KEY)?.unread ?? 0)

  const load = useCallback(
    (force = false) => {
      if (!token) return
      if (!force && isFresh(KEY, MESSAGES_POLL_MS)) {
        setUnread(readCache(KEY)?.unread ?? 0)
        return
      }
      fetchThrough(KEY, () => api.getUnreadMessages(token), { force: true })
        .then((d) => setUnread(d?.unread ?? 0))
        // A failed count must never surface: the badge keeps its last value.
        .catch(() => {})
    },
    [token],
  )

  useEffect(() => {
    if (!token) {
      setUnread(0)
      return undefined
    }
    load()
    const id = setInterval(() => load(true), MESSAGES_POLL_MS)
    /* A backgrounded tab is throttled and its polls are wasted; coming back is
       also exactly when the count is most likely to be wrong, so re-ask then. */
    const onShow = () => document.visibilityState === 'visible' && load(true)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [token, load])

  return { unread, refresh: () => load(true) }
}
