import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import StudyEditDrawer from '../components/StudyEditDrawer'
import './StudyLevel.css'

export default function StudyLevel() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const [level, setLevel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [savingCover, setSavingCover] = useState(false)
  const modulesRef = useRef(null)

  /* The new-module fields live in StudyEditDrawer now. */

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

  /* Throws on failure so the drawer keeps the message beside the fields. */
  async function handleCreate(values) {
    await api.createStudyUnit(token, id, values)
    setShowForm(false)
    loadLevel()
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
        {/* An HSK level is a ladder you pick a rung of; a Daily Use topic is
            one situation with lessons that run in order. "Select your current
            level" describes the first and misdescribes the second. */}
        <h2 className="sl-section-title">
          {level.category === 'daily' ? 'Lessons' : 'Modules'}
        </h2>
        <p className="sl-section-subtitle">
          {level.category === 'daily'
            ? 'Work through them in order'
            : 'Select your current level'}
        </p>
      </div>

      {user?.is_admin && (
        <div className="sl-admin">
          <button type="button" className="sl-btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'New module'}
          </button>

          {/* The cover picture every card of this topic shows. A label wrapping
              a hidden input rather than a button plus a ref: the file dialog
              has to be opened by the input itself, and this is the one control
              that gets that for free.

              `title` rides along because the endpoint requires it on every
              save — sending only the file would 422. */}
          <label className="sl-btn-quiet">
            {savingCover ? 'Uploading…' : level.image_url ? 'Change picture' : 'Add picture'}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={savingCover}
              onChange={async (e) => {
                const image = e.target.files?.[0]
                // Clear it immediately so picking the SAME file twice still
                // fires a change event — the browser suppresses it otherwise.
                e.target.value = ''
                if (!image) return
                setSavingCover(true)
                setError(null)
                try {
                  const updated = await api.updateStudyLevel(token, level.id, {
                    title: level.title,
                    description: level.description,
                    level_label: level.level_label,
                    image,
                  })
                  /* Merge rather than replace: `update` returns the bare model
                     with no relations, so assigning it wholesale would wipe the
                     `units` this page is rendering. Same trap the culture save
                     on StudyUnit hit. */
                  setLevel((prev) => ({ ...prev, ...updated }))
                } catch (err) {
                  setError(err.message)
                } finally {
                  setSavingCover(false)
                }
              }}
            />
          </label>
        </div>
      )}

      {/* The shared drawer, matching every other admin surface in the app. */}
      {showForm && user?.is_admin && (
        <StudyEditDrawer
          kind="module"
          levelTitle={level?.title}
          onSave={handleCreate}
          onClose={() => setShowForm(false)}
        />
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
