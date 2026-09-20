import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { exampleFor } from '../sentence'
import { invalidate, isFresh, readCache, writeCache } from '../dataCache'
import { noteRecentView } from '../recentViews'
import Skeleton, { SkeletonText } from '../components/Skeleton'
import WordPopover from '../components/WordPopover'
import PodcastEditDrawer from '../components/PodcastEditDrawer'
import './PodcastEpisode.css'
import ReaderSwitch from '../components/ReaderSwitch'
import PageTools from '../components/PageTools'
import SyncedTranscript from '../components/SyncedTranscript'
import { englishSentences, sentencesOf } from '../sentences'


/* The cover ratio and the level list moved into PodcastEditDrawer along with
   the form that used them — the crop has to satisfy both the list card
   (261x150) and this page (290x167), and that constraint now lives next to the
   cropper it configures. */

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.375 6.2v11.6c0 .8.9 1.3 1.6.9l9.2-5.8c.6-.4.6-1.4 0-1.8L7.975 5.3c-.7-.4-1.6.1-1.6.9z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="7" y="5" width="3.6" height="14" rx="1.2" />
      <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" />
    </svg>
  )
}

function Replay10Icon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5a7.5 7.5 0 1 1-7.3 9.2" />
      <polyline points="4.2 4.6 4.5 8.4 8.3 8.1" />
      <text x="12" y="15.4" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">10</text>
    </svg>
  )
}

function Forward10Icon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5a7.5 7.5 0 1 0 7.3 9.2" />
      <polyline points="19.8 4.6 19.5 8.4 15.7 8.1" />
      <text x="12" y="15.4" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">10</text>
    </svg>
  )
}

/* One mark with three states, rather than three drawings: the speaker cone is
   always there and the waves come and go with the level, so the glyph reports
   the volume as well as the button's purpose. Muted crosses it out instead of
   showing a silent cone, because a cone with no waves already means "quiet"
   and the two would be indistinguishable at 17px. */
function VolumeIcon({ level, muted }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
      {!muted && level > 0.02 && <path d="M15.6 9.6a3.6 3.6 0 0 1 0 4.8" />}
      {!muted && level > 0.55 && <path d="M18.1 7.2a7 7 0 0 1 0 9.6" />}
      {muted && <path d="M16.5 10l4 4M20.5 10l-4 4" />}
    </svg>
  )
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function PodcastEpisode() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const navigate = useNavigate()

  const [podcast, setPodcast] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastSaved, setLastSaved] = useState(null)
  const [saved, setSaved] = useState({})
  const [hovered, setHovered] = useState(null)
  const hoveredWordRef = useRef(null)
  /* The Alt+1 listener subscribes once (deps `[token]`), so its handler closes
     over the FIRST render where `podcast` is still null. Reading the episode
     off a ref is what keeps the saved word's source from silently going
     missing — same trick as `hoveredWordRef`. */
  const podcastRef = useRef(null)

  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  /* Resume state.
     `resumedFrom` is what the banner reports, and it is cleared by Start over —
     the seek itself is silent otherwise, and being dropped six minutes into an
     episode with no explanation reads as a bug rather than a convenience.
     `pendingResume` holds the position until the audio element knows its own
     duration; seeking before `loadedmetadata` is discarded by the browser. */
  const [resumedFrom, setResumedFrom] = useState(null)
  const pendingResumeRef = useRef(null)

  /* VOLUME IS REMEMBERED ACROSS EPISODES, because it is a property of where
     you are listening rather than of what you are listening to — turning it
     down on a train and having the next episode come back at full is the one
     behaviour nobody wants. Kept in `localStorage` rather than on the server:
     it is per-device by nature, and it must be right on the first frame, so a
     round trip would be both wrong and late.

     Read lazily inside `useState` so the first render already has the real
     value and the slider never jumps from 1 to the stored number. A bad or
     hand-edited entry falls back to full rather than to silence — an app that
     opens muted for no visible reason reads as broken audio. */
  const [volume, setVolume] = useState(() => {
    try {
      const raw = localStorage.getItem('pe-volume')
      /* THE NULL CHECK IS THE WHOLE POINT. `Number(null)` is 0, not NaN, so
         reading a key that was never written and handing it straight to a
         range check returns a perfectly valid ZERO — every first-time visitor
         got a silent player and no reason why. Caught by measuring the
         element: `audio.volume` was 0 on a fresh load. */
      if (raw === null || raw === '') return 1
      const n = Number(raw)
      return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1
    } catch {
      return 1
    }
  })
  const [muted, setMuted] = useState(false)
  /* The last position actually sent, so the timer can skip a write when
     nothing has moved — a paused tab should cost no requests at all. */
  const sentPositionRef = useRef(-1)

  /* Only "is the editor open" lives here now. The episode's fields, the audio
     and cover pickers, the cropper and its object-URL lifecycle all moved into
     PodcastEditDrawer, which seeds itself from `podcast` — so this page no
     longer keeps a second copy of the episode alongside the one it renders. */
  const [editing, setEditing] = useState(false)
  /* Two independent switches, mirroring the reader: the Chinese never leaves
     the page — turning an aid on ADDS to it rather than replacing it. */
  const [showPinyin, setShowPinyin] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)

  /* The word-timed transcript, when one has been imported. Fetched only then
     (the episode payload says so in `timed_transcript_status`), and cached
     under its own key so reopening the episode does not refetch it. */
  const [timed, setTimed] = useState(null)
  const [showSynced, setShowSynced] = useState(true)
  const timedReady = podcast?.timed_transcript_status === 'completed'

  useEffect(() => {
    if (!timedReady) {
      setTimed(null)
      return
    }
    const key = `podcast-timed:${id}`
    const cached = readCache(key)
    if (cached) {
      setTimed(cached)
      if (isFresh(key)) return
    }
    let live = true
    api
      .getTimedTranscript(token, id)
      .then((data) => {
        if (!live) return
        const segments = data.status === 'completed' ? data.segments : null
        setTimed(segments)
        if (segments) writeCache(key, segments)
      })
      // The plain transcript is still on the page, so a failure here only
      // costs the synced view; there is nothing worth interrupting for.
      .catch(() => {})
    return () => {
      live = false
    }
  }, [token, id, timedReady, podcast?.timed_transcript_at])

  useEffect(() => {
    loadPodcast()
  }, [token, id])

  /* Seeded from the shared cache rather than converted to `useApiData`: the
     episode lives in BOTH state and a ref (the Alt+1 listener reads the ref to
     dodge a stale closure), so priming the initial value is the surgical
     change. Reopening an episode then paints immediately. */
  function loadPodcast() {
    const key = `podcast:${id}`
    const cached = readCache(key)
    if (cached) {
      setPodcast(cached)
      podcastRef.current = cached
      setLoading(false)
      if (isFresh(key)) {
        // Still record the visit — opening it again is a real visit, and the
        // Dashboard's recency row is built from exactly this.
        noteRecentView(token, 'podcast', id, { kind: 'podcast', podcast: { id: cached.id, title: cached.title, level: cached.level, image_url: cached.image_url } })
        return
      }
    } else {
      setLoading(true)
    }

    api
      .getPodcast(token, id)
      .then((data) => {
        setPodcast(data)
        podcastRef.current = data
        writeCache(key, data)
        /* Hold the position until `loadedmetadata` — a seek before the element
           knows its duration is silently discarded. The server decides whether
           there is anything worth resuming (it owns the floor and the
           finished-episode rule), so this only obeys `resume`. */
        if (data.progress?.resume) {
          pendingResumeRef.current = data.progress.position_seconds
          sentPositionRef.current = data.progress.position_seconds
        }
        // Record the visit so the Dashboard's "Pick up where you left off"
        // row can point back here. Fire-and-forget: a failure must not stop
        // the page rendering, and there is nothing useful to tell the user.
        noteRecentView(token, 'podcast', id, { kind: 'podcast', podcast: { id: data.id, title: data.title, level: data.level, image_url: data.image_url } })
      })
      // Only a failure that leaves the page with nothing is worth showing.
      .catch((err) => !podcastRef.current && setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleSaveWord(word) {
    // Off the ref, not the state — see the note on `podcastRef`.
    const current = podcastRef.current
    try {
      await api.addFlashcard(token, {
        word: word.text,
        pinyin: word.pinyin,
        translation: word.translation,
        source_module: 'podcast',
        // Which episode, and the transcript line it was in — so the bank can
        // point back at the thing this word was actually heard in.
        source_type: 'podcast',
        source_id: current?.id,
        // A synced word carries the line it was heard in; a plain-transcript
        // word is looked up in the authored text as before.
        example: word.example ?? exampleFor(current?.tokens, word),
      })
      setLastSaved(word.text)
      setSaved((prev) => ({ ...prev, [word.text]: true }))
    } catch (err) {
      setError(err.message)
    }
  }

  // The popover is positioned `fixed` against a rect captured on hover, so a
  // scroll would leave it stranded next to the wrong word. Drop it instead.
  useEffect(() => {
    if (!hovered) return

    function drop() {
      hoveredWordRef.current = null
      setHovered(null)
    }

    window.addEventListener('scroll', drop, true)
    return () => window.removeEventListener('scroll', drop, true)
  }, [hovered])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.altKey && e.key === '1') {
        const word = hoveredWordRef.current
        if (word) {
          e.preventDefault()
          handleSaveWord(word)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [token])

  /* Send the current position, unless it has not moved since the last send.
     Fire-and-forget: this is a convenience, and a failed write must never
     interrupt playback or surface an error over the audio someone is
     listening to. */
  function reportProgress(force = false) {
    const el = audioRef.current
    const current = podcastRef.current
    if (!el || !current || !Number.isFinite(el.currentTime)) return
    const at = Math.round(el.currentTime)
    if (!force && at === sentPositionRef.current) return
    sentPositionRef.current = at
    api
      .savePodcastProgress(token, current.id, at, Number.isFinite(el.duration) ? el.duration : null)
      .catch(() => {})

    /* Both cached copies are now wrong. The episode payload carries `progress`,
       so a revisit inside the 30s freshness window would resume from where this
       listener was BEFORE this session; and the Podcast page's continue row
       would still show the old position, or not show the episode at all. This
       is a local map delete, not a request. */
    invalidate(`podcast:${current.id}`, 'podcasts-continue')
  }

  /* One write a quarter-minute while the audio is actually playing.
     The interval is only armed WHILE PLAYING, so an open-but-paused episode
     costs nothing — this app shares a 300/min bucket across the whole client
     and React StrictMode doubles everything in dev.

     `setInterval`, not requestAnimationFrame: rAF is throttled to a standstill
     in a background tab, which is exactly when someone is listening with the
     tab behind something else. Same reasoning as the booking hold countdown. */
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => reportProgress(), 15000)
    return () => clearInterval(t)
  }, [playing, token])

  /* Pausing and leaving are both "I stopped here", and neither is covered by
     the interval above — a pause clears it, and unmounting can happen between
     two ticks. `pagehide` covers closing the tab, where React cleanup does not
     run at all; `visibilitychange` is not used because switching tabs is not
     stopping. */
  useEffect(() => {
    const onLeave = () => reportProgress(true)
    window.addEventListener('pagehide', onLeave)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      onLeave()
    }
  }, [token])

  /* Stable identities, so the memoised synced transcript does not re-render
     every time the player's clock ticks. */
  const hoverTimedWord = useCallback((tok, rect, seg) => {
    const word = { ...tok, example: seg.text }
    hoveredWordRef.current = word
    setHovered({ tok: word, rect })
  }, [])

  const leaveTimedWord = useCallback((tok) => {
    if (hoveredWordRef.current?.text === tok.text) hoveredWordRef.current = null
    setHovered((cur) => (cur?.tok?.text === tok.text ? null : cur))
  }, [])

  const seekTo = useCallback((seconds) => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = seconds
    setCurrentTime(seconds)
    // Clicking a word means "let me hear that" - start it if it was paused.
    if (el.paused) el.play().catch(() => {})
  }, [])

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.play()
    } else {
      // The report happens on the element's own `pause` event, not here — see
      // the note on the <audio> tag.
      el.pause()
    }
  }

  /* Drop back to the beginning and forget the resume, so the banner's offer is
     genuinely reversible. */
  function startOver() {
    const el = audioRef.current
    if (el) el.currentTime = 0
    setResumedFrom(null)
    reportProgress(true)
  }

  /* The element is the source of truth for what you hear, so the state is
     pushed ONTO it rather than read from it. It runs on every change instead
     of only on mount because the <audio> is remounted whenever the episode's
     `audio_url` changes, and a fresh element starts at volume 1. */
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
    el.muted = muted
  }, [volume, muted, podcast?.audio_url])

  function changeVolume(next) {
    const v = Math.min(Math.max(next, 0), 1)
    setVolume(v)
    /* Dragging back up is how you unmute — leaving the mute flag on while the
       slider says 60% would show one thing and do another. */
    if (v > 0) setMuted(false)
    try {
      localStorage.setItem('pe-volume', String(v))
    } catch {
      /* Private windows and blocked site data both throw here. The volume
         still works for this session; only remembering it is lost. */
    }
  }

  function skip(seconds) {
    const el = audioRef.current
    if (!el) return
    el.currentTime = Math.min(Math.max(el.currentTime + seconds, 0), el.duration || 0)
  }

  /* THE BAR IS PAINTED EVERY FRAME, NOT ON `timeupdate`. That event fires
     about four times a second, so a bar driven by it stepped along in jumps.
     requestAnimationFrame moves it smoothly while playing, and writes straight
     to the two elements instead of through state, so the page does not
     re-render sixty times a second. `timeupdate` still paints too: rAF is
     throttled to nothing in a background tab, and the bar must be right when
     the listener comes back. */
  const fillRef = useRef(null)
  const handleRef = useRef(null)
  const draggingRef = useRef(false)

  const paintProgress = useCallback((seconds) => {
    const el = audioRef.current
    const total = el && Number.isFinite(el.duration) ? el.duration : 0
    const pct = total > 0 ? Math.min(Math.max(seconds / total, 0), 1) * 100 : 0
    if (fillRef.current) fillRef.current.style.width = `${pct}%`
    if (handleRef.current) handleRef.current.style.left = `${pct}%`
  }, [])

  useEffect(() => {
    if (!playing) return undefined
    let frame = 0
    const tick = () => {
      const el = audioRef.current
      if (el && !draggingRef.current) paintProgress(el.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, paintProgress])

  function seekFromPointer(e) {
    const el = audioRef.current
    const bar = e.currentTarget
    if (!el || !Number.isFinite(el.duration)) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    el.currentTime = ratio * el.duration
    setCurrentTime(el.currentTime)
    paintProgress(el.currentTime)
  }

  /* Press and drag to scrub, as well as click. Pointer capture keeps the drag
     alive when the pointer leaves the thin bar, which it always does. */
  function startScrub(e) {
    draggingRef.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Throws if the pointer is already gone; the click still seeks.
    }
    seekFromPointer(e)
  }

  function moveScrub(e) {
    if (draggingRef.current) seekFromPointer(e)
  }

  function endScrub() {
    draggingRef.current = false
  }

  /* Arrow keys on the focused bar, since it is a slider to a keyboard user. */
  function scrubKey(e) {
    if (e.key === 'ArrowRight') skip(5)
    else if (e.key === 'ArrowLeft') skip(-5)
    else return
    e.preventDefault()
  }

  /* The drawer owns the fields, the busy flag and the error. Reloading is what
     re-runs the transcript annotation, so the hover tokens match the new text. */
  async function handleUpdate(values) {
    await api.updatePodcast(token, id, values)
    /* Drop the cached copies BEFORE reloading, or the freshness window would
       hand back the pre-edit episode. The library list carries the title and
       level, so it is stale too. */
    invalidate(`podcast:${id}`, 'podcasts')
    loadPodcast()
  }

  async function handleDelete() {
    try {
      await api.deletePodcast(token, id)
      invalidate(`podcast:${id}`, 'podcasts', 'recent-views:3')
      navigate('/podcast')
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading)
    return (
      <div className="pe">
        <Skeleton style={{ height: 15, width: 170, marginBottom: '1.4rem' }} />
        <Skeleton style={{ height: 200, borderRadius: 16, marginBottom: '1.4rem' }} />
        <Skeleton style={{ height: 30, width: '55%', marginBottom: '1.2rem' }} />
        <SkeletonText lines={10} />
      </div>
    )
  if (error && !podcast) return <p className="pe-error">{error}</p>
  if (!podcast) return null

  /* The PRESENTER first, and only then the account that uploaded it. This page
     was still showing `user.name`, which is why it read "admin" and
     "BannerVerify" — the same thing the cards were fixed for. */
  const author = podcast.host || podcast.user?.name || ''
  /* Chinese-only episodes stay valid: the Translation switch renders disabled
     with a reason rather than opening onto a blank pane. */
  const hasEnglish = Boolean(podcast.transcript_en && podcast.transcript_en.trim())
  /* Synced needs audio to sync to; without it the plain transcript stands. */
  const synced = Boolean(timed && timed.length && podcast.audio_url && showSynced)
  const cnSentences = sentencesOf(podcast.tokens || [])
  const enSentences = englishSentences(podcast.transcript_en)
  const paired = showTranslation && hasEnglish && cnSentences.length > 0 && cnSentences.length === enSentences.length

  /* IN SYNCED MODE THE ENGLISH IS MATCHED TO SEGMENTS BY LINE INDEX, so it may
     only be used when there is exactly one line per segment. Without that
     check the first line simply landed on the first segment whatever it was —
     an episode whose `transcript_en` was a one-character placeholder rendered
     that character as the translation of its opening sentence, and a real
     translation with a different number of lines would have been worse: every
     line quietly attached to the wrong sentence. When the counts disagree the
     English falls back to one passage under the transcript, which is the same
     rule `paired` follows for the unsynced view. */
  const timedTranslations = (podcast.transcript_en || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const syncedPaired = showTranslation && synced && timedTranslations.length === timed.length

  function renderPlainTokens(tokens, keyPrefix = '') {
    return tokens.map((tok, idx) => tok.type === 'word' ? (
      <span
        key={`${keyPrefix}${idx}`}
        className={'pe-word' + (saved[tok.text] ? ' saved' : '') + (hovered?.tok === tok ? ' active' : '')}
        onMouseEnter={(e) => {
          hoveredWordRef.current = tok
          setHovered({ tok, rect: e.currentTarget.getBoundingClientRect() })
        }}
        onMouseLeave={() => {
          if (hoveredWordRef.current === tok) hoveredWordRef.current = null
          setHovered((cur) => (cur?.tok === tok ? null : cur))
        }}
      >
        {showPinyin && tok.pinyin && <span className="pe-word-py">{tok.pinyin}</span>}
        <span className="pe-word-hz">{tok.text}</span>
      </span>
    ) : <span key={`${keyPrefix}${idx}`}>{tok.text}</span>)
  }

  return (
    <div className="pe">
      {/* Messages, notifications and the account menu, top right as on the
          Podcast page this one is opened from. */}
      <div className="pe-topbar">
        <div className="pe-topbar-icons">
          <PageTools />
        </div>
      </div>

      {error && <p className="pe-error">{error}</p>}

      <div className="pe-card">
        <div className="pe-card-top">
          <div className="pe-cover">
            {podcast.image_url ? <img src={podcast.image_url} alt="" /> : <div className="pe-cover-placeholder" />}
          </div>

          <div className="pe-card-info">
            <h1 className="pe-title">{podcast.title}</h1>

            <div className="pe-author-row">
              <span className="pe-avatar">{author ? author.charAt(0).toUpperCase() : '?'}</span>
              <div>
                {author && <p className="pe-author-name">{author}</p>}
                <p className="pe-author-lang">Chinese (Mandarin)</p>
              </div>
            </div>

            {podcast.audio_url ? (
              <div className="pe-player">
                <audio
                  ref={audioRef}
                  src={podcast.audio_url}
                  preload="metadata"
                  onPlay={() => setPlaying(true)}
                  /* Reporting here rather than in `togglePlay` on purpose: the
                     page's own button is not the only thing that pauses audio.
                     Media keys, the OS media controls and the browser's own UI
                     all pause the element directly and never touch our handler,
                     so a listener who stops with the keyboard would have lost
                     their place. This fires however it was paused. */
                  onPause={() => {
                    setPlaying(false)
                    reportProgress(true)
                  }}
                  onTimeUpdate={(e) => {
                    setCurrentTime(e.currentTarget.currentTime)
                    if (!draggingRef.current) paintProgress(e.currentTarget.currentTime)
                  }}
                  onSeeked={(e) => paintProgress(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => {
                    setDuration(e.currentTarget.duration)
                    paintProgress(e.currentTarget.currentTime)
                    // Now the seek will stick. Applied once, then cleared, so a
                    // later metadata event cannot yank the listener back.
                    const at = pendingResumeRef.current
                    if (at != null) {
                      pendingResumeRef.current = null
                      e.currentTarget.currentTime = at
                      setCurrentTime(at)
                      setResumedFrom(at)
                    }
                  }}
                  onEnded={() => {
                    setPlaying(false)
                    // Marks it finished server-side, which is what drops it out
                    // of "continue listening" rather than leaving it at 99%.
                    reportProgress(true)
                  }}
                />

                <div className="pe-controls">
                  <button type="button" className="pe-skip" onClick={() => skip(-10)} aria-label="Back 10 seconds">
                    <Replay10Icon />
                  </button>
                  <button
                    type="button"
                    className="pe-play"
                    onClick={togglePlay}
                    aria-label={playing ? 'Pause' : 'Play'}
                  >
                    {playing ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  <button type="button" className="pe-skip" onClick={() => skip(10)} aria-label="Forward 10 seconds">
                    <Forward10Icon />
                  </button>
                </div>

                <div className="pe-progress-wrap">
                  <div
                    className="pe-progress"
                    onPointerDown={startScrub}
                    onPointerMove={moveScrub}
                    onPointerUp={endScrub}
                    onPointerCancel={endScrub}
                    onKeyDown={scrubKey}
                    tabIndex={0}
                    role="slider"
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(currentTime)}
                    aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                  >
                    {/* No inline width: paintProgress owns it. A style prop
                        here would be re-applied on every render with a value
                        up to a quarter-second old and tug the bar backwards. */}
                    <span ref={fillRef} className="pe-progress-fill" />
                    <span ref={handleRef} className="pe-progress-handle" />
                  </div>
                  <div className="pe-times">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* VOLUME. The button and the slider are one control: the
                    button is the fast path (silence it now, put it back) and
                    the slider is the fine one, and they share a single piece
                    of state so they can never disagree.

                    `input[type=range]` rather than a hand-built track. It is
                    keyboard-operable, draggable and announced correctly for
                    free, and this is a control people expect to behave
                    exactly like every other volume slider they have used. */}
                <div className="pe-volume">
                  <button
                    type="button"
                    className="pe-volume-btn"
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                  >
                    <VolumeIcon level={volume} muted={muted} />
                  </button>
                  <input
                    className="pe-volume-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={muted ? 0 : volume}
                    onChange={(e) => changeVolume(Number(e.target.value))}
                    aria-label="Volume"
                  />
                </div>
              </div>
            ) : (
              /* The player as a PLACEHOLDER: the same controls in the same
                 places, dimmed and inert, with an empty track and a dash where
                 the running time goes. The header keeps its shape whether or
                 not a recording exists, and the slot is visibly waiting for one
                 rather than collapsing to a line of text.

                 Buttons carry `disabled` rather than being spans — they are
                 real controls that do not work YET, which is exactly what
                 `disabled` means, and it keeps them out of the tab order
                 without needing aria-hidden. The line underneath says why. */
              <>
                <div className="pe-player pe-player-empty">
                  <div className="pe-controls">
                    <button type="button" className="pe-skip" disabled aria-hidden="true">
                      <Replay10Icon />
                    </button>
                    <button type="button" className="pe-play" disabled aria-label="No audio to play yet">
                      <PlayIcon />
                    </button>
                    <button type="button" className="pe-skip" disabled aria-hidden="true">
                      <Forward10Icon />
                    </button>
                  </div>

                  <div className="pe-progress-wrap">
                    <div className="pe-progress" aria-hidden="true">
                      <span className="pe-progress-fill" style={{ width: '0%' }} />
                    </div>
                    <div className="pe-times">
                      <span>0:00</span>
                      <span>--:--</span>
                    </div>
                  </div>
                </div>

                {/* OUTSIDE the dimmed block on purpose. `opacity` on a parent
                    creates a group its children cannot exceed, so a note nested
                    inside would render at the same 45% as the dead controls —
                    and this is the one line that has to be readable. */}
                <p className="pe-player-note">
                  Audio for this episode has not been uploaded yet.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Under the cover-and-player row, not inside it: in the info column
            it added a line and pushed the player below the cover's edge. */}
        {resumedFrom != null && (
          <p className="pe-resumed">
            Picked up from {formatTime(resumedFrom)}
            <button type="button" className="pe-resumed-reset" onClick={startOver}>
              Start over
            </button>
          </p>
        )}

        {podcast.bio && (
          <>
            <hr className="pe-card-divider" />
            <p className="pe-description">{podcast.bio}</p>
          </>
        )}
      </div>

      <div className="pe-transcript-header">
        <h2 className="pe-transcript-heading">Transcript</h2>
        {user?.is_admin && (
          <div className="pe-admin-actions">
            <button type="button" className="pe-btn-primary" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancel edit' : 'Edit'}
            </button>
            <button type="button" className="pe-btn-danger" onClick={handleDelete}>
              Delete
            </button>
          </div>
        )}
      </div>

      {lastSaved && <p className="pe-saved-note">Saved &ldquo;{lastSaved}&rdquo; to flashcards.</p>}

      {(
        <div className="pe-transcript-panel">
          {/* The same two switches the reader has. Neither replaces the
              Chinese — pinyin stacks above each word and the English sits
              underneath as its own passage. */}
          <div className="pe-aids">
            {timed && timed.length > 0 && podcast.audio_url && (
              <ReaderSwitch
                label="Sync with audio"
                on={showSynced}
                onChange={() => setShowSynced((v) => !v)}
                title="Highlight each word as it is spoken"
              />
            )}

            <ReaderSwitch
              label="Pinyin"
              on={showPinyin}
              onChange={() => setShowPinyin((v) => !v)}
            />

            <ReaderSwitch
              label="Translation"
              on={showTranslation}
              onChange={() => setShowTranslation((v) => !v)}
              disabled={!hasEnglish}
              title={
                hasEnglish
                  ? 'Show the English translation'
                  : 'No English transcript for this episode yet'
              }
            />

            {!hasEnglish && (
              <span className="pe-aids-note">
                No English transcript for this episode yet.
              </span>
            )}
          </div>

          <p className="pe-hint">
            {synced
              ? 'Click a word to play from it. Hover a word and press Alt+1 to save it to your flashcard bank.'
              : 'Hover a word and press Alt+1 to save it to your flashcard bank.'}
          </p>
          {synced ? (
            <SyncedTranscript
              segments={timed}
              translations={syncedPaired ? timedTranslations : null}
              audioRef={audioRef}
              showPinyin={showPinyin}
              showTranslation={showTranslation}
              saved={saved}
              onHoverWord={hoverTimedWord}
              onLeaveWord={leaveTimedWord}
              onSeek={seekTo}
            />
          ) : paired ? (
            cnSentences.map((sentence, i) => (
              <div className="pe-pair" key={`pair-${i}`}>
                <p className={'pe-transcript pe-transcript-pair' + (showPinyin ? ' pe-transcript-ruby' : '')}>
                  {renderPlainTokens(sentence, `s${i}-`)}
                </p>
                <p className="pe-pair-en">{enSentences[i]}</p>
              </div>
            ))
          ) : (
            <p className={'pe-transcript' + (showPinyin ? ' pe-transcript-ruby' : '')}>
              {renderPlainTokens(podcast.tokens)}
            </p>
          )}

          {/* `transcript_en` is one free-text block, not per-line pairs, so it
              renders as its own passage under the Chinese rather than
              pretending to be aligned line by line. */}
          {/* Whichever view is on decides whether the English was already
              placed line by line — `paired` describes the plain transcript and
              means nothing while the synced one is showing. */}
          {showTranslation && hasEnglish && !(synced ? syncedPaired : paired) && (
            <div className="pe-translation">
              <span className="pe-translation-label">English</span>
              <p className="pe-translation-body">{podcast.transcript_en}</p>
            </div>
          )}
        </div>
      )}

      <WordPopover word={hovered?.tok} rect={hovered?.rect} saved={!!saved[hovered?.tok?.text]} />

      {/* Editing sits OVER the episode rather than replacing it, so the
          transcript being changed stays on screen while it is changed. */}
      {editing && user?.is_admin && (
        <PodcastEditDrawer
          key={podcast.updated_at || podcast.id}
          podcast={podcast}
          onSave={handleUpdate}
          onTimedChange={(info) => {
            /* Patched in place, NOT reloaded: a reload with the cache dropped
               shows the skeleton, which unmounts this drawer mid-task. The
               changed timestamp is what makes the effect above refetch. */
            invalidate(`podcast-timed:${id}`)
            const next = {
              ...podcastRef.current,
              timed_transcript_status: info.status,
              timed_transcript_at: info.processed_at,
            }
            podcastRef.current = next
            setPodcast(next)
            writeCache(`podcast:${id}`, next)
          }}
          onClose={() => setEditing(false)}
        />
      )}

    </div>
  )
}
