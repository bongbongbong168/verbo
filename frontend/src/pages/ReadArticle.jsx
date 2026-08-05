import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import iconBell from '../assets/dashboard/icon-bell.png'
import iconProfile from '../assets/dashboard/icon-profile.png'
import './Read.css'

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="17.5" x2="12" y2="21" />
    </svg>
  )
}

function BooksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M12 3 2.5 7.5 12 12l9.5-4.5L12 3z" />
      <path d="M2.5 12 12 16.5 21.5 12" fill="none" />
      <path d="M2.5 16.5 12 21l9.5-4.5" fill="none" />
    </svg>
  )
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function ReadArticle() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const navigate = useNavigate()

  const [article, setArticle] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastSaved, setLastSaved] = useState(null)
  const [lang, setLang] = useState('cn')
  const hoveredWordRef = useRef(null)

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('article')
  const [body, setBody] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [image, setImage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadArticle()
  }, [token, id])

  function loadArticle() {
    setLoading(true)
    api
      .getArticle(token, id)
      .then((data) => {
        setArticle(data)
        setTitle(data.title)
        setType(data.type)
        setBody(data.body)
        setBodyEn(data.body_en || '')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleSaveWord(word) {
    try {
      await api.addFlashcard(token, {
        word: word.text,
        pinyin: word.pinyin,
        translation: word.translation,
        source_module: 'read',
      })
      setLastSaved(word.text)
    } catch (err) {
      setError(err.message)
    }
  }

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

  async function handleUpdate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.updateArticle(token, id, { title, type, body, body_en: bodyEn, image })
      setEditing(false)
      setImage(null)
      loadArticle()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    try {
      await api.deleteArticle(token, id)
      navigate('/read')
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <p className="rd-empty">Loading...</p>
  if (error && !article) return <p className="rd-error">{error}</p>
  if (!article) return null

  const hasEnglish = Boolean(article.body_en && article.body_en.trim())

  return (
    <div className="rd">
      <div className="rd-topbar">
        <div className="rd-toggle">
          <Link to="/podcast" className="rd-toggle-item">
            <MicIcon />
            Podcast
          </Link>
          <Link to="/read" className="rd-toggle-item active">
            <BooksIcon />
            Reads
          </Link>
        </div>
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
          <div className="rd-admin-actions">
            <button type="button" className="rd-new-btn" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancel edit' : 'Edit'}
            </button>
            <button type="button" className="rd-danger-btn" onClick={handleDelete}>
              Delete
            </button>
          </div>
        )}
      </div>

      {error && <p className="rd-error">{error}</p>}

      <div className="rd-panel">
        <div className="rd-featured rd-featured-static">
          <div className="rd-featured-body">
            <h2 className="rd-featured-title">{article.title}</h2>
            {article.body_en && <p className="rd-featured-excerpt">{article.body_en.slice(0, 140)}</p>}
          </div>
          <div className="rd-thumb rd-thumb-lg">
            {article.image_url && <img src={article.image_url} alt="" />}
            <span className="rd-thumb-date">{formatDate(article.created_at)}</span>
          </div>
        </div>

        {editing ? (
          <form className="rd-form" onSubmit={handleUpdate}>
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
              <label>Replace image</label>
              <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} />
            </div>
            <button type="submit" className="rd-btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        ) : (
          <>
            <div className="rd-lang-toggle">
              <button
                type="button"
                className={'rd-lang' + (lang === 'en' ? ' active' : '')}
                onClick={() => setLang('en')}
                disabled={!hasEnglish}
                title={hasEnglish ? 'Show English translation' : 'No English translation for this article yet'}
              >
                EN
              </button>
              <button
                type="button"
                className={'rd-lang' + (lang === 'cn' ? ' active' : '')}
                onClick={() => setLang('cn')}
              >
                CN
              </button>
            </div>

            {lastSaved && <p className="rd-saved-note">Saved &ldquo;{lastSaved}&rdquo; to flashcards.</p>}

            {lang === 'cn' ? (
              <>
                <p className="rd-hint">Hover a word and press Alt+1 to save it to your flashcard bank.</p>
                <p className="rd-body rd-body-cn">
                  {article.tokens.map((tok, idx) =>
                    tok.type === 'word' ? (
                      <span
                        key={idx}
                        className="rd-word"
                        title={`${tok.pinyin}${tok.translation ? ' - ' + tok.translation : ''}`}
                        onMouseEnter={() => {
                          hoveredWordRef.current = tok
                        }}
                        onMouseLeave={() => {
                          if (hoveredWordRef.current === tok) hoveredWordRef.current = null
                        }}
                      >
                        {tok.text}
                      </span>
                    ) : (
                      <span key={idx}>{tok.text}</span>
                    )
                  )}
                </p>
              </>
            ) : (
              <p className="rd-body">{article.body_en}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
