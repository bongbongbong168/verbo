import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { exampleFor } from '../sentence'
import { invalidate, isFresh, readCache, writeCache } from '../dataCache'
import Skeleton, { SkeletonText } from '../components/Skeleton'
import WordPopover from '../components/WordPopover'
import PodcastEditDrawer from '../components/PodcastEditDrawer'
import './PodcastEpisode.css'
import ReaderSwitch from '../components/ReaderSwitch'

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
        api.recordView(token, 'podcast', id).catch(() => {})
        // The recency order changed, so the Dashboard's cached copy is stale.
        invalidate('recent-views:3')
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
        api.recordView(token, 'podcast', id).catch(() => {})
        invalidate('recent-views:3')
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
        example: exampleFor(current?.tokens, word),
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

  function handleSeek(e) {
    const el = audioRef.current
    if (!el || !Number.isFinite(el.duration)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    el.currentTime = ratio * el.duration
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
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  /* Chinese-only episodes stay valid: the Translation switch renders disabled
     with a reason rather than opening onto a blank pane. */
  const hasEnglish = Boolean(podcast.transcript_en && podcast.transcript_en.trim())

  return (
    <div className="pe">
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
                  onPause={(e) => {
                    setPlaying(false)
                    reportProgress(true)
                  }}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => {
                    setDuration(e.currentTarget.duration)
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

                {resumedFrom != null && (
                  <p className="pe-resumed">
                    Picked up from {formatTime(resumedFrom)}
                    <button type="button" className="pe-resumed-reset" onClick={startOver}>
                      Start over
                    </button>
                  </p>
                )}

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
                    onClick={handleSeek}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(currentTime)}
                  >
                    <span className="pe-progress-fill" style={{ width: `${progress}%` }} />
                    <span className="pe-progress-handle" style={{ left: `${progress}%` }} />
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

          <p className="pe-hint">Hover a word and press Alt+1 to save it to your flashcard bank.</p>
          <p className={'pe-transcript' + (showPinyin ? ' pe-transcript-ruby' : '')}>
            {podcast.tokens.map((tok, idx) =>
              tok.type === 'word' ? (
                <span
                  key={idx}
                  className={
                    'pe-word' +
                    // Keyed by the WORD, so every occurrence in the transcript
                    // is marked, not only the one you pressed Alt+1 on.
                    (saved[tok.text] ? ' saved' : '') +
                    (hovered?.tok === tok ? ' active' : '')
                  }
                  onMouseEnter={(e) => {
                    hoveredWordRef.current = tok
                    setHovered({ tok, rect: e.currentTarget.getBoundingClientRect() })
                  }}
                  onMouseLeave={() => {
                    if (hoveredWordRef.current === tok) hoveredWordRef.current = null
                    setHovered((cur) => (cur?.tok === tok ? null : cur))
                  }}
                >
                  {/* Pinyin sits ABOVE the character, the way a textbook
                      prints it. The hover handlers stay on this outer span, so
                      Alt+1 keeps working with the ruby showing. */}
                  {showPinyin && tok.pinyin && (
                    <span className="pe-word-py">{tok.pinyin}</span>
                  )}
                  <span className="pe-word-hz">{tok.text}</span>
                </span>
              ) : (
                <span key={idx}>{tok.text}</span>
              )
            )}
          </p>

          {/* `transcript_en` is one free-text block, not per-line pairs, so it
              renders as its own passage under the Chinese rather than
              pretending to be aligned line by line. */}
          {showTranslation && hasEnglish && (
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
          onClose={() => setEditing(false)}
        />
      )}

    </div>
  )
}
