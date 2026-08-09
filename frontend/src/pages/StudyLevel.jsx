import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import './StudyLevel.css'

export default function StudyLevel() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const [level, setLevel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const modulesRef = useRef(null)

  const [title, setTitle] = useState('')
  const [lessonLabel, setLessonLabel] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadLevel()
  }, [token, id])

  function loadLevel() {
    setLoading(true)
    api
      .getStudyLevel(token, id)
      .then(setLevel)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.createStudyUnit(token, id, {
        title,
        lesson_label: lessonLabel,
        description,
      })
      setTitle('')
      setLessonLabel('')
      setDescription('')
      setShowForm(false)
      loadLevel()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // "Start now" drops the reader straight into the first lesson card.
  function scrollToModules() {
    modulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading) return <p className="sl-empty">Loading...</p>
  if (error && !level) return <p className="sl-error">{error}</p>
  if (!level) return null

  const units = level.units || []
  // Exposed as a custom property so the pill and button can derive their
  // own shades from it rather than hardcoding one level's colour.
  const accent = level.accent_color || '#ee6d08'

  return (
    <div className="sl">
      <nav className="sl-breadcrumb">
        <Link to="/study">Study</Link>
        <span className="sl-breadcrumb-sep">/</span>
        <span className="sl-breadcrumb-current">{level.title}</span>
      </nav>

      {error && <p className="sl-error">{error}</p>}

      <section className="sl-hero" style={{ '--hero-accent': accent }}>
        <div className="sl-hero-content">
          {level.level_label && <span className="sl-hero-pill">{level.level_label}</span>}
          <h1 className="sl-hero-title">{level.title}</h1>
          {level.description && <p className="sl-hero-subtitle">{level.description}</p>}
          <button type="button" className="sl-hero-btn" onClick={scrollToModules}>
            Start now
          </button>
        </div>

        {level.banner_url && (
          <img className="sl-hero-art" src={level.banner_url} alt="" draggable="false" />
        )}
      </section>

      <div className="sl-section-head" ref={modulesRef}>
        <h2 className="sl-section-title">Modules</h2>
        <p className="sl-section-subtitle">Select your current level</p>
      </div>

      {user?.is_admin && (
        <div className="sl-admin">
          <button type="button" className="sl-btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'New module'}
          </button>
        </div>
      )}

      {showForm && user?.is_admin && (
        <form className="sl-form" onSubmit={handleCreate}>
          <div>
            <label>Lesson label</label>
            <input
              value={lessonLabel}
              onChange={(e) => setLessonLabel(e.target.value)}
              placeholder="e.g. 第一课"
            />
          </div>
          <div>
            <label>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 我们去机场接你们 - We will pick you up at the airport"
              required
            />
          </div>
          <div>
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <button type="submit" className="sl-btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create module'}
          </button>
        </form>
      )}

      <div className="sl-panel">
        {units.length === 0 ? (
          <p className="sl-empty">No modules yet.</p>
        ) : (
          <ul className="sl-modules">
            {units.map((unit) => (
              <li key={unit.id}>
                <Link className="sl-module" to={`/study/units/${unit.id}`}>
                  <span className="sl-module-label">{unit.lesson_label || unit.title}</span>
                  <span className="sl-module-divider" aria-hidden="true" />
                  <span className="sl-module-body">
                    <span className="sl-module-title">{unit.title}</span>
                    <span className="sl-module-meta">
                      {unit.vocabulary_count ?? 0} words &nbsp;{unit.grammar_points_count ?? 0} Grammar
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
