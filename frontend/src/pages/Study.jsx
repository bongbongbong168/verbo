import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import DailyUseList from '../components/DailyUseList'
import './Study.css'

const CATEGORIES = [
  { key: 'hsk', label: 'HSK' },
  { key: 'daily', label: 'Daily use' },
]

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

/* The reference animation steps every 3.2s (a 1.75s move, then a still hold).
   Both are shortened here — the pacing suits a showcase loop but drags on a
   page you navigate — while keeping its move-then-rest rhythm: a 0.8s move
   (see `--st-move` on `.st-stage`) and a ~1.7s hold, so the card it lands on
   still gets a beat to be looked at. Keep this above the transition duration
   or the next step interrupts the last. */
const ADVANCE_EVERY_MS = 2500
const RESUME_AFTER_MS = 10000

export default function Study() {
  const { token, user } = useAuth()
  const navigate = useNavigate()

  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState('hsk')
  const [active, setActive] = useState(0)
  const [showForm, setShowForm] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [newCategory, setNewCategory] = useState('hsk')
  const [image, setImage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadLevels()
  }, [token])

  function loadLevels() {
    setLoading(true)
    api
      .getStudyLevels(token)
      .then(setLevels)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.createStudyLevel(token, { title, description, category: newCategory, image })
      setTitle('')
      setDescription('')
      setImage(null)
      setShowForm(false)
      loadLevels()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const visible = useMemo(
    () => levels.filter((l) => (l.category || 'hsk') === category),
    [levels, category]
  )

  // Reset to the first card whenever the visible set changes, so the active
  // index can never point past the end of a shorter list.
  useEffect(() => {
    setActive(0)
  }, [category, levels.length])

  const count = visible.length

  const step = useCallback(
    (dir) => {
      if (count === 0) return
      setActive((i) => (i + dir + count) % count)
    },
    [count]
  )

  /* Auto-advance, timed off the reference animation: the card moves for 1.75s
     (see the transition in Study.css) and then rests before the next step. Any
     interaction hands control back to the user, and it only starts itself again
     once they have been idle for RESUME_AFTER_MS. */
  const [paused, setPaused] = useState(false)
  const resumeTimer = useRef(null)

  const holdForUser = useCallback(() => {
    setPaused(true)
    clearTimeout(resumeTimer.current)
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_AFTER_MS)
  }, [])

  useEffect(() => () => clearTimeout(resumeTimer.current), [])

  useEffect(() => {
    if (paused || count <= 1) return
    // Someone who has asked for less motion should not get a carousel that
    // moves on its own.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const id = setInterval(() => step(1), ADVANCE_EVERY_MS)
    return () => clearInterval(id)
  }, [paused, count, step])

  // Arrow keys drive the carousel too — it is the primary control on this page.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      holdForUser()
      step(e.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, holdForUser])

  /**
   * Signed shortest distance from the active card, so the ring wraps both ways
   * (with 5 cards, index 4 sits at -1 rather than +4). Cards beyond one step
   * are parked behind the centre and faded out, which is what makes the
   * rotation read as a continuous carousel instead of items popping in.
   */
  function offsetFrom(index) {
    if (count === 0) return 0
    let diff = index - active
    if (diff > count / 2) diff -= count
    if (diff < -count / 2) diff += count
    return diff
  }

  // translate3d rather than translateX so the browser composites the move on
  // the GPU instead of repainting the scaled artwork each frame.
  function cardStyle(offset) {
    const abs = Math.abs(offset)
    const side = Math.sign(offset)

    if (abs === 0) {
      // Fully opaque, deliberately. At 0.9 a tenth of the cards stacked behind
      // it bled through the cover art, so the one you are actually choosing
      // looked seen-through. The neighbours are dimmed instead — the contrast
      // between them is what says which card is live, not a fade on the front
      // one.
      return { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', opacity: 1, zIndex: 30 }
    }
    if (abs === 1) {
      return {
        transform: `translate3d(${side * 62}%, 0, 0) rotate(${side * 11}deg) scale(0.9)`,
        opacity: 0.55,
        zIndex: 20,
      }
    }
    // Everything further out waits behind the centre, invisible but still
    // transitioning, so stepping into view animates rather than snaps.
    return {
      transform: `translate3d(${side * 80}%, 0, 0) rotate(${side * 16}deg) scale(0.8)`,
      opacity: 0,
      zIndex: 10,
      pointerEvents: 'none',
    }
  }

  return (
    <div className="st">
      <div className="st-header">
        <div className="st-heading-block">
          {/* The heading follows the tab. "Select Your Level" is true of HSK,
              which is a ladder; Daily Use is a set of situations with no level
              to select, so saying it there would misdescribe the page. */}
          <h1 className="st-heading">
            {category === 'daily' ? 'Daily Use' : 'Select Your Level'}
          </h1>
          <p className="st-subtitle">
            {category === 'daily'
              ? 'Learn how Chinese is actually used in everyday situations.'
              : 'Pick the proficiency option fits you best'}
          </p>
        </div>

        <div className="st-toggle">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={'st-toggle-item' + (category === c.key ? ' active' : '')}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="st-error">{error}</p>}

      {user?.is_admin && (
        <div className="st-admin">
          <button type="button" className="st-btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'New level'}
          </button>
        </div>
      )}

      {showForm && user?.is_admin && (
        <form className="st-form" onSubmit={handleCreate}>
          <div>
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. HSK 3" required />
          </div>
          <div>
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="e.g. Master 600 words and intermediate communication skills."
            />
          </div>
          <div>
            <label>Category</label>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Cover image</label>
            <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} />
          </div>
          <button type="submit" className="st-btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create level'}
          </button>
        </form>
      )}

      {/* Daily Use gets its own arrangement rather than the carousel. HSK is a
          ladder and the rotation says "you are here on it"; Daily Use has no
          order — you pick the situation you are about to be in — so a card that
          has to be caught while moving would fight the whole idea. It fetches
          its own shelves, so this branch returns before the carousel's data is
          touched. */}
      {category === 'daily' ? (
        <DailyUseList />
      ) : loading ? (
        <p className="st-empty">Loading...</p>
      ) : count === 0 ? (
        <p className="st-empty">No levels in HSK yet.</p>
      ) : (
        <>
          {/* pointerdown covers both a tap and a click, so touching the cards
              anywhere stops the rotation before it moves under the finger. */}
          {/* Two speeds, driven by the flag that already exists. `paused` is
              set by holdForUser() on every user interaction, so it IS "the
              user is driving this" — no new state needed.

              A click wants to feel answered, so it gets a short ease-OUT: the
              card leaves at full speed the instant you press and settles
              gently. The idle rotation keeps a longer glide, because nobody is
              waiting on it. Both curves are gentler than the old
              easeInOutQuint, which was so flat at the start that a click read
              as lag before it snapped. */}
          <div
            className="st-stage"
            onPointerDown={holdForUser}
            style={
              paused
                ? { '--st-move': '0.42s', '--st-ease': 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
                : { '--st-move': '0.8s', '--st-ease': 'cubic-bezier(0.65, 0, 0.35, 1)' }
            }
          >
            {visible.map((level, index) => {
              const offset = offsetFrom(index)
              const isActive = offset === 0
              return (
                <button
                  key={level.id}
                  type="button"
                  className={'st-book' + (isActive ? ' active' : '')}
                  style={cardStyle(offset)}
                  aria-hidden={Math.abs(offset) > 1}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => (isActive ? navigate(`/study/${level.id}`) : setActive(index))}
                  title={isActive ? `Open ${level.title}` : `Show ${level.title}`}
                >
                  {level.image_url ? (
                    <img src={level.image_url} alt={level.title} draggable="false" />
                  ) : (
                    <span className="st-book-fallback">
                      <span className="st-book-fallback-title">{level.title}</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="st-controls">
            <button
              type="button"
              className="st-arrow"
              onClick={() => {
                holdForUser()
                step(-1)
              }}
              aria-label="Previous level"
            >
              <ChevronLeft />
            </button>

            <div className="st-dots">
              {visible.map((level, index) => (
                <button
                  key={level.id}
                  type="button"
                  className={'st-dot' + (index === active ? ' active' : '')}
                  onClick={() => {
                    holdForUser()
                    setActive(index)
                  }}
                  aria-label={`Go to ${level.title}`}
                  aria-current={index === active}
                />
              ))}
            </div>

            <button
              type="button"
              className="st-arrow"
              onClick={() => {
                holdForUser()
                step(1)
              }}
              aria-label="Next level"
            >
              <ChevronRight />
            </button>
          </div>

          <div className="st-active-meta">
            <h2 className="st-active-title">{visible[active]?.title}</h2>
            {visible[active]?.description && (
              <p className="st-active-description">{visible[active].description}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
