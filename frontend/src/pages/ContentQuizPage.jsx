import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import Confetti from '../components/Confetti'
import { BackIcon, CheckIcon, ChevronIcon, CrossIcon, DashIcon } from './StudyQuizPage'
import artBlossom from '../assets/quiz/blossom.webp'
import artCloud from '../assets/quiz/cloud.webp'
import artPagoda from '../assets/quiz/pagoda.webp'
import artBooks from '../assets/quiz/books.webp'
import artBamboo from '../assets/quiz/bamboo.webp'
import artPhones from '../assets/quiz/headphones.webp'
import './StudyQuizPage.css'

const LETTERS = ['A', 'B', 'C', 'D']

/**
 * The article / podcast practice quiz, on the Study quiz's own stage.
 *
 * Same classes, art and rules as StudyQuizPage (qp-) so the two quizzes are
 * one product: one question at a time, nothing marked until Finish, then
 * every question with your answer, the right one and Gemini's one-line
 * reason, and a redo of the ones you missed.
 *
 * The quiz itself is the saved one for this piece. Opening the page only
 * asks Gemini when the piece has no quiz yet (see ContentQuizController).
 * `kind` is 'articles' or 'podcasts'.
 */
export default function ContentQuizPage({ kind }) {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const backTo = kind === 'podcasts' ? `/podcast/${id}` : `/read/${id}`
  const noun = kind === 'podcasts' ? 'episode' : 'article'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [title, setTitle] = useState('')
  const [quiz, setQuiz] = useState([])
  const [list, setList] = useState([]) // indexes into quiz for this round
  const [mode, setMode] = useState('main') // main | redo
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({}) // quiz index -> picked option (null = skipped)
  const [selected, setSelected] = useState(null)
  const [done, setDone] = useState(false)
  /* Finishing lands on the SCORE. The results replace the last question,
     which was usually scrolled down, so without this the page stayed low
     and the score sat above the fold. Instant, not smooth: a smooth scroll
     is an animation, and a tab that is not drawing would leave it midway. */
  useEffect(() => {
    if (done) window.scrollTo(0, 0)
  }, [done])
  const [bursts, setBursts] = useState(0)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const saved = await api.getContentQuiz(token, kind, id)
      const data = saved.quiz ? saved : await api.makeContentQuiz(token, kind, id)
      setTitle(data.title || saved.title || '')
      setQuiz(data.quiz)
      setList(data.quiz.map((_, i) => i))
    } catch (err) {
      setError(err.message || 'Could not load the quiz. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, token])

  const total = list.length
  const qi = list[index]
  const question = quiz[qi]
  const isLast = index === total - 1

  function record(pick) {
    const next = { ...answers, [qi]: pick }
    setAnswers(next)
    if (isLast) {
      setDone(true)
      if (list.every((i) => next[i] === quiz[i].answer)) setBursts((b) => b + 1)
    } else {
      setIndex(index + 1)
      setSelected(next[list[index + 1]] ?? null)
    }
  }

  function back() {
    const prev = index - 1
    setIndex(prev)
    setSelected(answers[list[prev]] ?? null)
  }

  function startRound(indexes, nextMode) {
    setList(indexes)
    setMode(nextMode)
    setIndex(0)
    setSelected(null)
    setAnswers((a) => {
      const copy = { ...a }
      indexes.forEach((i) => delete copy[i])
      return copy
    })
    setDone(false)
  }

  if (loading) return <p className="qp-note">Getting your quiz…</p>

  if (error) {
    return (
      <div className="qp-page">
        <p className="qp-error">
          {error}{' '}
          <button type="button" className="qp-retry" onClick={load}>
            Try again
          </button>
        </p>
        <Link to={backTo} className="qp-back">
          <BackIcon />
          Back to the {noun}
        </Link>
      </div>
    )
  }

  const rightCount = list.filter((i) => answers[i] === quiz[i].answer).length
  const missed = list.filter((i) => answers[i] !== quiz[i].answer)

  function renderResult(i, n) {
    const q = quiz[i]
    const pick = answers[i]
    const skipped = pick == null
    const correct = pick === q.answer
    const status = skipped ? 'skipped' : correct ? 'right' : 'wrong'
    return (
      <li key={i} className={`qp-res qp-res-${status}`}>
        <div className="qp-res-head">
          <span className="qp-res-num">{n + 1}</span>
          <p className="qp-res-q">{q.question}</p>
          <span className="qp-res-tag">
            {skipped ? <DashIcon /> : correct ? <CheckIcon /> : <CrossIcon />}
            {skipped ? 'Skipped' : correct ? 'Right' : 'Wrong'}
          </span>
        </div>
        <div className="qp-res-lines">
          {!skipped && (
            <p className="qp-res-line">
              <span className="qp-res-key">Your answer</span>
              <span className={correct ? 'qp-res-ans' : 'qp-res-yours'}>{q.options[pick]}</span>
            </p>
          )}
          {!correct && (
            <p className="qp-res-line">
              <span className="qp-res-key">Answer</span>
              <span className="qp-res-ans">{q.options[q.answer]}</span>
            </p>
          )}
          {q.explanation && (
            <p className="qp-res-line qp-res-muted">
              <span className="qp-res-key">Why</span>
              <span>{q.explanation}</span>
            </p>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="qp-page">
      {done && bursts > 0 && <Confetti key={bursts} />}
      <button type="button" className="qp-back" onClick={() => navigate(backTo)}>
        <BackIcon />
        Back to {title || `the ${noun}`}
      </button>

      <div className="qp-card">
        <div className="qp-art" aria-hidden="true">
          <img className="qp-art-pagoda" src={artPagoda} alt="" />
          <img className="qp-art-bamboo" src={artBamboo} alt="" />
          <img className="qp-art-cloud" src={artCloud} alt="" />
          <img className="qp-art-blossom" src={artBlossom} alt="" />
          <img className="qp-art-books" src={artBooks} alt="" />
          <img className="qp-art-phones" src={artPhones} alt="" />
        </div>

        {done ? (
          <div className="qp-state">
            {mode === 'redo' ? (
              <p className="qp-review-pill">Redo round</p>
            ) : (
              <p className="qp-score">
                {rightCount}
                <span>/ {total}</span>
              </p>
            )}
            <p className="qp-state-title">
              {missed.length === 0
                ? mode === 'main'
                  ? 'Every one right. Great work!'
                  : 'All fixed. Nice going!'
                : `${Math.round((rightCount / total) * 100)}% right`}
            </p>
            <div className="qp-state-actions">
              {missed.length > 0 && (
                <button type="button" className="qp-next" onClick={() => startRound(missed, 'redo')}>
                  {missed.length === 1 ? 'Redo the one you missed' : `Redo the ${missed.length} you missed`}
                </button>
              )}
              <button
                type="button"
                className={missed.length > 0 ? 'qp-ghost' : 'qp-next'}
                onClick={() => startRound(quiz.map((_, i) => i), 'main')}
              >
                Play again
              </button>
              <Link to={backTo} className="qp-skip">
                Back
              </Link>
            </div>
            <ol className="qp-results">{list.map(renderResult)}</ol>
          </div>
        ) : (
          <>
            <p className="qp-count">
              {mode === 'redo' ? 'Redo · ' : ''}Question {index + 1} of {total}
            </p>
            <div
              className="qp-progress"
              role="progressbar"
              aria-label="Quiz progress"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={index}
            >
              {list.map((_, i) => (
                <span key={i} className={`qp-seg${i < index ? ' on' : i === index ? ' current' : ''}`} />
              ))}
            </div>

            <div className="qp-question">
              <div className="qp-tags">
                {mode === 'redo' && <span className="qp-points">Redo</span>}
                <span className="qp-kind">{question.type === 'vocabulary' ? 'Word' : 'Reading'}</span>
              </div>
              <p className="qp-prompt">{question.question}</p>
            </div>

            <div className="qp-options" role="radiogroup" aria-label="Answers">
              {question.options.map((option, i) => (
                <button
                  key={`${qi}-${i}`}
                  type="button"
                  role="radio"
                  aria-checked={i === selected}
                  className={`qp-option${i === selected ? ' picked' : ''}`}
                  onClick={() => setSelected(i)}
                >
                  <span className="qp-letter">{LETTERS[i]}</span>
                  <span className="qp-option-text">{option}</span>
                </button>
              ))}
            </div>

            <div className="qp-foot">
              <div className="qp-foot-left">
                {index > 0 && (
                  <button type="button" className="qp-skip" onClick={back}>
                    Back
                  </button>
                )}
                <button type="button" className="qp-skip" onClick={() => record(null)}>
                  Skip
                </button>
              </div>
              <button type="button" className="qp-next" onClick={() => record(selected)} disabled={selected == null}>
                {isLast ? 'Finish' : 'Continue'}
                <ChevronIcon />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
