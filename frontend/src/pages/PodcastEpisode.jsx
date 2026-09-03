import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { exampleFor } from '../sentence'
import WordPopover from '../components/WordPopover'
import ImageCropper from '../components/ImageCropper'
import './PodcastEpisode.css'

/* Cover art ratio, shared by the list card (261x150) and this page (290x167).
   Both render the same file, so the crop has to satisfy both. */
const COVER_ASPECT = 261 / 150

const LEVELS = ['Beginner', 'Intermediate', 'Advanced']

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

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState('Beginner')
  const [bio, setBio] = useState('')
  const [transcript, setTranscript] = useState('')
  const [transcriptEn, setTranscriptEn] = useState('')
  /* Two independent switches, mirroring the reader: the Chinese never leaves
     the page — turning an aid on ADDS to it rather than replacing it. */
  const [showPinyin, setShowPinyin] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)
  const [audio, setAudio] = useState(null)
  const [image, setImage] = useState(null)
  const [cropSource, setCropSource] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  useEffect(() => {
    if (!image) return setImagePreview(null)
    const url = URL.createObjectURL(image)
    setImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])
  const [submitting, setSubmitting] = useState(false)

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
        setTitle(data.title)
        setLevel(data.level || 'Beginner')
        setBio(data.bio || '')
        setTranscript(data.transcript)
        setTranscriptEn(data.transcript_en || '')
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

  async function handleUpdate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.updatePodcast(token, id, { title, level, bio, transcript, transcriptEn, audio, image })
      setEditing(false)
      setAudio(null)
      setImage(null)
      loadPodcast()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
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

  const author = podcast.user?.name || ''
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
              <p className="pe-empty">No audio uploaded for this episode.</p>
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

      {editing ? (
        <form className="pe-form" onSubmit={handleUpdate}>
          <div>
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label>Level</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} />
          </div>
          <div>
            <label>Transcript (Chinese text)</label>
            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={8} required />
          </div>
          <div>
            {/* Optional, exactly like an article's English body: without it the
                episode is Chinese-only and the Translation switch stays off. */}
            <label>English transcript (optional)</label>
            <textarea
              value={transcriptEn}
              onChange={(e) => setTranscriptEn(e.target.value)}
              rows={6}
            />
          </div>
          <div>
            <label>Replace audio</label>
            <input type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files[0])} />
          </div>
          <div>
            <label>Replace cover image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const picked = e.target.files[0]
                if (picked) setCropSource(picked)
                e.target.value = ''
              }}
            />
            {image && imagePreview && (
              <span className="pe-photo-chosen">
                <img src={imagePreview} alt="" />
                Ready to upload
                <button type="button" onClick={() => setCropSource(image)}>
                  Adjust
                </button>
              </span>
            )}
          </div>
          <button type="submit" className="pe-btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      ) : (
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

      {cropSource && (
        <ImageCropper
          file={cropSource}
          aspect={COVER_ASPECT}
          outputWidth={720}
          onCancel={() => setCropSource(null)}
          onCrop={(cropped) => {
            setImage(cropped)
            setCropSource(null)
          }}
        />
      )}
    </div>
  )
}
