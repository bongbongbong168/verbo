import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import SectionToggle from '../components/SectionToggle'
import iconBell from '../assets/dashboard/icon-bell.png'
import iconProfile from '../assets/dashboard/icon-profile.png'
import './Read.css'

const TYPE_LABELS = {
  article: 'Article',
  story: 'Story',
  funfact: 'Fun fact',
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function Read() {
  const { token, user } = useAuth()
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeType, setActiveType] = useState('all')
  const [showForm, setShowForm] = useState(false)

  const [title, setTitle] = useState('')
  const [type, setType] = useState('article')
  const [body, setBody] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [image, setImage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadArticles()
  }, [token])

  function loadArticles() {
    setLoading(true)
    api
      .getArticles(token)
      .then(setArticles)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.createArticle(token, { title, type, body, body_en: bodyEn, image })
      setTitle('')
      setType('article')
      setBody('')
      setBodyEn('')
      setImage(null)
      setShowForm(false)
      loadArticles()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Only offer filters for types that actually have content.
  const availableTypes = useMemo(() => {
    const present = new Set(articles.map((a) => a.type))
    return Object.keys(TYPE_LABELS).filter((t) => present.has(t))
  }, [articles])

  const visible = useMemo(
    () => (activeType === 'all' ? articles : articles.filter((a) => a.type === activeType)),
    [articles, activeType]
  )

  const [featured, ...rest] = visible

  return (
    <div className="rd">
      <div className="rd-topbar">
        <SectionToggle active="read" />
        <div className="rd-topbar-icons">
          <button type="button" className="rd-icon-btn" aria-label="Notifications">
            <img src={iconBell} alt="" />
          </button>
          <button type="button" className="rd-icon-btn" aria-label="Profile">
            <img src={iconProfile} alt="" />
          </button>
        </div>
      </div>

      <hr className="rd-divider" />

      <div className="rd-heading-row">
        <h1 className="rd-heading">Read Station</h1>
        {user?.is_admin && (
          <button type="button" className="rd-new-btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'New article'}
          </button>
        )}
      </div>

      {error && <p className="rd-error">{error}</p>}

      {showForm && user?.is_admin && (
        <form className="rd-form" onSubmit={handleCreate}>
          <div>
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="article">Article</option>
              <option value="story">Story</option>
              <option value="funfact">Fun fact</option>
            </select>
          </div>
          <div>
            <label>Body (Chinese text)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required />
          </div>
          <div>
            <label>English translation (optional — enables the EN toggle)</label>
            <textarea value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} rows={6} />
          </div>
          <div>
            <label>Image</label>
            <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} />
          </div>
          <button type="submit" className="rd-btn-primary" disabled={submitting}>
            {submitting ? 'Publishing...' : 'Publish'}
          </button>
        </form>
      )}

      {availableTypes.length > 1 && (
        <div className="rd-filters">
          <button
            type="button"
            className={'rd-filter' + (activeType === 'all' ? ' active' : '')}
            onClick={() => setActiveType('all')}
          >
            All
          </button>
          {availableTypes.map((t) => (
            <button
              key={t}
              type="button"
              className={'rd-filter' + (activeType === t ? ' active' : '')}
              onClick={() => setActiveType(t)}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      <div className="rd-panel">
        {loading ? (
          <p className="rd-empty">Loading...</p>
        ) : visible.length === 0 ? (
          <p className="rd-empty">No articles yet.</p>
        ) : (
          <>
            <Link className="rd-featured" to={`/read/${featured.id}`}>
              <div className="rd-featured-body">
                <h2 className="rd-featured-title">{featured.title}</h2>
                {featured.excerpt && <p className="rd-featured-excerpt">{featured.excerpt}</p>}
              </div>
              <div className="rd-thumb rd-thumb-lg">
                {featured.image_url && <img src={featured.image_url} alt="" />}
                <span className="rd-thumb-date">{formatDate(featured.created_at)}</span>
              </div>
            </Link>

            {rest.length > 0 && (
              <>
                <span className="rd-type-pill">{TYPE_LABELS[featured.type] || featured.type}</span>
                <div className="rd-grid">
                  {rest.map((a) => (
                    <Link className="rd-card" key={a.id} to={`/read/${a.id}`}>
                      <div className="rd-card-body">
                        <p className="rd-card-title">{a.title}</p>
                        {a.excerpt && <p className="rd-card-excerpt">{a.excerpt}</p>}
                      </div>
                      <div className="rd-thumb">
                        {a.image_url && <img src={a.image_url} alt="" />}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
