/* A tiny read-through cache for GET responses, shared by every page via
 * `useApiData`.
 *
 * WHY THIS EXISTS. Switching pages felt slow, and measurement showed why: the
 * deployed API answers most requests in ~200ms but stalls 1-15s on roughly one
 * request in three, and pages were throwing away everything they knew on every
 * visit. Dashboard -> Read -> Dashboard refetched all eight Dashboard calls and
 * blanked the screen until the slowest of them landed. Cached, the second visit
 * paints immediately and the refresh happens behind it, so a stalled request
 * costs a late update instead of a blank page.
 *
 * It is deliberately NOT a query library. There is no TTL, no garbage
 * collection and no retry: entries live until the tab closes or something
 * invalidates them, which is the whole behaviour this app needs.
 *
 * SECURITY. The cache is keyed by resource, NOT by user, so it MUST be emptied
 * whenever the account changes — otherwise the next person to sign in on this
 * browser paints the previous person's dashboard before their own data
 * arrives. `AuthContext` calls `clearCache()` on login, logout and registration
 * for exactly that reason; adding another way to become a different user means
 * adding another call.
 */

/**
 * How long a cached entry is treated as FRESH — revisited within this window,
 * a page paints from cache and does not even refetch behind the scenes.
 *
 * Without it, stale-while-revalidate still fires one request per mount, so
 * bouncing between two pages a few times spends a dozen requests re-fetching
 * lists that cannot have changed. This app shares a 300/min bucket across the
 * whole client (and React StrictMode doubles everything in dev), so that is
 * real budget. Thirty seconds is short enough that another device's edit still
 * shows up on the next visit, and long enough to make back-and-forth free.
 *
 * It is NOT a correctness mechanism: anything this client changes itself calls
 * `invalidate()`, which drops the entry regardless of age.
 */
const FRESH_MS = 30_000

/** key -> { data, at } */
const cache = new Map()

/** key -> in-flight promise, so N callers for one key share one request. */
const inFlight = new Map()

/** Subscribers, so a write reaches every mounted component reading that key. */
const listeners = new Map()

export function readCache(key) {
  return cache.get(key)?.data
}

export function hasCache(key) {
  return cache.has(key)
}

/**
 * True when the entry is young enough that refetching it buys nothing.
 *
 * `maxAge` lets a caller widen the window to match its own cadence — the
 * unread-count pollers pass their poll interval, so navigating between pages
 * cannot refire a count that is about to be refreshed on a timer anyway.
 */
export function isFresh(key, maxAge = FRESH_MS) {
  const entry = cache.get(key)
  return Boolean(entry) && Date.now() - entry.at < maxAge
}

/** Write a value and notify everyone currently reading this key. */
export function writeCache(key, data) {
  cache.set(key, { data, at: Date.now() })
  const subs = listeners.get(key)
  if (subs) subs.forEach((fn) => fn(data))
}

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set())
  listeners.get(key).add(fn)
  return () => {
    const subs = listeners.get(key)
    if (!subs) return
    subs.delete(fn)
    if (subs.size === 0) listeners.delete(key)
  }
}

/**
 * Fetch through the cache, collapsing concurrent callers onto one request.
 *
 * `force` skips the cached value but still shares an in-flight request — a
 * revalidation already on the wire is exactly what a forced read wants.
 */
export function fetchThrough(key, fetcher, { force = false } = {}) {
  if (!force && cache.has(key)) return Promise.resolve(readCache(key))
  if (inFlight.has(key)) return inFlight.get(key)

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      writeCache(key, data)
      return data
    })
    .finally(() => inFlight.delete(key))

  inFlight.set(key, promise)
  return promise
}

/**
 * Resolve from cache when the entry is still fresh, otherwise refetch.
 *
 * This is what the pages that hold their data in their OWN state use, in place
 * of `useApiData`. Without it they revalidate on every mount, which for a page
 * you bounce in and out of is a request per visit against a shared bucket.
 */
export function fetchIfStale(key, fetcher) {
  if (isFresh(key)) return Promise.resolve(readCache(key))
  return fetchThrough(key, fetcher, { force: true })
}

/**
 * Drop cached entries so the next read refetches.
 *
 * Called after a mutation. A bare string drops that one key; a string ending in
 * `:` drops every key beneath it (`invalidate('article:')` after deleting an
 * article), which is what keeps a list and its detail rows from disagreeing.
 */
export function invalidate(...keys) {
  keys.forEach((key) => {
    if (key.endsWith(':')) {
      for (const existing of [...cache.keys()]) {
        if (existing.startsWith(key)) cache.delete(existing)
      }
      for (const existing of [...inFlight.keys()]) {
        if (existing.startsWith(key)) inFlight.delete(existing)
      }
      return
    }
    cache.delete(key)
    inFlight.delete(key)
  })
}

/** Empty everything. MUST run on any change of account — see the note above. */
export function clearCache() {
  cache.clear()
  inFlight.clear()
}
