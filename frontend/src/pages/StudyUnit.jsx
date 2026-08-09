import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import sectionIcon from '../assets/study/section-icon.png'
import './StudyUnit.css'

const TABS = [
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'reading', label: 'Reading' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'culture', label: 'Culture' },
  { key: 'quiz', label: 'Quiz' },
]

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

  const [hanzi, setHanzi] = useState('')
  const [pinyin, setPinyin] = useState('')
  const [translation, setTranslation] = useState('')
  const [explanation, setExplanation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showWordForm, setShowWordForm] = useState(false)

  const [editingReading, setEditingReading] = useState(false)
  const [readingText, setReadingText] = useState('')
  const [savingReading, setSavingReading] = useState(false)

  const [activeTextId, setActiveTextId] = useState(null)
  const [showTextForm, setShowTextForm] = useState(false)
  const [textTitle, setTextTitle] = useState('')
  const [savingText, setSavingText] = useState(false)
  const [lineSpeaker, setLineSpeaker] = useState('')
  const [lineChinese, setLineChinese] = useState('')
  const [linePinyin, setLinePinyin] = useState('')
  const [savingLine, setSavingLine] = useState(false)

  const [grammarTitle, setGrammarTitle] = useState('')
  const [grammarDescription, setGrammarDescription] = useState('')
  const [grammarStructure, setGrammarStructure] = useState('')
  const [savingGrammar, setSavingGrammar] = useState(false)
  // Which point is open for editing, and the draft example rows keyed by point
  const [editingPointId, setEditingPointId] = useState(null)
  const [pointDraft, setPointDraft] = useState({ title: '', description: '', structure: '' })
  const [exampleDrafts, setExampleDrafts] = useState({})

  const [editingCulture, setEditingCulture] = useState(false)
  const [cultureTitle, setCultureTitle] = useState('')
  const [cultureBody, setCultureBody] = useState('')
  const [cultureTerm, setCultureTerm] = useState('')
  const [savingCulture, setSavingCulture] = useState(false)
  const [slide, setSlide] = useState(0)
  const [uploadingImage, setUploadingImage] = useState(false)

  const [quizQuestion, setQuizQuestion] = useState('')
  const [quizOptionA, setQuizOptionA] = useState('')
  const [quizOptionB, setQuizOptionB] = useState('')
  const [quizOptionC, setQuizOptionC] = useState('')
  const [quizOptionD, setQuizOptionD] = useState('')
  const [quizCorrectOption, setQuizCorrectOption] = useState('a')
  const [savingQuiz, setSavingQuiz] = useState(false)
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
        setReadingText(data.reading || '')
        setCultureTitle(data.culture_title || '')
        setCultureBody(data.culture_body || '')
        setCultureTerm(data.culture_term || '')
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

  async function handleAddWord(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const word = await api.addStudyVocabulary(token, id, {
        hanzi,
        pinyin,
        translation,
        explanation,
      })
      setUnit((prev) => ({ ...prev, vocabulary: [...prev.vocabulary, word] }))
      setHanzi('')
      setPinyin('')
      setTranslation('')
      setExplanation('')
      setShowWordForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteWord(wordId) {
    setError(null)
    try {
      await api.deleteStudyVocabulary(token, wordId)
      setUnit((prev) => ({ ...prev, vocabulary: prev.vocabulary.filter((w) => w.id !== wordId) }))
    } catch (err) {
      setError(err.message)
    }
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

  async function handleSaveReading(e) {
    e.preventDefault()
    setError(null)
    setSavingReading(true)
    try {
      await api.updateStudyUnit(token, id, {
        title: unit.title,
        description: unit.description,
        reading: readingText,
      })
      setEditingReading(false)
      loadUnit()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingReading(false)
    }
  }

  async function handleAddText(e) {
    e.preventDefault()
    setError(null)
    setSavingText(true)
    try {
      const text = await api.addStudyText(token, id, { title: textTitle })
      setUnit((prev) => ({ ...prev, texts: [...(prev.texts || []), text] }))
      setActiveTextId(text.id)
      setTextTitle('')
      setShowTextForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingText(false)
    }
  }

  async function handleDeleteText(textId) {
    setError(null)
    try {
      await api.deleteStudyText(token, textId)
      setUnit((prev) => ({ ...prev, texts: (prev.texts || []).filter((t) => t.id !== textId) }))
      // Fall back to the first remaining text so the panel is never blank.
      setActiveTextId((current) => (current === textId ? null : current))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddLine(e) {
    e.preventDefault()
    setError(null)
    setSavingLine(true)
    try {
      const line = await api.addStudyTextLine(token, currentTextId, {
        speaker: lineSpeaker,
        chinese: lineChinese,
        pinyin: linePinyin,
      })
      setUnit((prev) => ({
        ...prev,
        texts: prev.texts.map((t) =>
          t.id === currentTextId ? { ...t, lines: [...t.lines, line] } : t
        ),
      }))
      setLineSpeaker('')
      setLineChinese('')
      setLinePinyin('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingLine(false)
    }
  }

  async function handleDeleteLine(lineId) {
    setError(null)
    try {
      await api.deleteStudyTextLine(token, lineId)
      setUnit((prev) => ({
        ...prev,
        texts: prev.texts.map((t) => ({ ...t, lines: t.lines.filter((l) => l.id !== lineId) })),
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddGrammar(e) {
    e.preventDefault()
    setError(null)
    setSavingGrammar(true)
    try {
      const point = await api.addStudyGrammarPoint(token, id, {
        title: grammarTitle,
        description: grammarDescription,
        structure: grammarStructure,
      })
      setUnit((prev) => ({ ...prev, grammar_points: [...prev.grammar_points, point] }))
      setGrammarTitle('')
      setGrammarDescription('')
      setGrammarStructure('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingGrammar(false)
    }
  }

  function startEditingPoint(point) {
    setEditingPointId(point.id)
    setPointDraft({
      title: point.title || '',
      description: point.description || '',
      structure: point.structure || '',
    })
  }

  async function handleUpdateGrammar(e, pointId) {
    e.preventDefault()
    setError(null)
    setSavingGrammar(true)
    try {
      const updated = await api.updateStudyGrammarPoint(token, pointId, pointDraft)
      setUnit((prev) => ({
        ...prev,
        grammar_points: prev.grammar_points.map((p) => (p.id === pointId ? updated : p)),
      }))
      setEditingPointId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingGrammar(false)
    }
  }

  function setExampleDraft(pointId, patch) {
    setExampleDrafts((prev) => ({
      ...prev,
      [pointId]: { chinese: '', pinyin: '', english: '', ...prev[pointId], ...patch },
    }))
  }

  async function handleAddExample(e, pointId) {
    e.preventDefault()
    setError(null)
    const draft = exampleDrafts[pointId] || {}
    try {
      const example = await api.addStudyGrammarExample(token, pointId, {
        chinese: draft.chinese,
        pinyin: draft.pinyin,
        english: draft.english,
      })
      setUnit((prev) => ({
        ...prev,
        grammar_points: prev.grammar_points.map((p) =>
          p.id === pointId ? { ...p, examples: [...p.examples, example] } : p
        ),
      }))
      setExampleDrafts((prev) => ({ ...prev, [pointId]: { chinese: '', pinyin: '', english: '' } }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteExample(pointId, exampleId) {
    setError(null)
    try {
      await api.deleteStudyGrammarExample(token, exampleId)
      setUnit((prev) => ({
        ...prev,
        grammar_points: prev.grammar_points.map((p) =>
          p.id === pointId ? { ...p, examples: p.examples.filter((ex) => ex.id !== exampleId) } : p
        ),
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteGrammar(pointId) {
    setError(null)
    try {
      await api.deleteStudyGrammarPoint(token, pointId)
      setUnit((prev) => ({
        ...prev,
        grammar_points: prev.grammar_points.filter((p) => p.id !== pointId),
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddCultureImage(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploadingImage(true)
    try {
      const image = await api.addCultureImage(token, id, file)
      setUnit((prev) => ({ ...prev, culture_images: [...(prev.culture_images || []), image] }))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  async function handleDeleteCultureImage(imageId) {
    setError(null)
    try {
      await api.deleteCultureImage(token, imageId)
      setUnit((prev) => ({
        ...prev,
        culture_images: (prev.culture_images || []).filter((img) => img.id !== imageId),
      }))
      // Keep the carousel in range when the visible slide is the one removed.
      setSlide(0)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveCulture(e) {
    e.preventDefault()
    setError(null)
    setSavingCulture(true)
    try {
      await api.updateStudyUnit(token, id, {
        title: unit.title,
        description: unit.description,
        culture_title: cultureTitle,
        culture_body: cultureBody,
        culture_term: cultureTerm,
      })
      setEditingCulture(false)
      loadUnit()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingCulture(false)
    }
  }

  async function handleAddQuizQuestion(e) {
    e.preventDefault()
    setError(null)
    setSavingQuiz(true)
    try {
      const question = await api.addStudyQuizQuestion(token, id, {
        question: quizQuestion,
        option_a: quizOptionA,
        option_b: quizOptionB,
        option_c: quizOptionC,
        option_d: quizOptionD,
        correct_option: quizCorrectOption,
      })
      setUnit((prev) => ({ ...prev, quiz_questions: [...prev.quiz_questions, question] }))
      setQuizQuestion('')
      setQuizOptionA('')
      setQuizOptionB('')
      setQuizOptionC('')
      setQuizOptionD('')
      setQuizCorrectOption('a')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingQuiz(false)
    }
  }

  async function handleDeleteQuizQuestion(questionId) {
    setError(null)
    try {
      await api.deleteStudyQuizQuestion(token, questionId)
      setUnit((prev) => ({
        ...prev,
        quiz_questions: prev.quiz_questions.filter((q) => q.id !== questionId),
      }))
    } catch (err) {
      setError(err.message)
    }
  }

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
      </div>

      {lastSaved && <p className="un-saved-note">Saved &ldquo;{lastSaved}&rdquo; to flashcards.</p>}

      {/* ---------- Vocabulary ---------- */}
      {activeTab === 'vocabulary' && (
        <>
          {user?.is_admin && (
            <div className="un-admin">
              <button type="button" className="un-btn-primary" onClick={() => setShowWordForm((v) => !v)}>
                {showWordForm ? 'Cancel' : 'Add word'}
              </button>
            </div>
          )}

          {showWordForm && user?.is_admin && (
            <form className="un-form" onSubmit={handleAddWord}>
              <div>
                <label>Hanzi</label>
                <input value={hanzi} onChange={(e) => setHanzi(e.target.value)} placeholder="以为" required />
              </div>
              <div>
                <label>Pinyin (leave blank to generate)</label>
                <input value={pinyin} onChange={(e) => setPinyin(e.target.value)} placeholder="yǐwéi" />
              </div>
              <div>
                <label>Translation</label>
                <input value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder="Because" />
              </div>
              <div>
                <label>Explanation (leave blank to use the dictionary)</label>
                <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} />
              </div>
              <button type="submit" className="un-btn-primary" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add word'}
              </button>
            </form>
          )}

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

                      {user?.is_admin && (
                        <button
                          type="button"
                          className="un-delete-btn"
                          onClick={() => handleDeleteWord(w.id)}
                          aria-label={`Delete ${w.hanzi}`}
                        >
                          &times;
                        </button>
                      )}
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
                {user?.is_admin && (
                  <button
                    type="button"
                    className="un-text-remove"
                    onClick={() => handleDeleteText(t.id)}
                    aria-label={`Delete ${t.title}`}
                  >
                    &times;
                  </button>
                )}
              </span>
            ))}

            {user?.is_admin && (
              <button
                type="button"
                className="un-text-add"
                onClick={() => setShowTextForm((v) => !v)}
              >
                {showTextForm ? 'Cancel' : '+ Text'}
              </button>
            )}
          </div>

          {showTextForm && user?.is_admin && (
            <form className="un-form un-form-inline" onSubmit={handleAddText}>
              <div>
                <label>Text title</label>
                <input
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="e.g. Text 1"
                  required
                />
              </div>
              <button type="submit" className="un-btn-primary" disabled={savingText}>
                {savingText ? 'Adding...' : 'Add text'}
              </button>
            </form>
          )}

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
                    {user?.is_admin && (
                      <button
                        type="button"
                        className="un-line-remove"
                        onClick={() => handleDeleteLine(line.id)}
                        aria-label="Delete line"
                      >
                        &times;
                      </button>
                    )}
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

              {currentText && user?.is_admin && (
                <form className="un-form" onSubmit={handleAddLine}>
                  <div>
                    <label>Speaker</label>
                    <input
                      value={lineSpeaker}
                      onChange={(e) => setLineSpeaker(e.target.value)}
                      placeholder="e.g. 安妮"
                    />
                  </div>
                  <div>
                    <label>Chinese line</label>
                    <input
                      value={lineChinese}
                      onChange={(e) => setLineChinese(e.target.value)}
                      placeholder="桌子上摆着的那张照片是你吗？"
                      required
                    />
                  </div>
                  <div>
                    <label>Pinyin (leave blank to generate)</label>
                    <input
                      value={linePinyin}
                      onChange={(e) => setLinePinyin(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="un-btn-primary" disabled={savingLine}>
                    {savingLine ? 'Adding...' : 'Add line'}
                  </button>
                </form>
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
                      {user?.is_admin && (
                        <>
                          <button
                            type="button"
                            className="un-btn-primary"
                            onClick={() =>
                              editingPointId === p.id ? setEditingPointId(null) : startEditingPoint(p)
                            }
                          >
                            {editingPointId === p.id ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="un-delete-btn"
                            onClick={() => handleDeleteGrammar(p.id)}
                            aria-label={`Delete ${p.title}`}
                          >
                            &times;
                          </button>
                        </>
                      )}
                    </div>

                    {editingPointId === p.id && user?.is_admin && (
                      <form className="un-form" onSubmit={(e) => handleUpdateGrammar(e, p.id)}>
                        <div>
                          <label>Title</label>
                          <input
                            value={pointDraft.title}
                            onChange={(e) => setPointDraft({ ...pointDraft, title: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label>Description</label>
                          <textarea
                            value={pointDraft.description}
                            onChange={(e) =>
                              setPointDraft({ ...pointDraft, description: e.target.value })
                            }
                            rows={4}
                          />
                        </div>
                        <div>
                          <label>Structure</label>
                          <input
                            value={pointDraft.structure}
                            onChange={(e) =>
                              setPointDraft({ ...pointDraft, structure: e.target.value })
                            }
                          />
                        </div>
                        <button type="submit" className="un-btn-primary" disabled={savingGrammar}>
                          {savingGrammar ? 'Saving...' : 'Save'}
                        </button>
                      </form>
                    )}

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

                    {(p.examples.length > 0 || user?.is_admin) && (
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
                              {user?.is_admin && (
                                <button
                                  type="button"
                                  className="un-grammar-ex-remove"
                                  onClick={() => handleDeleteExample(p.id, ex.id)}
                                  aria-label="Delete example"
                                >
                                  &times;
                                </button>
                              )}
                            </div>
                          ))
                        )}

                        {user?.is_admin && (
                          <form className="un-form" onSubmit={(e) => handleAddExample(e, p.id)}>
                            <div>
                              <label>Chinese</label>
                              <input
                                value={exampleDrafts[p.id]?.chinese || ''}
                                onChange={(e) => setExampleDraft(p.id, { chinese: e.target.value })}
                                placeholder="我们可以走着去。"
                                required
                              />
                            </div>
                            <div>
                              <label>Pinyin (leave blank to generate)</label>
                              <input
                                value={exampleDrafts[p.id]?.pinyin || ''}
                                onChange={(e) => setExampleDraft(p.id, { pinyin: e.target.value })}
                              />
                            </div>
                            <div>
                              <label>English</label>
                              <input
                                value={exampleDrafts[p.id]?.english || ''}
                                onChange={(e) => setExampleDraft(p.id, { english: e.target.value })}
                                placeholder="We can go there."
                              />
                            </div>
                            <button type="submit" className="un-btn-primary">
                              Add example
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {user?.is_admin && (
            <form className="un-form" onSubmit={handleAddGrammar}>
              <div>
                <label>Title</label>
                <input value={grammarTitle} onChange={(e) => setGrammarTitle(e.target.value)} required />
              </div>
              <div>
                <label>Description</label>
                <textarea
                  value={grammarDescription}
                  onChange={(e) => setGrammarDescription(e.target.value)}
                  rows={4}
                />
              </div>
              <div>
                <label>Structure</label>
                <input value={grammarStructure} onChange={(e) => setGrammarStructure(e.target.value)} />
              </div>
              <p className="un-form-note">Examples are added per point, below its card.</p>
              <button type="submit" className="un-btn-primary" disabled={savingGrammar}>
                {savingGrammar ? 'Adding...' : 'Add grammar point'}
              </button>
            </form>
          )}
        </>
      )}

      {/* ---------- Culture ---------- */}
      {activeTab === 'culture' && (
        <>
          {user?.is_admin && (
            <div className="un-admin">
              <button type="button" className="un-btn-primary" onClick={() => setEditingCulture((v) => !v)}>
                {editingCulture ? 'Cancel' : unit.culture_body ? 'Edit culture note' : 'Add culture note'}
              </button>
            </div>
          )}

          {editingCulture ? (
            <form className="un-form" onSubmit={handleSaveCulture}>
              <div>
                <label>Title</label>
                <input value={cultureTitle} onChange={(e) => setCultureTitle(e.target.value)} />
              </div>
              <div>
                <label>Key term (leave pinyin to generate)</label>
                <input
                  value={cultureTerm}
                  onChange={(e) => setCultureTerm(e.target.value)}
                  placeholder="农家乐"
                />
              </div>
              <div>
                <label>Body</label>
                <textarea value={cultureBody} onChange={(e) => setCultureBody(e.target.value)} rows={6} />
              </div>

              <div>
                <label>Photos</label>
                <div className="un-cu-manage">
                  <label className="un-btn-primary un-cu-upload">
                    {uploadingImage ? 'Uploading...' : '+ Add photo'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={uploadingImage}
                      onChange={handleAddCultureImage}
                    />
                  </label>

                  {images.map((img, i) => (
                    <span key={img.id} className="un-cu-thumb">
                      <img src={img.url} alt="" />
                      <button
                        type="button"
                        onClick={() => handleDeleteCultureImage(img.id)}
                        aria-label={`Delete photo ${i + 1}`}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                {/* Photos go straight to the server on pick — they are their own
                    endpoint, not part of this form's payload. Say so, or Save
                    looks like it is what commits them. */}
                <p className="un-form-note">
                  Photos are saved as soon as you pick them, and deleted right away too.
                </p>
              </div>

              <button type="submit" className="un-btn-primary" disabled={savingCulture}>
                {savingCulture ? 'Saving...' : 'Save culture note'}
              </button>
            </form>
          ) : unit.culture_body ? (
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
                        {user?.is_admin && (
                          <button
                            type="button"
                            className="un-delete-btn"
                            onClick={() => handleDeleteQuizQuestion(q.id)}
                            aria-label="Delete question"
                          >
                            &times;
                          </button>
                        )}
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

          {user?.is_admin && (
            <form className="un-form" onSubmit={handleAddQuizQuestion}>
              <div>
                <label>Question</label>
                <input value={quizQuestion} onChange={(e) => setQuizQuestion(e.target.value)} required />
              </div>
              <div>
                <label>Option A</label>
                <input value={quizOptionA} onChange={(e) => setQuizOptionA(e.target.value)} required />
              </div>
              <div>
                <label>Option B</label>
                <input value={quizOptionB} onChange={(e) => setQuizOptionB(e.target.value)} required />
              </div>
              <div>
                <label>Option C</label>
                <input value={quizOptionC} onChange={(e) => setQuizOptionC(e.target.value)} />
              </div>
              <div>
                <label>Option D</label>
                <input value={quizOptionD} onChange={(e) => setQuizOptionD(e.target.value)} />
              </div>
              <div>
                <label>Correct option</label>
                <select value={quizCorrectOption} onChange={(e) => setQuizCorrectOption(e.target.value)}>
                  {['a', 'b', 'c', 'd'].map((o) => (
                    <option key={o} value={o}>
                      {o.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="un-btn-primary" disabled={savingQuiz}>
                {savingQuiz ? 'Adding...' : 'Add question'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
