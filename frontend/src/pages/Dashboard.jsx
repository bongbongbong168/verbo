import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import heroSwoosh from '../assets/dashboard/hero-swoosh-final.png'
import './Dashboard.css'

function FlameIcon() {
  return (
    <svg className="db-streak-flame" viewBox="0 0 24 24" fill="#db5c0d">
      <path d="M12.5 2c.3 2.4-.6 3.9-2 5.3C8.6 8.8 7 10.4 7 13a5 5 0 0 0 10 0c0-1.6-.6-2.7-1.3-3.7-.1.9.1 1.7.5 2.3-1-.2-1.7-1-1.9-2-1.6 1-2.3 2.4-2.3 3.9a2.5 2.5 0 0 0 5 0c0-.6-.1-1.1-.3-1.6.9 1 1.3 2.3 1.3 3.6a5.5 5.5 0 0 1-11 0c0-3.4 2-5.3 3.7-7C11.8 6.8 12.7 5 12.5 2z" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg className="db-btn-cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

export default function Dashboard() {
  const { token, user } = useAuth()
  const [quote, setQuote] = useState(null)
  const [tutors, setTutors] = useState([])
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editingQuote, setEditingQuote] = useState(false)
  const [quoteChinese, setQuoteChinese] = useState('')
  const [quotePinyin, setQuotePinyin] = useState('')
  const [quoteEnglish, setQuoteEnglish] = useState('')
  const [savingQuote, setSavingQuote] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [token])

  function loadDashboard() {
    setLoading(true)
    Promise.all([api.getQuote(token), api.getTutors(token), api.getArticles(token)])
      .then(([quoteData, tutorData, articleData]) => {
        setQuote(quoteData)
        setQuoteChinese(quoteData?.chinese || '')
        setQuotePinyin(quoteData?.pinyin || '')
        setQuoteEnglish(quoteData?.english || '')
        setTutors(tutorData.slice(0, 3))
        setArticles(articleData.slice(0, 5))
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleSaveQuote(e) {
    e.preventDefault()
    setError(null)
    setSavingQuote(true)
    try {
      const updated = await api.saveQuote(token, {
        chinese: quoteChinese,
        pinyin: quotePinyin,
        english: quoteEnglish,
      })
      setQuote(updated)
      setEditingQuote(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingQuote(false)
    }
  }

  if (loading) return <p>Loading...</p>

  return (
    <div className="db">
      {error && <p className="db-error">{error}</p>}

      <div className="db-hero">
        <img className="db-hero-swoosh" src={heroSwoosh} alt="" />
        <span className="db-streak-badge" title="Streak tracking is not built yet">
          <FlameIcon />
          1 day streak
        </span>
        <div className="db-hero-content">
          <h1 className="db-greeting">你好, {user?.name}!</h1>

          {editingQuote ? (
            <form className="db-quote-form" onSubmit={handleSaveQuote}>
              <div>
                <label>Chinese</label>
                <input value={quoteChinese} onChange={(e) => setQuoteChinese(e.target.value)} />
              </div>
              <div>
                <label>Pinyin</label>
                <input value={quotePinyin} onChange={(e) => setQuotePinyin(e.target.value)} />
              </div>
              <div>
                <label>English</label>
                <input value={quoteEnglish} onChange={(e) => setQuoteEnglish(e.target.value)} />
              </div>
              <div className="db-quote-form-actions">
                <button type="submit" className="db-btn-primary" disabled={savingQuote}>
                  {savingQuote ? 'Saving...' : 'Save quote'}
                </button>
                <button type="button" className="db-btn-ghost" onClick={() => setEditingQuote(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              {quote?.chinese && <p className="db-quote-chinese">{quote.chinese}</p>}
              {quote?.pinyin && <p className="db-quote-pinyin">{quote.pinyin}</p>}
              {quote?.english && <p className="db-quote-english">"{quote.english}"</p>}
              {!quote?.chinese && !quote?.english && (
                <p className="db-quote-empty">No quote set yet.</p>
              )}
            </>
          )}

          <div className="db-hero-actions">
            <Link to="/find-tutor" className="db-btn-cta">
              Find Tutor
              <ArrowRightIcon />
            </Link>
            {user?.is_admin && !editingQuote && (
              <button type="button" className="db-quote-edit-toggle" onClick={() => setEditingQuote(true)}>
                Edit quote
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="db-section">
        <h2 className="db-section-title">Recommended Teachers</h2>
        {tutors.length === 0 ? (
          <p className="db-empty">No tutors yet.</p>
        ) : (
          <div className="db-teachers-grid">
            {tutors.map((t) => (
              <Link className="db-teacher-card" key={t.id} to={`/find-tutor/${t.id}`}>
                {t.photo_url ? (
                  <img className="db-teacher-photo" src={t.photo_url} alt={t.user.name} />
                ) : (
                  <div className="db-teacher-photo-placeholder">
                    {t.user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <p className="db-teacher-name">{t.user.name}</p>
                {t.subjects && <p className="db-teacher-meta">{t.subjects}</p>}
                {t.hourly_rate != null && (
                  <span className="db-teacher-rate">${t.hourly_rate}/hr</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="db-section">
        <h2 className="db-section-title">Reads</h2>
        {articles.length === 0 ? (
          <p className="db-empty">No articles yet.</p>
        ) : (
          <div className="db-reads-list">
            {articles.map((a) => (
              <Link className="db-read-row" key={a.id} to={`/read/${a.id}`}>
                <div className="db-read-body">
                  <p className="db-read-title">{a.title}</p>
                  <span className="db-read-type">{a.type}</span>
                </div>
                {a.image_url ? (
                  <img className="db-read-thumb" src={a.image_url} alt="" />
                ) : (
                  <div className="db-read-thumb-placeholder" />
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
