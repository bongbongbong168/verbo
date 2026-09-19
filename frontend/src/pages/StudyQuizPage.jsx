import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { buildMatchQuestion, buildVocabQuestions, shuffle } from '../studyQuiz'
import { setLessonDone } from '../studyProgress'
import MatchWires from '../components/MatchWires'
import './StudyQuizPage.css'

/* Every question is worth the same, so the score is just a count times this.
   Shown on the pill the design puts top-left of the question card. */
const POINTS = 100

const LETTERS = ['A', 'B', 'C', 'D']

/* Said when an answer is right. Rotated by position so a run does not repeat
   one phrase ten times. */
const PRAISE = ['Nice work!', "That's right.", 'Exactly.', 'Spot on.', 'Well done.']

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

function FlagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 21V4M6 4h11l-2 3.5L17 11H6" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9.5 5 7 7-7 7" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  )
}

function BulbIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
    </svg>
  )
}

/* A missed question comes back in the review round looking fresh: generated
   rounds reshuffle their options and a matching round its columns. Authored
   questions keep their order, because the server marks them by letter. */
function freshCopy(q) {
  if (q.kind === 'vocab') {
    const answer = q.options[q.correctIndex]
    const options = shuffle(q.options)
    return { ...q, options, correctIndex: options.indexOf(answer) }
  }
  if (q.kind === 'match') {
    return { ...q, left: shuffle(q.left), right: shuffle(q.right) }
  }
  return q
}

/**
 * The practice run.
 *
 * PICK FIRST, FIND OUT AFTER. Tapping an answer only selects it - it can be
 * changed freely - and nothing is judged until Check. The old page marked the
 * first tap on the spot, in red, with a shake: one slip of the finger was a
 * wrong answer, and guessing by tapping around was rewarded.
 *
 * A MISS IS NOT A VERDICT. The feedback says what the answer is, in the
 * app's lavender rather than red, and the question goes on a review list.
 * The end of the run shows that list with the right answers and offers a
 * review round of just those questions, which can repeat until none are left
 * or the learner stops. Skipping also puts a question on the list: skipped
 * is "not yet", not "wrong".
 */
export default function StudyQuizPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [unit, setUnit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [seed, setSeed] = useState(0)

  /* The run in progress. `round` is the list being played in a review round
     (only the missed questions); null means the full main round. */
  const [mode, setMode] = useState('main') // 'main' | 'review'
  const [round, setRound] = useState(null)
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)

  // The current question.
  const [selected, setSelected] = useState(null) // option index
  const [links, setLinks] = useState({}) // matching: left id -> right id
  const [feedback, setFeedback] = useState(null)
  const [checking, setChecking] = useState(false)

  /* How the round went, keyed by question: {correct, skipped, question,
     picked, answer}. An authored question's answer is only known once the
     server has marked it. */
  const [results, setResults] = useState({})
  const [score, setScore] = useState(0)

  useEffect(() => {
    let live = true
    api
      .getStudyUnit(token, id)
      .then((data) => live && setUnit(data))
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [token, id])

  /* Authored questions first (the written content), then recognition rounds,
     then one matching round last - it is the hardest, so it lands after the
     words have been seen once. `seed` reshuffles on "Play again". */
  const questions = useMemo(() => {
    if (!unit) return []
    const authored = (unit.quiz_questions || []).map((q) => ({
      key: `q-${q.id}`,
      kind: 'authored',
      label: 'Multiple choice',
      id: q.id,
      prompt: q.question,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
    }))
    const match = buildMatchQuestion(unit.vocabulary || [])
    return [
      ...authored,
      ...buildVocabQuestions(unit.vocabulary || [], seed),
      ...(match ? [match] : []),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, seed])

  const list = round ?? questions
  const total = list.length
  const question = list[index]
  const isMatch = question?.kind === 'match'
  const ready = isMatch
    ? Boolean(question) && Object.keys(links).length === question.pairs.length
    : selected != null

  function resetQuestion() {
    setSelected(null)
    setLinks({})
    setFeedback(null)
    setError(null)
  }

  function record(key, entry) {
    setResults((r) => ({ ...r, [key]: entry }))
  }

  async function check() {
    if (!ready || feedback || checking) return
    setError(null)

    if (isMatch) {
      const perLeft = {}
      question.pairs.forEach((p) => {
        perLeft[p.id] = links[p.id] === p.id
      })
      const right = Object.values(perLeft).filter(Boolean).length
      const correct = right === question.pairs.length
      setFeedback({ correct, perLeft, right })
      record(question.key, { correct, skipped: false, question })
      if (correct && mode === 'main') setScore((s) => s + POINTS)
      return
    }

    let correctIndex
    if (question.kind === 'vocab') {
      correctIndex = question.correctIndex
    } else {
      // Authored answers are marked server-side: `correct_option` is hidden
      // from every GET, so the key never reaches the network tab.
      setChecking(true)
      try {
        const r = await api.checkStudyQuizAnswer(token, question.id, LETTERS[selected].toLowerCase())
        correctIndex = LETTERS.indexOf(String(r.correct_option).toUpperCase())
      } catch (err) {
        setError(err.message)
        return
      } finally {
        setChecking(false)
      }
    }

    const correct = selected === correctIndex
    setFeedback({ correct, correctIndex })
    record(question.key, {
      correct,
      skipped: false,
      question,
      picked: question.options[selected],
      answer: question.options[correctIndex],
    })
    if (correct && mode === 'main') setScore((s) => s + POINTS)
  }

  const advance = useCallback(() => {
    if (index + 1 >= total) {
      setDone(true)
      // The main run finishes the lesson; fire and forget, the results
      // screen must not wait on it or fail with it.
      if (mode === 'main') setLessonDone(token, id, true).catch(() => {})
      return
    }
    setIndex((i) => i + 1)
    resetQuestion()
  }, [index, total, mode, token, id])

  function skip() {
    if (feedback || checking) return
    record(question.key, { correct: false, skipped: true, question })
    advance()
  }

  /* 1-4 or A-D to pick, Enter to check and again to continue. Re-subscribed
     each render on purpose: it reads the current question and handlers. */
  useEffect(() => {
    if (!question || done) return undefined
    function onKey(e) {
      if (e.target.closest?.('input, textarea')) return
      if (e.key === 'Enter') {
        if (e.target.closest?.('button')) return // the focused button handles it
        e.preventDefault()
        if (feedback) advance()
        else check()
        return
      }
      if (isMatch || feedback || e.ctrlKey || e.metaKey || e.altKey) return
      let n = '1234'.indexOf(e.key)
      if (n < 0) n = 'abcd'.indexOf(e.key.toLowerCase())
      if (n >= 0 && n < question.options.length) setSelected(n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const missed = Object.values(results).filter((r) => !r.correct)
  const rightCount = Object.values(results).filter((r) => r.correct).length

  function startReview() {
    setRound(missed.map((r) => freshCopy(r.question)))
    setMode('review')
    setResults({})
    setIndex(0)
    setDone(false)
    resetQuestion()
  }

  function restart() {
    setSeed((s) => s + 1)
    setRound(null)
    setMode('main')
    setResults({})
    setScore(0)
    setIndex(0)
    setDone(false)
    resetQuestion()
  }

  const backTo = `/study/units/${id}`

  if (loading) return <p className="qp-note">Loading quiz…</p>

  if (error && !unit) {
    return (
      <div className="qp-page">
        <p className="qp-error">{error}</p>
        <Link to={backTo} className="qp-back">
          <BackIcon /> Back to unit
        </Link>
      </div>
    )
  }

  function feedbackTitle() {
    if (feedback.correct) return PRAISE[index % PRAISE.length]
    if (isMatch) return `${feedback.right} of ${question.pairs.length} linked right`
    return 'Not quite - here is the answer.'
  }

  function feedbackSub() {
    if (feedback.correct) return mode === 'main' ? `+${POINTS} points` : 'Got it this time.'
    if (isMatch) return 'The dashed lines show the right links. Saved for review at the end.'
    return `It's "${question.options[feedback.correctIndex]}". Saved for review at the end.`
  }

  return (
    <div className="qp-page">
      <button type="button" className="qp-back" onClick={() => navigate(backTo)}>
        <BackIcon />
        Back to {unit?.title || 'unit'}
      </button>

      <div className="qp-card">
        {total === 0 ? (
          <div className="qp-state">
            <p className="qp-state-title">Nothing to quiz yet</p>
            <p className="qp-state-note">
              This unit has no quiz questions and not enough vocabulary to build a round. Add either
              from <Link to={backTo}>the unit</Link>.
            </p>
          </div>
        ) : done ? (
          <div className="qp-state">
            {mode === 'main' ? (
              <>
                <p className="qp-score">
                  {score}
                  <span>/ {total * POINTS}</span>
                </p>
                <p className="qp-state-title">
                  {rightCount === total ? 'Every one right. Great work!' : `${rightCount} of ${total} right`}
                </p>
              </>
            ) : (
              <>
                <p className="qp-review-pill">Review round</p>
                <p className="qp-state-title">
                  {missed.length === 0
                    ? 'All caught up. Nice going!'
                    : `${rightCount} of ${total} right this time`}
                </p>
              </>
            )}

            <div className="qp-state-actions">
              {missed.length > 0 && (
                <button type="button" className="qp-next" onClick={startReview}>
                  {missed.length === 1 ? 'Practice the one you missed' : `Practice the ${missed.length} you missed`}
                </button>
              )}
              <button
                type="button"
                className={missed.length > 0 ? 'qp-ghost' : 'qp-next'}
                onClick={restart}
              >
                Play again
              </button>
              <Link to={backTo} className="qp-skip">
                Back to unit
              </Link>
            </div>
            {missed.length > 0 && (
              <>
                <p className="qp-state-note">
                  {missed.length === 1 ? 'One to look at again' : `${missed.length} to look at again`}. Here
                  are the answers.
                </p>
                <ul className="qp-review">
                  {missed.map((r) => (
                    <li key={r.question.key} className="qp-review-item">
                      <p className="qp-review-q">{r.question.prompt}</p>
                      {r.question.kind === 'match' ? (
                        <p className="qp-review-a">
                          {r.question.pairs.map((p) => `${p.hanzi} = ${p.answer}`).join('  ·  ')}
                        </p>
                      ) : r.skipped ? (
                        <p className="qp-review-a qp-review-muted">Skipped. Try it in the review round.</p>
                      ) : (
                        <p className="qp-review-a">
                          <span className="qp-review-ans">
                            <CheckIcon /> {r.answer}
                          </span>
                          <span className="qp-review-you">You picked: {r.picked}</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

          </div>
        ) : (
          <>
            <p className="qp-count">
              {mode === 'review' ? 'Review · ' : ''}Question {index + 1} of {total}
            </p>
            {/* Fills as questions are finished, not as they are shown, so the
                bar is empty on question 1 and full on the results. */}
            <div className="qp-progress">
              <span style={{ width: `${((index + (feedback ? 1 : 0)) / total) * 100}%` }} />
            </div>

            <div className="qp-question">
              <div className="qp-tags">
                <span className="qp-points">{mode === 'review' ? 'Review' : `${POINTS} points`}</span>
                <span className="qp-kind">{question.label}</span>
              </div>
              <p className="qp-prompt">{question.prompt}</p>
              {isMatch && !feedback && (
                <p className="qp-hint">
                  Drag a line from each word to its meaning, or tap one and then the other.
                </p>
              )}
            </div>

            {isMatch ? (
              <MatchWires
                key={`${question.key}-${mode}-${seed}`}
                question={question}
                links={links}
                onChange={setLinks}
                result={feedback ? feedback.perLeft : null}
              />
            ) : (
              <div className="qp-options" role="radiogroup" aria-label="Answers">
                {question.options.map((option, i) => {
                  /* Static classes, never transitions: the state has to read
                     correctly in a tab that is not drawing frames. */
                  let state = ''
                  if (feedback) {
                    if (i === feedback.correctIndex) state = ' correct'
                    else if (i === selected) state = ' yours'
                    else state = ' faded'
                  } else if (i === selected) state = ' picked'
                  const showTick = feedback && i === feedback.correctIndex
                  return (
                    <button
                      key={`${question.key}-${i}`}
                      type="button"
                      role="radio"
                      aria-checked={i === selected}
                      className={`qp-option${state}`}
                      onClick={() => !feedback && setSelected(i)}
                      disabled={Boolean(feedback) || checking}
                    >
                      <span className="qp-letter">{showTick ? <CheckIcon /> : LETTERS[i]}</span>
                      <span className="qp-option-text">{option}</span>
                      {feedback && i === selected && i !== feedback.correctIndex && (
                        <span className="qp-option-tag">Your answer</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {feedback && (
              <div className={`qp-feedback${feedback.correct ? ' good' : ' learn'}`} role="status">
                <span className="qp-feedback-mark">{feedback.correct ? <CheckIcon /> : <BulbIcon />}</span>
                <div className="qp-feedback-text">
                  <p className="qp-feedback-title">{feedbackTitle()}</p>
                  <p className="qp-feedback-sub">{feedbackSub()}</p>
                </div>
              </div>
            )}

            {error && <p className="qp-error">{error}</p>}

            <div className="qp-foot">
              {feedback ? (
                <span />
              ) : (
                <button type="button" className="qp-skip" onClick={skip} disabled={checking}>
                  <FlagIcon />
                  Skip for now
                </button>
              )}

              {feedback ? (
                <button type="button" className="qp-next" onClick={advance}>
                  {index + 1 >= total ? 'See results' : 'Continue'}
                  <ChevronIcon />
                </button>
              ) : (
                <button type="button" className="qp-next" onClick={check} disabled={!ready || checking}>
                  {checking ? 'Checking…' : 'Check'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
