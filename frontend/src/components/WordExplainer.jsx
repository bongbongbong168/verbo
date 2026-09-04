import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import './WordExplainer.css'

/**
 * What a word means, what it is built from, and where it is actually used.
 *
 * A dialog rather than a row that expands: the panel carries a paragraph, a
 * character table and three example sentences, and pushing all that into a
 * list row shoves every word below it down the page.
 *
 * EVERYTHING HERE IS REAL. The meaning and the character breakdown come from
 * the offline CC-CEDICT index the hover translations already use; the examples
 * are sentences from the learner's own library, each linking back to the
 * lesson or article it came from. Nothing is generated, so nothing can be
 * confidently wrong — the cost is that "how to use it" only appears where an
 * admin has written one, and the panel simply omits that section otherwise
 * rather than inventing guidance.
 */
export default function WordExplainer({ token, word, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!word) return
    let live = true
    setData(null)
    setError(null)
    api
      .explainVocabulary(token, word.id)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [token, word])

  // Esc closes, matching every other dismissible overlay in the app.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!word) return null

  /* Shown from the row's own data until the request lands, so the dialog opens
     with the word already in it rather than on an empty box. */
  const hanzi = data?.hanzi ?? word.hanzi
  const pinyin = data?.pinyin ?? word.pinyin
  const meaning = data?.translation ?? word.translation
  const dictionary = data?.dictionary
  const note = data?.explanation
  /* The vocabulary row's own gloss is often the same sentence as the
     dictionary's; showing both would just repeat it. */
  const showDictionary =
    dictionary && dictionary.trim().toLowerCase() !== (meaning || '').trim().toLowerCase()
  const showNote =
    note && note.trim().toLowerCase() !== (dictionary || '').trim().toLowerCase()

  return (
    <div
      className="wx-scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div className="wx" role="dialog" aria-modal="true" aria-label={`About ${hanzi}`}>
        <header className="wx-head">
          <div>
            <p className="wx-kicker">Word explanation</p>
            <p className="wx-hanzi">{hanzi}</p>
            {pinyin && <p className="wx-pinyin">{pinyin}</p>}
          </div>
          <button type="button" className="wx-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="wx-body">
          {error && <p className="wx-error">{error}</p>}

          <section className="wx-section">
            <h3 className="wx-label">What it means</h3>
            <p className="wx-meaning">{meaning || dictionary || '—'}</p>
            {showDictionary && <p className="wx-dict">{dictionary}</p>}
          </section>

          {/* Only where somebody wrote one. This is the "how to use it" slot,
              and an empty section header over nothing would be worse than its
              absence. */}
          {showNote && (
            <section className="wx-section">
              <h3 className="wx-label">How to use it</h3>
              <p className="wx-note">{note}</p>
            </section>
          )}

          {data?.characters?.length > 0 && (
            <section className="wx-section">
              <h3 className="wx-label">What it is built from</h3>
              <ul className="wx-chars">
                {data.characters.map((c) => (
                  <li key={c.char}>
                    <span className="wx-char">{c.char}</span>
                    <span className="wx-char-pinyin">{c.pinyin}</span>
                    <span className="wx-char-meaning">{c.meaning}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="wx-section">
            <h3 className="wx-label">Seen in your lessons</h3>
            {data === null && !error ? (
              <p className="wx-quiet">Looking…</p>
            ) : data?.examples?.length > 0 ? (
              <ul className="wx-examples">
                {data.examples.map((ex, i) => (
                  <li key={i} className="wx-example">
                    <p className="wx-ex-text">{ex.text}</p>
                    {ex.pinyin && <p className="wx-ex-pinyin">{ex.pinyin}</p>}
                    {ex.english && <p className="wx-ex-en">{ex.english}</p>}
                    {ex.source?.link && (
                      /* Closes on the way out — the dialog is over the page it
                         is navigating to, and leaving it open would cover the
                         thing the learner just asked to see. */
                      <Link className="wx-ex-src" to={ex.source.link} onClick={onClose}>
                        {ex.source.label}: {ex.source.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="wx-quiet">
                This word has not turned up in anything you have read yet. It will appear
                here once it does.
              </p>
            )}
          </section>
        </div>

        <footer className="wx-foot">
          <button type="button" className="wx-got" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  )
}
