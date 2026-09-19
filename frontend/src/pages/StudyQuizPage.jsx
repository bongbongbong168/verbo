import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { buildMatchQuestion, buildVocabQuestions, shuffle } from '../studyQuiz'
import { setLessonDone } from '../studyProgress'
import MatchWires from '../components/MatchWires'
import './StudyQuizPage.css'

const LETTERS = ['A', 'B', 'C', 'D']

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

function CrossIcon() {
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
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  )
}

function DashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M7 12h10" />
    </svg>
  )
}

/* A question coming back in the redo round looks fresh: generated rounds
   reshuffle their options and a matching round its columns. Authored
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
 * NOTHING IS MARKED UNTIL THE END. Picking an answer only selects it, and
 * Continue moves on without saying whether it was right - Back returns to an
 * earlier question to change it. Only after the last question is the whole
 * run marked, and the results screen lists every question: what you picked,
 * whether it was right, and the answer where it was not. Asked for exactly
 * that way: an instant verdict on each tap discouraged the learner.
 *
 * The results offer a redo round of just the questions that were wrong or
 * skipped, which can repeat until none are left.
 */
export default function StudyQuizPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [unit, setUnit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [seed, setSeed] = useState(0)

  /* `round` is the list being played in a redo round (only the missed
     questions); null means the full main run. */
  const [mode, setMode] = useState('main') // 'main' | 'redo'
  const [round, setRound] = useState(null)
  const [index, setIndex] = useState(0)

  /* What the learner answered, keyed by question: {picked} for a choice,
     {links} for matching, {skipped: true} for a skip. Held until the end. */
  const [answers, setAnswers] = useState({})
  const [selected, setSelected] = useState(null)
  const [links, setLinks] = useState({})

  const [marking, setMarking] = useState(false)
  const [results, setResults] = useState(null) // marked list, set at the end

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
  const isLast = index + 1 >= total
  const ready = isMatch
    ? Boolean(question) && Object.keys(links).length === question.pairs.length
    : selected != null

  /* Load what was already answered for question `i`, so Back shows the
     earlier pick instead of a blank question. */
  function show(i, from = answers) {
    const a = from[list[i]?.key] || {}
    setSelected(a.picked ?? null)
    setLinks(a.links ?? {})
    setIndex(i)
    setError(null)
  }

  function save(entry) {
    const next = { ...answers, [question.key]: entry }
    setAnswers(next)
    return next
  }

  function go(entry) {
    const next = save(entry)
    if (isLast) finish(next)
    else show(index + 1, next)
  }

  function next() {
    if (!ready || marking) return
    go(isMatch ? { links } : { picked: selected })
  }

  function skip() {
    if (marking) return
    go({ skipped: true })
  }

  function back() {
    if (index === 0 || marking) return
    // Keep whatever is on screen, so going back and forth never loses a pick.
    const current = isMatch
      ? Object.keys(links).length
        ? { links }
        : null
      : selected != null
        ? { picked: selected }
        : null
    const kept = current ? save(current) : answers
    show(index - 1, kept)
  }

  /* Mark the whole run at once. Generated rounds are marked here; authored
     ones go to the server, which alone knows `correct_option` - it is hidden
     from every GET so the key never reaches the network tab. */
  async function finish(all) {
    setMarking(true)
    setError(null)
    try {
      const marked = []
      for (const q of list) {
        const a = all[q.key] || { skipped: true }
        if (a.skipped) {
          marked.push({ question: q, skipped: true, correct: false })
        } else if (q.kind === 'match') {
          const perLeft = {}
          q.pairs.forEach((p) => {
            perLeft[p.id] = a.links[p.id] === p.id
          })
          const right = Object.values(perLeft).filter(Boolean).length
          marked.push({
            question: q,
            correct: right === q.pairs.length,
            links: a.links,
            perLeft,
            right,
          })
        } else {
          let correctIndex = q.correctIndex
          if (q.kind === 'authored') {
            // Sequential, not Promise.all: this shares the 300/min bucket.
            const r = await api.checkStudyQuizAnswer(token, q.id, LETTERS[a.picked].toLowerCase())
            correctIndex = LETTERS.indexOf(String(r.correct_option).toUpperCase())
          }
          marked.push({
            question: q,
            correct: a.picked === correctIndex,
            picked: a.picked,
            correctIndex,
          })
        }
      }
      setResults(marked)
      // The main run finishes the lesson; fire and forget, the results
      // screen must not wait on it or fail with it.
      if (mode === 'main') setLessonDone(token, id, true).catch(() => {})
    } catch (err) {
      setError(err.message)
    } finally {
      setMarking(false)
    }
  }

  /* 1-4 or A-D to pick, Enter to continue. Re-subscribed each render on
     purpose: it reads the current question and handlers. */
  useEffect(() => {
    if (!question || results || marking) return undefined
    function onKey(e) {
      if (e.target.closest?.('input, textarea')) return
      if (e.key === 'Enter') {
        if (e.target.closest?.('button')) return // the focused button handles it
        e.preventDefault()
        next()
        return
      }
      if (isMatch || e.ctrlKey || e.metaKey || e.altKey) return
      let n = '1234'.indexOf(e.key)
      if (n < 0) n = 'abcd'.indexOf(e.key.toLowerCase())
      if (n >= 0 && n < question.options.length) setSelected(n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const missed = results ? results.filter((r) => !r.correct) : []
  const rightCount = results ? results.length - missed.length : 0

  function begin(nextRound, nextMode) {
    setRound(nextRound)
    setMode(nextMode)
    setAnswers({})
    setResults(null)
    setSelected(null)
    setLinks({})
    setIndex(0)
    setError(null)
  }

  function redo() {
    begin(
      missed.map((r) => freshCopy(r.question)),
      'redo',
    )
  }

  function restart() {
    setSeed((s) => s + 1)
    begin(null, 'main')
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

  function renderResult(r, i) {
    const q = r.question
    const status = r.skipped ? 'skipped' : r.correct ? 'right' : 'wrong'
    const label = r.skipped ? 'Skipped' : r.correct ? 'Right' : 'Wrong'
    return (
      <li key={q.key} className={`qp-res qp-res-${status}`}>
        <div className="qp-res-head">
          <span className="qp-res-num">{i + 1}</span>
          <p className="qp-res-q">{q.prompt}</p>
          <span className="qp-res-tag">
            {r.skipped ? <DashIcon /> : r.correct ? <CheckIcon /> : <CrossIcon />}
            {label}
          </span>
        </div>

        {q.kind === 'match' ? (
          <ul className="qp-res-pairs">
            {q.pairs.map((p) => {
              const linked = r.links?.[p.id]
              const ok = r.perLeft?.[p.id]
              const yours = q.pairs.find((x) => x.id === linked)
              return (
                <li key={p.id} className={`qp-res-pair${r.skipped ? '' : ok ? ' ok' : ' no'}`}>
                  <span className="qp-res-hanzi">{p.hanzi}</span>
                  <span className="qp-res-arrow" aria-hidden="true">
                    →
                  </span>
                  {r.skipped || ok ? (
                    <span className="qp-res-ans">{p.answer}</span>
                  ) : (
                    <>
                      <span className="qp-res-yours">{yours?.answer ?? 'no link'}</span>
                      <span className="qp-res-ans">{p.answer}</span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="qp-res-lines">
            {!r.skipped && (
              <p className="qp-res-line">
                <span className="qp-res-key">Your answer</span>
                <span className={r.correct ? 'qp-res-ans' : 'qp-res-yours'}>{q.options[r.picked]}</span>
              </p>
            )}
            {!r.correct && r.correctIndex != null && (
              <p className="qp-res-line">
                <span className="qp-res-key">Answer</span>
                <span className="qp-res-ans">{q.options[r.correctIndex]}</span>
              </p>
            )}
            {r.skipped && q.kind !== 'authored' && (
              <p className="qp-res-line">
                <span className="qp-res-key">Answer</span>
                <span className="qp-res-ans">{q.options[q.correctIndex]}</span>
              </p>
            )}
            {r.skipped && q.kind === 'authored' && (
              <p className="qp-res-line qp-res-muted">Answer it in the redo round to see it.</p>
            )}
          </div>
        )}
      </li>
    )
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
        ) : results ? (
          <div className="qp-state">
            {mode === 'redo' && <p className="qp-review-pill">Redo round</p>}
            {mode === 'main' && (
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
                <button type="button" className="qp-next" onClick={redo}>
                  {missed.length === 1 ? 'Redo the one you missed' : `Redo the ${missed.length} you missed`}
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

            <ol className="qp-results">{results.map(renderResult)}</ol>
          </div>
        ) : marking ? (
          <div className="qp-state">
            <p className="qp-state-title">Checking your answers…</p>
          </div>
        ) : (
          <>
            <p className="qp-count">
              {mode === 'redo' ? 'Redo · ' : ''}Question {index + 1} of {total}
            </p>
            {/* Fills as questions are answered, so the bar is empty on
                question 1 and full on the results. */}
            <div className="qp-progress">
              <span style={{ width: `${(index / total) * 100}%` }} />
            </div>

            <div className="qp-question">
              <div className="qp-tags">
                {mode === 'redo' && <span className="qp-points">Redo</span>}
                <span className="qp-kind">{question.label}</span>
              </div>
              <p className="qp-prompt">{question.prompt}</p>
              {isMatch && (
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
              />
            ) : (
              <div className="qp-options" role="radiogroup" aria-label="Answers">
                {question.options.map((option, i) => (
                  <button
                    key={`${question.key}-${i}`}
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
            )}

            {error && (
              <p className="qp-error">
                {error}{' '}
                <button type="button" className="qp-retry" onClick={() => finish(answers)}>
                  Try again
                </button>
              </p>
            )}

            <div className="qp-foot">
              <div className="qp-foot-left">
                {index > 0 && (
                  <button type="button" className="qp-skip" onClick={back}>
                    Back
                  </button>
                )}
                <button type="button" className="qp-skip" onClick={skip}>
                  Skip
                </button>
              </div>

              <button type="button" className="qp-next" onClick={next} disabled={!ready}>
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
