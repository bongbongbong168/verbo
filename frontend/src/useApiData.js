import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchThrough,
  invalidate,
  isFresh,
  readCache,
  hasCache,
  subscribe,
  writeCache,
} from './dataCache'

/**
 * Read one API resource, painting whatever is already known immediately.
 *
 * The contract that matters to callers is the difference between `loading` and
 * `refreshing`:
 *
 *   loading     nothing is known yet — this is the ONLY state that may show a
 *               skeleton, and it is false on every revisit.
 *   refreshing  something is on screen and a fresher copy is on the wire. Pages
 *               generally ignore it; it exists so a page CAN show a quiet
 *               indicator without pretending it has nothing.
 *
 * A revalidation that fails is deliberately swallowed when there is already
 * data on screen: the API stalls and errors intermittently, and replacing a
 * good page with an error banner because a background refresh failed is
 * strictly worse than leaving the page alone. `error` is only ever set when
 * there is nothing to show.
 *
 * @param key      cache key, e.g. 'articles' or `article:${id}`. A null key
 *                 disables the read entirely (route params not resolved yet).
 * @param fetcher  () => Promise<data>. Read from a ref, so an inline arrow
 *                 does not re-run the effect on every render.
 */
export function useApiData(key, fetcher, { enabled = true } = {}) {
  const active = enabled && Boolean(key)

  // Seed from cache DURING the first render, not in an effect — an effect runs
  // after paint, which would flash the skeleton for one frame on a revisit and
  // lose the whole point.
  const [data, setData] = useState(() => (active && hasCache(key) ? readCache(key) : undefined))
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(() => active && !hasCache(key))
  const [refreshing, setRefreshing] = useState(false)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  // Read in the effect rather than listing it as a dep: `data` changes on every
  // load, and depending on it would tear down and re-run the request.
  const dataRef = useRef(data)
  dataRef.current = data

  const load = useCallback(
    (force) => {
      if (!active) return Promise.resolve()

      const known = hasCache(key)
      if (known && !force) {
        // Paint what we have, then quietly bring it up to date.
        setData(readCache(key))
        setLoading(false)
        setRefreshing(true)
      } else if (!known) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      return fetchThrough(key, () => fetcherRef.current(), { force: true })
        .then((fresh) => {
          setData(fresh)
          setError(null)
        })
        .catch((err) => {
          // Only surface a failure that leaves the user with nothing.
          if (dataRef.current === undefined) setError(err)
        })
        .finally(() => {
          setLoading(false)
          setRefreshing(false)
        })
    },
    [key, active],
  )

  useEffect(() => {
    if (!active) return undefined

    let live = true

    // Another component may write this key while we are mounted (a mutation
    // elsewhere, or a shared in-flight request resolving). Follow it.
    const unsubscribe = subscribe(key, (next) => {
      if (live) {
        setData(next)
        setLoading(false)
      }
    })

    if (hasCache(key)) {
      setData(readCache(key))
      setLoading(false)

      /* Young enough that refetching buys nothing — paint and stop. This is
         what makes bouncing between two pages cost ZERO requests rather than
         one per visit against a bucket shared by the whole client. */
      if (isFresh(key)) {
        setRefreshing(false)
        return () => {
          live = false
          unsubscribe()
        }
      }
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    fetchThrough(key, () => fetcherRef.current(), { force: true })
      .then((fresh) => {
        if (!live) return
        setData(fresh)
        setError(null)
      })
      .catch((err) => {
        if (live && dataRef.current === undefined) setError(err)
      })
      .finally(() => {
        if (!live) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      live = false
      unsubscribe()
    }
  }, [key, active])

  /** Write through to the cache, so an edit survives leaving and returning. */
  const update = useCallback(
    (next) => {
      const value = typeof next === 'function' ? next(dataRef.current) : next
      if (key) writeCache(key, value)
      else setData(value)
    },
    [key],
  )

  const refresh = useCallback(() => {
    if (key) invalidate(key)
    return load(true)
  }, [key, load])

  return { data, error, loading, refreshing, refresh, setData: update }
}
