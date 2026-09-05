import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { useApiData } from '../useApiData'
import { invalidate } from '../dataCache'
import StudyEditDrawer from '../components/StudyEditDrawer'
import Skeleton from '../components/Skeleton'
import './StudyLevel.css'

export default function StudyLevel() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [savingCover, setSavingCover] = useState(false)
  // Its own state, not the page's load error: a failed cover upload must not
  // replace a level that is on screen and perfectly readable.
  const [coverError, setCoverError] = useState(null)
  const modulesRef = useRef(null)

  /* Deliberately the SAME cache key the Dashboard uses for its featured level,
     so reopening a level you have already visited paints immediately instead of
     waiting on a request that may stall for seconds. */
  const levelQuery = useApiData(`study-level:${id}`, () => api.getStudyLevel(token, id))
  const level = levelQuery.data ?? null
  const loading = levelQuery.loading
  const error = levelQuery.error?.message || null
  const setLevel = levelQuery.setData

  /* The new-module fields live in StudyEditDrawer now. */

  /* Throws on failure so the drawer keeps the message beside the fields. */
  async function handleCreate(values) {
    await api.createStudyUnit(token, id, values)
    setShowForm(false)
    // The unit count changed, so the Study list and the Dashboard's tile are
    // both stale now — not just this page.
    invalidate('study-levels')
    levelQuery.refresh()
  }

  // "Start now" drops the reader straight into the first lesson card.
  function scrollToModules() {
    modulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* A skeleton in the page's own shape rather than the word "Loading", so the
     header and module list do not appear to jump into existence. */
  if (loading)
    return (
      <div className="sl">
        <Skeleton style={{ height: 18, width: 220, marginBottom: '1.2rem' }} />
        <Skeleton style={{ height: 210, borderRadius: 18, marginBottom: '1.4rem' }} />
        <Skeleton style={{ height: 74, marginBottom: '0.7rem' }} />
        <Skeleton style={{ height: 74, marginBottom: '0.7rem' }} />
        <Skeleton style={{ height: 74 }} />
      </div>
    )
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

      {(coverError || error) && <p className="sl-error">{coverError || error}</p>}

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
                setCoverError(null)
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
                  // The cover is on the Study list and the Dashboard tile too.
                  invalidate('study-levels')
                } catch (err) {
                  setCoverError(err.message)
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
