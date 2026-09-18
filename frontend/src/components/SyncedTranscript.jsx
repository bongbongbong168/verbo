import { memo, useEffect, useMemo, useRef } from 'react'
import './SyncedTranscript.css'

/**
 * The word-timed transcript: the word being spoken lights up, and clicking a
 * word plays from it.
 *
 * THE HIGHLIGHT NEVER GOES THROUGH REACT STATE. The audio moves several words
 * a second and the transcript is hundreds of spans, so a setState per word
 * would re-render all of them each time. Instead the timings are flattened
 * once into a sorted list, the current word is found by binary search, and
 * only the two spans that change get their class swapped directly. React
 * renders this component when the transcript, the pinyin switch or the saved
 * set changes - never because the audio moved.
 *
 * TWO CLOCKS, because neither is enough alone. requestAnimationFrame follows
 * the voice smoothly while playing, but it is throttled to nothing in a
 * background tab; `timeupdate` / `seeked` still fire there, and they are also
 * what catch a seek made while PAUSED, when no frame loop is running.
 *
 * The playing highlight is a static class with no transition, the app's
 * frozen-compositor rule: a word that could only light up while frames
 * arrive would sit dark in exactly the tab that is not drawing.
 */

/* Keep a word lit through a short pause after it rather than blinking off
   between every pair of words; a longer silence still clears it. */
const HOLD_SECONDS = 0.6

/* After the listener scrolls by hand, stop pulling the page back to the
   voice for this long. */
const FOLLOW_PAUSE_MS = 6000

function SyncedTranscript({ segments, audioRef, showPinyin, saved, onHoverWord, onLeaveWord, onSeek }) {
  /* Every timed word in play order, with where it lives on the page. Built
     once per transcript, so the per-frame work is a binary search over plain
     numbers and nothing else. */
  const timeline = useMemo(() => {
    const out = []
    segments.forEach((seg, si) => {
      seg.words.forEach((tok, wi) => {
        if (tok.type === 'word' && tok.start != null) {
          out.push({ start: tok.start, end: tok.end ?? tok.start, si, key: `${si}-${wi}` })
        }
      })
    })
    out.sort((a, b) => a.start - b.start)
    return out
  }, [segments])

  const wordEls = useRef(new Map())
  const segEls = useRef([])
  const activeWord = useRef(null)
  const activeSeg = useRef(-1)
  const lastManualScroll = useRef(0)

  useEffect(() => {
    const el = audioRef.current
    if (!el || timeline.length === 0) return undefined

    function find(t) {
      // Last word that has started by `t`.
      let lo = 0
      let hi = timeline.length - 1
      let hit = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (timeline[mid].start <= t) {
          hit = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      if (hit === -1) return null
      const w = timeline[hit]
      const next = timeline[hit + 1]
      const until = Math.max(w.end, Math.min(w.end + HOLD_SECONDS, next ? next.start : Infinity))
      return t <= until ? w : null
    }

    function segmentAt(t, word) {
      if (word) return word.si
      // Between words: still inside a sentence counts as that sentence.
      return segments.findIndex((s) => s.start != null && s.end != null && t >= s.start && t <= s.end)
    }

    function follow(si) {
      const node = segEls.current[si]
      if (!node || Date.now() - lastManualScroll.current < FOLLOW_PAUSE_MS) return
      const r = node.getBoundingClientRect()
      // Only when the line is leaving the screen - never re-centre a line the
      // listener can already see, which is what makes auto-scroll annoying.
      if (r.top < 90 || r.bottom > window.innerHeight - 60) {
        node.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }

    function update() {
      const t = el.currentTime
      const word = find(t)
      const key = word ? word.key : null

      if (key !== activeWord.current) {
        if (activeWord.current) wordEls.current.get(activeWord.current)?.classList.remove('tt-on')
        if (key) wordEls.current.get(key)?.classList.add('tt-on')
        activeWord.current = key
      }

      const si = segmentAt(t, word)
      if (si !== activeSeg.current) {
        segEls.current[activeSeg.current]?.classList.remove('tt-seg-on')
        if (si >= 0) {
          segEls.current[si]?.classList.add('tt-seg-on')
          if (!el.paused) follow(si)
        }
        activeSeg.current = si
      }
    }

    let frame = 0
    function loop() {
      update()
      frame = requestAnimationFrame(loop)
    }
    function start() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(loop)
    }
    function stop() {
      cancelAnimationFrame(frame)
      update()
    }

    el.addEventListener('play', start)
    el.addEventListener('pause', stop)
    el.addEventListener('ended', stop)
    el.addEventListener('seeked', update)
    el.addEventListener('timeupdate', update)
    update()
    if (!el.paused) start()

    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('play', start)
      el.removeEventListener('pause', stop)
      el.removeEventListener('ended', stop)
      el.removeEventListener('seeked', update)
      el.removeEventListener('timeupdate', update)
    }
  }, [audioRef, timeline, segments])

  /* A re-render (pinyin switched on, a word saved) rebuilds className from
     scratch and would drop the highlight until the next word; put it back. */
  useEffect(() => {
    if (activeWord.current) wordEls.current.get(activeWord.current)?.classList.add('tt-on')
    segEls.current[activeSeg.current]?.classList.add('tt-seg-on')
  })

  /* Wheel, touch and paging keys are a person scrolling; the page's own
     scrollIntoView fires none of them, so following never pauses itself. */
  useEffect(() => {
    const mark = () => {
      lastManualScroll.current = Date.now()
    }
    const keys = (e) => {
      if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) mark()
    }
    window.addEventListener('wheel', mark, { passive: true })
    window.addEventListener('touchmove', mark, { passive: true })
    window.addEventListener('keydown', keys)
    return () => {
      window.removeEventListener('wheel', mark)
      window.removeEventListener('touchmove', mark)
      window.removeEventListener('keydown', keys)
    }
  }, [])

  function play(from) {
    // Clicking a word is asking to hear it, so following resumes too.
    lastManualScroll.current = 0
    onSeek(from)
  }

  return (
    <div className={'tt' + (showPinyin ? ' tt-ruby' : '')}>
      {segments.map((seg, si) => (
        <div
          key={si}
          className="tt-seg"
          ref={(node) => {
            segEls.current[si] = node
          }}
        >
          <p className="tt-line">
            {seg.words.map((tok, wi) => {
              if (tok.type !== 'word') return <span key={wi}>{tok.text}</span>

              const key = `${si}-${wi}`
              const timed = tok.start != null
              return (
                <span
                  key={wi}
                  ref={(node) => {
                    if (node) wordEls.current.set(key, node)
                    else wordEls.current.delete(key)
                  }}
                  className={'tt-word' + (timed ? '' : ' tt-untimed') + (saved[tok.text] ? ' tt-saved' : '')}
                  onMouseEnter={(e) => onHoverWord(tok, e.currentTarget.getBoundingClientRect(), seg)}
                  onMouseLeave={() => onLeaveWord(tok)}
                  onClick={(e) => {
                    // A tap on a phone is the only "hover" it has, so the
                    // word's card opens on click as well as playing it.
                    onHoverWord(tok, e.currentTarget.getBoundingClientRect(), seg)
                    if (timed) play(tok.start)
                  }}
                >
                  {showPinyin && tok.pinyin && <span className="tt-py">{tok.pinyin}</span>}
                  <span className="tt-hz">{tok.text}</span>
                </span>
              )
            })}
          </p>

          {seg.translation && <p className="tt-en">{seg.translation}</p>}
        </div>
      ))}
    </div>
  )
}

export default memo(SyncedTranscript)
