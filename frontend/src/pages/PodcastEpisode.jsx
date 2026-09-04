import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { exampleFor } from '../sentence'
import WordPopover from '../components/WordPopover'
import PodcastEditDrawer from '../components/PodcastEditDrawer'
import './PodcastEpisode.css'

/* The cover ratio and the level list moved into PodcastEditDrawer along with
   the form that used them — the crop has to satisfy both the list card
   (261x150) and this page (290x167), and that constraint now lives next to the
   cropper it configures. */

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.5 6.2v11.6c0 .8.9 1.3 1.6.9l9.2-5.8c.6-.4.6-1.4 0-1.8L10.1 5.3c-.7-.4-1.6.1-1.6.9z" />
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

  function loadPodcast() {
    setLoading(true)
    api
      .getPodcast(token, id)
      .then((data) => {
        setPodcast(data)
        podcastRef.current = data
        // Record the visit so the Dashboard's "Pick up where you left off"
        // row can point back here. Fire-and-forget: a failure must not stop
        // the page rendering, and there is nothing useful to tell the user.
        api.recordView(token, 'podcast', id).catch(() => {})
      })
      .catch((err) => setError(err.message))
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

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      el.play()
    } else {
      el.pause()
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
    loadPodcast()
  }

  async function handleDelete() {
    try {
      await api.deletePodcast(token, id)
      navigate('/podcast')
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <p className="pe-empty">Loading...</p>
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
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  onEnded={() => setPlaying(false)}
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
            <button
              type="button"
              className={'pe-switch' + (showPinyin ? ' on' : '')}
              onClick={() => setShowPinyin((v) => !v)}
              aria-pressed={showPinyin}
            >
              <span className="pe-switch-track">
                <span className="pe-switch-knob" />
              </span>
              Pinyin
            </button>

            <button
              type="button"
              className={'pe-switch' + (showTranslation ? ' on' : '')}
              onClick={() => setShowTranslation((v) => !v)}
              disabled={!hasEnglish}
              aria-pressed={showTranslation}
              title={
                hasEnglish
                  ? 'Show the English translation'
                  : 'No English transcript for this episode yet'
              }
            >
              <span className="pe-switch-track">
                <span className="pe-switch-knob" />
              </span>
              Translation
            </button>

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
