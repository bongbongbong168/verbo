import { useEffect, useRef } from 'react'
import { api } from '../api'

const BEAT_MS = 60_000 // one beat a minute; the server caps a gap at 120s
const IDLE_MS = 5 * 60_000 // no input for this long and we stop beating

/**
 * Counts time spent in the app, for the Dashboard's activity chart.
 *
 * Beats once a minute, but only while the tab is visible AND the user has
 * interacted recently — otherwise a page left open overnight would report as a
 * night of studying. The beat carries no duration: the server measures the gap
 * between beats itself, so this cannot inflate the total even if it misbehaves.
 *
 * Mounted once in Layout, so it covers every authenticated page rather than
 * needing to be remembered on each one.
 */
export default function useActivityHeartbeat(token) {
  const lastInputRef = useRef(Date.now())

  useEffect(() => {
    if (!token) return

    const markInput = () => {
      lastInputRef.current = Date.now()
    }

    // `passive` because none of these need to block scrolling, and pointermove
    // fires constantly — the handler only writes a timestamp.
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel']
    events.forEach((e) => window.addEventListener(e, markInput, { passive: true }))

    const beat = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastInputRef.current > IDLE_MS) return
      // Fire-and-forget: a failed beat costs a minute of the chart, which is
      // not worth surfacing to the user or retrying.
      api.recordActivity(token).catch(() => {})
    }

    // Beat immediately so a short visit still registers, then on the interval.
    beat()
    const id = setInterval(beat, BEAT_MS)

    // Coming back to the tab should resume counting straight away rather than
    // waiting out the remainder of the interval.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        markInput()
        beat()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      events.forEach((e) => window.removeEventListener(e, markInput))
    }
  }, [token])
}
