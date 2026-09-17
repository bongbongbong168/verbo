import { api } from './api'
import { hasCache, readCache, writeCache, invalidate } from './dataCache'

/* The Dashboard's "Pick up where you left off" row reads this key. */
const KEY = 'recent-views:3'

const idOf = (row) => (row.podcast || row.article || row.unit)?.id

/**
 * Record a visit AND keep the Dashboard's cached recency row truthful.
 *
 * THIS REPLACES `recordView(...)` FOLLOWED BY `invalidate(KEY)`, and that pair
 * was the bug behind "I open a podcast, go back home, and it shows the HSK card
 * first, then swaps to the podcast". Two things went wrong together:
 *
 *   1. Invalidating DELETES the cached row, so the Dashboard came back with no
 *      history at all and filled the row with its padding suggestion - unit 1
 *      of the biggest HSK level - until the refetch landed and the podcast took
 *      the first slot.
 *   2. The invalidate ran the instant the POST was SENT, not when it finished,
 *      so a quick return could refetch before the server had written the visit
 *      and get the old order back.
 *
 * When the caller can describe the row (a podcast or an article, whose tile
 * needs only fields the page already holds) and the Dashboard has a cached
 * copy, the row is moved to the front of that copy immediately: going back
 * paints the right card on the first frame and needs no request at all. Its
 * shape mirrors RecentViewController::shape exactly.
 *
 * When it cannot - a study unit's tile needs its level's cover, which the unit
 * page does not load - the cache is dropped only AFTER the server has recorded
 * the visit, so the refetch that follows can only see the new order.
 */
export function noteRecentView(token, kind, id, row) {
  const optimistic = Boolean(row) && hasCache(KEY)

  if (optimistic) {
    const current = readCache(KEY)
    const list = Array.isArray(current) ? current : []
    const rest = list.filter(
      (r) => !(r.kind === kind && Number(idOf(r)) === Number(id)),
    )
    writeCache(KEY, [row, ...rest].slice(0, 3))
  }

  return api
    .recordView(token, kind, id)
    .catch(() => {})
    .then(() => {
      if (!optimistic) invalidate(KEY)
    })
}
