import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import WordPopover from '../components/WordPopover'
import './SharedScan.css'

/**
 * The page someone sees when they open a shared scan link.
 *
 * Deliberately outside ProtectedRoute and Layout: the visitor has no account,
 * so there is no sidebar and nothing here may assume a logged-in user. Hover
 * translation still works — it is baked into the payload — but Alt+1 saving
 * does not, because saving needs a flashcard bank to save into.
 */
export default function SharedScan() {
  const { shareToken } = useParams()
  const [scan, setScan] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    api
      .getSharedScan(shareToken)
      .then(setScan)
      .catch((err) =>
        // A 404 here is the ordinary case — the owner turned sharing off, or
        // the link was mistyped. Say that rather than showing a raw error.
        setError(
          err.status === 404
            ? 'This link is no longer available. The owner may have stopped sharing it.'
            : err.message
        )
      )
      .finally(() => setLoading(false))
  }, [shareToken])

  if (loading) return <p className="ss-state">Loading…</p>

  if (error) {
    return (
      <div className="ss">
        <div className="ss-card ss-card-center">
          <p className="ss-error">{error}</p>
          <Link className="ss-btn" to="/login">
            Go to Verbo
          </Link>
        </div>
      </div>
    )
  }

  const tokens = scan?.tokens || []
  const words = scan?.words || []

  return (
    <div className="ss">
      <header className="ss-top">
        <span className="ss-brand">Verbo</span>
        <span className="ss-badge">Shared document</span>
      </header>

      <div className="ss-card">
        <div className="ss-head">
          <h1 className="ss-title">{scan.original_filename || 'Scanned document'}</h1>
          {scan.created_at && (
            <span className="ss-date">
              Scanned{' '}
              {new Date(scan.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>

        <div className="ss-body">
          <div className="ss-textcol">
            <div className="ss-panel-head">
              <h2 className="ss-panel-title">Recognized text</h2>
              {tokens.length > 0 && <span className="ss-hint">Hover a word for pinyin</span>}
            </div>

            {scan.raw_text ? (
              <p className="ss-text">
                {tokens.map((tok, idx) =>
                  tok.type === 'word' ? (
                    <span
                      key={idx}
                      className={'ss-token' + (hovered?.tok === tok ? ' active' : '')}
                      onMouseEnter={(e) =>
                        setHovered({ tok, rect: e.currentTarget.getBoundingClientRect() })
                      }
                      onMouseLeave={() => setHovered((cur) => (cur?.tok === tok ? null : cur))}
                    >
                      {tok.text}
                    </span>
                  ) : (
                    <span key={idx}>{tok.text}</span>
                  )
                )}
              </p>
            ) : (
              <p className="ss-empty">No text was detected in this image.</p>
            )}
          </div>

          {words.length > 0 && (
            <aside className="ss-words">
              <h2 className="ss-panel-title">Words</h2>
              <ul className="ss-wordlist">
                {words.map((w, i) => (
                  <li key={i}>
                    <span className="ss-word-hanzi">{w.word}</span>
                    <span className="ss-word-meta">
                      {[w.pinyin, w.translation].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>

        <footer className="ss-foot">
          <span>Shared with you from Verbo.</span>
          <Link className="ss-btn" to="/register">
            Create your own
          </Link>
        </footer>
      </div>

      <WordPopover word={hovered?.tok} rect={hovered?.rect} />
    </div>
  )
}
