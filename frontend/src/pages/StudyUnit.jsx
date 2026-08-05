import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

export default function StudyUnit() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const [unit, setUnit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSaved, setLastSaved] = useState(null)
  const hoveredWordRef = useRef(null)

  const [hanzi, setHanzi] = useState('')
  const [pinyin, setPinyin] = useState('')
  const [translation, setTranslation] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editingReading, setEditingReading] = useState(false)
  const [readingText, setReadingText] = useState('')
  const [savingReading, setSavingReading] = useState(false)

  const [grammarTitle, setGrammarTitle] = useState('')
  const [grammarStructure, setGrammarStructure] = useState('')
  const [grammarExamples, setGrammarExamples] = useState('')
  const [savingGrammar, setSavingGrammar] = useState(false)

  const [editingCulture, setEditingCulture] = useState(false)
  const [cultureTitle, setCultureTitle] = useState('')
  const [cultureBody, setCultureBody] = useState('')
  const [savingCulture, setSavingCulture] = useState(false)

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
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleAddWord(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const word = await api.addStudyVocabulary(token, id, { hanzi, pinyin, translation })
      setUnit((prev) => ({ ...prev, vocabulary: [...prev.vocabulary, word] }))
      setHanzi('')
      setPinyin('')
      setTranslation('')
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

  async function handleAddGrammar(e) {
    e.preventDefault()
    setError(null)
    setSavingGrammar(true)
    try {
      const point = await api.addStudyGrammarPoint(token, id, {
        title: grammarTitle,
        structure: grammarStructure,
        examples: grammarExamples,
      })
      setUnit((prev) => ({ ...prev, grammar_points: [...prev.grammar_points, point] }))
      setGrammarTitle('')
      setGrammarStructure('')
      setGrammarExamples('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingGrammar(false)
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

  if (loading) return <p>Loading...</p>
  if (error && !unit) return <p role="alert">{error}</p>
  if (!unit) return null

  return (
    <div>
      <p>
        <Link to="/study">Study</Link> / <Link to={`/study/${unit.level.id}`}>{unit.level.title}</Link> /{' '}
        {unit.title}
      </p>
      <h1>{unit.title}</h1>
      {unit.description && <p>{unit.description}</p>}

      {error && <p role="alert">{error}</p>}

      <h2>Reading</h2>
      {lastSaved && <p>Saved "{lastSaved}" to flashcards.</p>}

      {user?.is_admin && (
        <button type="button" onClick={() => setEditingReading((v) => !v)}>
          {editingReading ? 'Cancel' : unit.reading ? 'Edit reading' : 'Add reading'}
        </button>
      )}

      {editingReading ? (
        <form onSubmit={handleSaveReading}>
          <div>
            <textarea
              value={readingText}
              onChange={(e) => setReadingText(e.target.value)}
              rows={6}
              cols={60}
            />
          </div>
          <button type="submit" disabled={savingReading}>
            {savingReading ? 'Saving...' : 'Save reading'}
          </button>
        </form>
      ) : unit.reading_tokens && unit.reading_tokens.length > 0 ? (
        <>
          <p>Hover a word and press Alt+1 to save it to your flashcard bank.</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>
            {unit.reading_tokens.map((tok, idx) =>
              tok.type === 'word' ? (
                <span
                  key={idx}
                  title={`${tok.pinyin}${tok.translation ? ' - ' + tok.translation : ''}`}
                  onMouseEnter={() => {
                    hoveredWordRef.current = tok
                  }}
                  onMouseLeave={() => {
                    if (hoveredWordRef.current === tok) hoveredWordRef.current = null
                  }}
                  style={{ textDecoration: 'underline dotted' }}
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
        <p>No reading text yet.</p>
      )}

      <h2>New Words</h2>
      {unit.vocabulary.length === 0 ? (
        <p>No words yet.</p>
      ) : (
        <ul>
          {unit.vocabulary.map((w) => (
            <li key={w.id}>
              <strong>{w.hanzi}</strong>
              {w.pinyin && ` (${w.pinyin})`}
              {w.translation && ` - ${w.translation}`}
              {user?.is_admin && (
                <>
                  {' '}
                  <button type="button" onClick={() => handleDeleteWord(w.id)}>
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {user?.is_admin && (
        <div>
          <h3>Add new word</h3>
          <form onSubmit={handleAddWord}>
            <div>
              <label>
                Hanzi
                <input value={hanzi} onChange={(e) => setHanzi(e.target.value)} required />
              </label>
            </div>
            <div>
              <label>
                Pinyin
                <input value={pinyin} onChange={(e) => setPinyin(e.target.value)} />
              </label>
            </div>
            <div>
              <label>
                Translation
                <input value={translation} onChange={(e) => setTranslation(e.target.value)} />
              </label>
            </div>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add word'}
            </button>
          </form>
        </div>
      )}

      <h2>Grammar</h2>
      {unit.grammar_points.length === 0 ? (
        <p>No grammar points yet.</p>
      ) : (
        <ol>
          {unit.grammar_points.map((p) => (
            <li key={p.id}>
              <strong>{p.title}</strong>
              {p.structure && (
                <p>
                  <em>Structure:</em> {p.structure}
                </p>
              )}
              {p.examples && (
                <p>
                  <em>Examples:</em> {p.examples}
                </p>
              )}
              {user?.is_admin && (
                <button type="button" onClick={() => handleDeleteGrammar(p.id)}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {user?.is_admin && (
        <div>
          <h3>Add grammar point</h3>
          <form onSubmit={handleAddGrammar}>
            <div>
              <label>
                Title
                <input
                  value={grammarTitle}
                  onChange={(e) => setGrammarTitle(e.target.value)}
                  placeholder="e.g. Serial Verb Sentences (2)"
                  required
                />
              </label>
            </div>
            <div>
              <label>
                Structure
                <br />
                <textarea
                  value={grammarStructure}
                  onChange={(e) => setGrammarStructure(e.target.value)}
                  rows={2}
                  cols={60}
                />
              </label>
            </div>
            <div>
              <label>
                Examples
                <br />
                <textarea
                  value={grammarExamples}
                  onChange={(e) => setGrammarExamples(e.target.value)}
                  rows={2}
                  cols={60}
                />
              </label>
            </div>
            <button type="submit" disabled={savingGrammar}>
              {savingGrammar ? 'Adding...' : 'Add grammar point'}
            </button>
          </form>
        </div>
      )}

      <h2>Culture</h2>
      {user?.is_admin && (
        <button type="button" onClick={() => setEditingCulture((v) => !v)}>
          {editingCulture ? 'Cancel' : unit.culture_title ? 'Edit culture note' : 'Add culture note'}
        </button>
      )}

      {editingCulture ? (
        <form onSubmit={handleSaveCulture}>
          <div>
            <label>
              Title
              <input value={cultureTitle} onChange={(e) => setCultureTitle(e.target.value)} />
            </label>
          </div>
          <div>
            <label>
              Body
              <br />
              <textarea
                value={cultureBody}
                onChange={(e) => setCultureBody(e.target.value)}
                rows={5}
                cols={60}
              />
            </label>
          </div>
          <button type="submit" disabled={savingCulture}>
            {savingCulture ? 'Saving...' : 'Save culture note'}
          </button>
        </form>
      ) : unit.culture_title ? (
        <>
          <h3>{unit.culture_title}</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{unit.culture_body}</p>
        </>
      ) : (
        <p>No culture note yet.</p>
      )}

      <h2>Quiz</h2>
      {unit.quiz_questions.length === 0 ? (
        <p>No quiz questions yet.</p>
      ) : (
        <ol>
          {unit.quiz_questions.map((q) => {
            const result = quizResults[q.id]
            return (
              <li key={q.id}>
                <p>{q.question}</p>
                {['a', 'b', 'c', 'd'].map((opt) => (
                  <label key={opt} style={{ display: 'block' }}>
                    <input
                      type="radio"
                      name={`quiz-${q.id}`}
                      checked={selectedAnswers[q.id] === opt}
                      onChange={() => handleSelectAnswer(q.id, opt)}
                      disabled={!!result}
                    />
                    {q[`option_${opt}`]}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => handleCheckAnswer(q.id)}
                  disabled={!selectedAnswers[q.id] || !!result || checkingQuiz[q.id]}
                >
                  Check answer
                </button>
                {result && (
                  <p>
                    {result.correct
                      ? 'Correct!'
                      : `Incorrect. The correct answer was ${q[`option_${result.correct_option}`]}.`}
                  </p>
                )}
                {user?.is_admin && (
                  <button type="button" onClick={() => handleDeleteQuizQuestion(q.id)}>
                    Delete
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {user?.is_admin && (
        <div>
          <h3>Add quiz question</h3>
          <form onSubmit={handleAddQuizQuestion}>
            <div>
              <label>
                Question
                <input value={quizQuestion} onChange={(e) => setQuizQuestion(e.target.value)} required />
              </label>
            </div>
            <div>
              <label>
                Option A
                <input value={quizOptionA} onChange={(e) => setQuizOptionA(e.target.value)} required />
              </label>
            </div>
            <div>
              <label>
                Option B
                <input value={quizOptionB} onChange={(e) => setQuizOptionB(e.target.value)} required />
              </label>
            </div>
            <div>
              <label>
                Option C
                <input value={quizOptionC} onChange={(e) => setQuizOptionC(e.target.value)} required />
              </label>
            </div>
            <div>
              <label>
                Option D
                <input value={quizOptionD} onChange={(e) => setQuizOptionD(e.target.value)} required />
              </label>
            </div>
            <div>
              <label>
                Correct option
                <select
                  value={quizCorrectOption}
                  onChange={(e) => setQuizCorrectOption(e.target.value)}
                >
                  <option value="a">A</option>
                  <option value="b">B</option>
                  <option value="c">C</option>
                  <option value="d">D</option>
                </select>
              </label>
            </div>
            <button type="submit" disabled={savingQuiz}>
              {savingQuiz ? 'Adding...' : 'Add question'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
