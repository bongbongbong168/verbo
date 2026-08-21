import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import StudyUnitEditDrawer from '../components/StudyUnitEditDrawer'
import sectionIcon from '../assets/study/section-icon.png'
import './StudyUnit.css'

const TABS = [
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'reading', label: 'Reading' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'culture', label: 'Culture' },
  { key: 'quiz', label: 'Quiz' },
]

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="m14.5 6.5 3 3" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  )
}

export default function StudyUnit() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const [unit, setUnit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSaved, setLastSaved] = useState(null)
  const hoveredWordRef = useRef(null)

  const [activeTab, setActiveTab] = useState('vocabulary')
  const [openExplanations, setOpenExplanations] = useState({})
  const [speakingId, setSpeakingId] = useState(null)

  const [showEdit, setShowEdit] = useState(false)

  // Which reading text is on screen. Selection is a reader concern, so it stays
  // on the page even though adding and deleting texts moved into the drawer.
  const [activeTextId, setActiveTextId] = useState(null)
  const [slide, setSlide] = useState(0)

  // Answering is student functionality, not editing — it stays here.
  const [selectedAnswers, setSelectedAnswers] = useState({})
  const [quizResults, setQuizResults] = useState({})
  const [checkingQuiz, setCheckingQuiz] = useState({})

  useEffect(() => {
    loadUnit()
  }, [token, id])

  function loadUnit() {
    setLoading(true)
    api
      .getStudyUnit(token, id)
      .then((data) => {
        setUnit(data)
        // Record the visit so the Dashboard's "Pick up where you left off"
        // tile can point back here. Fire-and-forget: a failure must not stop
        // the page rendering, and there is nothing useful to tell the user.
        api.recordStudyUnitView(token, id).catch(() => {})
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /**
   * Pronunciation uses the browser's built-in speech synthesis, so there is
   * no audio to record or store. Falls back silently where unsupported.
   */
  function speak(word) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(word.hanzi)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.85
    utterance.onend = () => setSpeakingId(null)
    utterance.onerror = () => setSpeakingId(null)
    setSpeakingId(word.id)
    window.speechSynthesis.speak(utterance)
  }

  function toggleExplanation(wordId) {
    setOpenExplanations((prev) => ({ ...prev, [wordId]: !prev[wordId] }))
  }

  async function handleSaveWord(word) {
    try {
      await api.addFlashcard(token, {
        word: word.text,
        pinyin: word.pinyin,
        translation: word.translation,
        source_module: 'study',
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

  function handleSelectAnswer(questionId, option) {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: option }))
  }

  async function handleCheckAnswer(questionId) {
    const selected = selectedAnswers[questionId]
    if (!selected) return
    setCheckingQuiz((prev) => ({ ...prev, [questionId]: true }))
    setError(null)
    try {
      const result = await api.checkStudyQuizAnswer(token, questionId, selected)
      setQuizResults((prev) => ({ ...prev, [questionId]: result }))
    } catch (err) {
      setError(err.message)
    } finally {
      setCheckingQuiz((prev) => ({ ...prev, [questionId]: false }))
    }
  }

  if (loading) return <p className="un-empty">Loading...</p>
  if (error && !unit) return <p className="un-error">{error}</p>
  if (!unit) return null

  const level = unit.level || {}
  const accent = level.accent_color || '#ee6d08'
  const activeLabel = TABS.find((t) => t.key === activeTab)?.label
  const images = unit.culture_images || []

  // Default to the first text so the Reading tab always opens with content.
  const texts = unit.texts || []
  const currentTextId = activeTextId ?? texts[0]?.id ?? null
  const currentText = texts.find((t) => t.id === currentTextId) || null

  return (
    <div className="un">
      <nav className="un-breadcrumb">
        <Link to="/study">Study</Link>
        <span className="un-breadcrumb-sep">/</span>
        <Link to={`/study/${level.id}`}>{level.title}</Link>
        <span className="un-breadcrumb-sep">/</span>
        <span className="un-breadcrumb-current">{unit.title}</span>
      </nav>

      {error && <p className="un-error">{error}</p>}

      <section className="un-hero" style={{ '--hero-accent': accent }}>
        {level.level_label && <span className="un-hero-pill">{level.level_label}</span>}
        <h1 className="un-hero-title">{level.title}</h1>
        {level.description && <p className="un-hero-subtitle">{level.description}</p>}
        <span className="un-hero-ring" aria-hidden="true" />
      </section>

      <div className="un-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={'un-tab' + (activeTab === tab.key ? ' active' : '')}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="un-section-label">
        <img src={sectionIcon} alt="" />
        <span>{activeLabel}</span>
        {user?.is_admin && (
          <button type="button" className="un-edit" onClick={() => setShowEdit(true)}>
            <PencilIcon /> Edit unit
          </button>
        )}
      </div>

      {lastSaved && <p className="un-saved-note">Saved &ldquo;{lastSaved}&rdquo; to flashcards.</p>}

      {/* ---------- Vocabulary ---------- */}
      {activeTab === 'vocabulary' && (
        <>
          <div className="un-panel">
            {unit.vocabulary.length === 0 ? (
              <p className="un-empty">No words yet.</p>
            ) : (
              <ul className="un-vocab">
                {unit.vocabulary.map((w, index) => (
                  <li key={w.id} className="un-vocab-item">
                    <div className="un-vocab-row">
                      <span className="un-vocab-index">{String(index + 1).padStart(2, '0')}.</span>
                      <span className="un-vocab-hanzi">{w.hanzi}</span>
                      <span className="un-vocab-pinyin">{w.pinyin}</span>
                      <span className="un-vocab-translation">{w.translation}</span>

                      <button
                        type="button"
                        className="un-explain-btn"
                        onClick={() => toggleExplanation(w.id)}
                        disabled={!w.explanation}
                        aria-expanded={!!openExplanations[w.id]}
                        title={w.explanation ? 'Show explanation' : 'No explanation for this word yet'}
                      >
                        Explain
                      </button>

                      <button
                        type="button"
                        className={'un-speak-btn' + (speakingId === w.id ? ' speaking' : '')}
                        onClick={() => speak(w)}
                        aria-label={`Pronounce ${w.hanzi}`}
                      >
                        <SpeakerIcon />
                      </button>

                    </div>

                    {openExplanations[w.id] && w.explanation && (
                      <p className="un-vocab-explanation">{w.explanation}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ---------- Reading ---------- */}
      {activeTab === 'reading' && (
        <div className="un-reading-panel">
          <div className="un-text-tabs">
            {texts.map((t) => (
              <span key={t.id} className="un-text-pill-wrap">
                <button
                  type="button"
                  className={'un-text-pill' + (t.id === currentTextId ? ' active' : '')}
                  onClick={() => setActiveTextId(t.id)}
                >
                  {t.title}
                </button>
              </span>
            ))}
          </div>

          <div className="un-reading-body">
            <div className="un-dialogue">
              {!currentText ? (
                <p className="un-empty">No texts yet.</p>
              ) : currentText.lines.length === 0 ? (
                <p className="un-empty">No lines in this text yet.</p>
              ) : (
                currentText.lines.map((line, idx) => (
                  <div key={line.id} className={'un-line' + (idx % 2 === 1 ? ' alt' : '')}>
                    {line.speaker && <span className="un-line-speaker">{line.speaker}</span>}
                    <p className="un-line-chinese">
                      {/* Hover + Alt+1 still saves any word to the flashcard bank */}
                      {[...line.chinese].map((ch, i) => (
                        <span key={i}>{ch}</span>
                      ))}
                    </p>
                    {line.pinyin && <p className="un-line-pinyin">{line.pinyin}</p>}
                  </div>
                ))
              )}

            </div>

            <aside className="un-newwords">
              <div className="un-newwords-head">
                <span className="un-newwords-title">New Words</span>
                <span className="un-newwords-chip">New Words</span>
              </div>
              <div className="un-newwords-body">
                {unit.vocabulary.length === 0 ? (
                  <p className="un-newwords-empty">Add words in the Vocabulary tab.</p>
                ) : (
                  unit.vocabulary.map((w, i) => (
                    <div key={w.id} className="un-newword">
                      <span className="un-newword-badge">{i + 1}</span>
                      <span className="un-newword-hanzi">{w.hanzi}</span>
                      <span className="un-newword-meaning">
                        <span className="un-newword-pinyin">{w.pinyin}</span>
                        {w.translation && <span className="un-newword-translation">{w.translation}</span>}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* ---------- Grammar ---------- */}
      {activeTab === 'grammar' && (
        <>
          <div className="un-panel">
            {unit.grammar_points.length === 0 ? (
              <p className="un-empty">No grammar points yet.</p>
            ) : (
              <ul className="un-grammar">
                {unit.grammar_points.map((p, index) => (
                  <li key={p.id} className="un-grammar-item">
                    <div className="un-grammar-head">
                      <span className="un-grammar-num">{index + 1}</span>
                      <h3 className="un-grammar-title">{p.title}</h3>
                    </div>

                    {p.description && (
                      <div className="un-grammar-card">
                        <p className="un-grammar-desc">{p.description}</p>
                      </div>
                    )}

                    {p.structure && (
                      <div className="un-grammar-card raised">
                        <span className="un-grammar-tag">Structure</span>
                        <p className="un-grammar-structure">{p.structure}</p>
                      </div>
                    )}

                    {p.examples.length > 0 && (
                      <div className="un-grammar-card">
                        <span className="un-grammar-tag">Examples</span>

                        {p.examples.length === 0 ? (
                          <p className="un-grammar-empty">No examples yet.</p>
                        ) : (
                          p.examples.map((ex) => (
                            <div key={ex.id} className="un-grammar-example">
                              <div className="un-grammar-ex-cn">
                                <p className="un-grammar-ex-hanzi">{ex.chinese}</p>
                                {ex.pinyin && <p className="un-grammar-ex-pinyin">{ex.pinyin}</p>}
                              </div>
                              {ex.english && <p className="un-grammar-ex-en">{ex.english}</p>}
                            </div>
                          ))
                        )}

                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </>
      )}

      {/* ---------- Culture ---------- */}
      {activeTab === 'culture' && (
        <>
          {unit.culture_body ? (
            <div className="un-panel un-cu-panel">
              <article className="un-cu-card">
              <div className="un-cu-top">
                <div className="un-cu-media">
                  <div className="un-cu-frame">
                    {images.length > 0 ? (
                      <img src={images[Math.min(slide, images.length - 1)].url} alt="" />
                    ) : (
                      <span className="un-cu-frame-empty">No photos yet</span>
                    )}
                  </div>

                  {images.length > 1 && (
                    <div className="un-cu-dots" role="tablist" aria-label="Photos">
                      {images.map((img, i) => (
                        <button
                          key={img.id}
                          type="button"
                          role="tab"
                          aria-selected={i === slide}
                          aria-label={`Photo ${i + 1}`}
                          className={'un-cu-dot' + (i === slide ? ' active' : '')}
                          onClick={() => setSlide(i)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="un-cu-heads">
                  {unit.culture_title && <h3 className="un-cu-title">{unit.culture_title}</h3>}
                  {unit.culture_term && (
                    <p className="un-cu-term">
                      {unit.culture_term}
                      {unit.culture_term_pinyin && <span> - {unit.culture_term_pinyin}</span>}
                    </p>
                  )}
                </div>
              </div>

              <div className="un-cu-body">
                {unit.culture_body
                  .split(/\n\s*\n/)
                  .filter((p) => p.trim())
                  .map((para, i) => (
                    <p key={i}>{para.trim()}</p>
                  ))}
              </div>
              </article>
            </div>
          ) : (
            <div className="un-panel">
              <p className="un-empty">No culture note for this unit yet.</p>
            </div>
          )}
        </>
      )}

      {/* ---------- Quiz ---------- */}
      {activeTab === 'quiz' && (
        <>
          <div className="un-panel">
            {unit.quiz_questions.length === 0 ? (
              <p className="un-empty">No quiz questions yet.</p>
            ) : (
              <ol className="un-quiz">
                {unit.quiz_questions.map((q) => {
                  const result = quizResults[q.id]
                  const selected = selectedAnswers[q.id]
                  return (
                    <li key={q.id} className="un-quiz-item">
                      <div className="un-quiz-head">
                        <p className="un-quiz-question">{q.question}</p>
                      </div>

                      <div className="un-quiz-options">
                        {['a', 'b', 'c', 'd'].map((opt) => {
                          const text = q[`option_${opt}`]
                          if (!text) return null
                          const isChosen = selected === opt
                          const isAnswer = result && result.correct_option === opt
                          return (
                            <button
                              key={opt}
                              type="button"
                              className={
                                'un-quiz-option' +
                                (isChosen ? ' chosen' : '') +
                                (isAnswer ? ' correct' : '') +
                                (result && isChosen && !result.correct ? ' wrong' : '')
                              }
                              onClick={() => handleSelectAnswer(q.id, opt)}
                              disabled={!!result}
                            >
                              <span className="un-quiz-option-key">{opt.toUpperCase()}</span>
                              {text}
                            </button>
                          )
                        })}
                      </div>

                      {!result ? (
                        <button
                          type="button"
                          className="un-btn-primary"
                          onClick={() => handleCheckAnswer(q.id)}
                          disabled={!selected || checkingQuiz[q.id]}
                        >
                          {checkingQuiz[q.id] ? 'Checking...' : 'Check answer'}
                        </button>
                      ) : (
                        <p className={'un-quiz-result' + (result.correct ? ' correct' : ' wrong')}>
                          {result.correct ? 'Correct' : `Not quite — the answer is ${result.correct_option.toUpperCase()}`}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

        </>
      )}

      {showEdit && user?.is_admin && (
        <StudyUnitEditDrawer
          token={token}
          unit={unit}
          initialTab={activeLabel}
          onChange={(updated) => setUnit((prev) => ({ ...prev, ...updated }))}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  )
}
