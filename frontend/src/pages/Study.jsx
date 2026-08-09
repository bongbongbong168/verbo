import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
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

  // Arrow keys drive the carousel too — it is the primary control on this page.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

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
      return { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', opacity: 0.9, zIndex: 30 }
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
          <h1 className="st-heading">Select Your Level</h1>
          <p className="st-subtitle">Pick the proficiency option fits you best</p>
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

      {loading ? (
        <p className="st-empty">Loading...</p>
      ) : count === 0 ? (
        <p className="st-empty">No levels in {category === 'hsk' ? 'HSK' : 'Daily use'} yet.</p>
      ) : (
        <>
          <div className="st-stage">
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
            <button type="button" className="st-arrow" onClick={() => step(-1)} aria-label="Previous level">
              <ChevronLeft />
            </button>

            <div className="st-dots">
              {visible.map((level, index) => (
                <button
                  key={level.id}
                  type="button"
                  className={'st-dot' + (index === active ? ' active' : '')}
                  onClick={() => setActive(index)}
                  aria-label={`Go to ${level.title}`}
                  aria-current={index === active}
                />
              ))}
            </div>

            <button type="button" className="st-arrow" onClick={() => step(1)} aria-label="Next level">
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
