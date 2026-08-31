import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { buildMatchQuestion, buildVocabQuestions } from '../studyQuiz'
import './StudyQuizPage.css'

/* Every question is worth the same, so the score is just a count times this.
   Shown on the pill the design puts top-left of the question card. */
const POINTS = 100

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

export default function StudyQuizPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [unit, setUnit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState(null)
  const [verdict, setVerdict] = useState(null) // {correct, correctIndex}
  const [checking, setChecking] = useState(false)
  const [score, setScore] = useState(0)
  const [answered, setAnswered] = useState(0)
  const [done, setDone] = useState(false)
  const [seed, setSeed] = useState(0)

  /* Matching keeps its own small state: which left tile is held, which pairs
     are solved, and which attempt just failed. */
  const [heldTile, setHeldTile] = useState(null)
  const [solved, setSolved] = useState([])
  const [missed, setMissed] = useState(null)
  const [slips, setSlips] = useState(0)

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

  /* Both kinds of question in one list, so the run is a single pass rather than
     two modes the student has to switch between. The admin's questions come
     first — they are the authored content; the vocabulary rounds back them up
     and are what makes a unit quizzable before anyone writes a question. */
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
    /* Order: what the admin wrote, then recognition rounds, then one matching
       round last — matching is the hardest of the three, so it lands after the
       words have already been seen once. seed only exists so "Play again"
       reshuffles the generated rounds. */
    const match = buildMatchQuestion(unit.vocabulary || [])
    return [
      ...authored,
      ...buildVocabQuestions(unit.vocabulary || [], seed),
      ...(match ? [match] : []),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, seed])

  const total = questions.length
  const question = questions[index]

  async function choose(optionIndex) {
    if (verdict || checking) return
    setPicked(optionIndex)
    setError(null)

    // Vocabulary rounds are marked here; the answer came with the page.
    if (question.kind === 'vocab') {
      const correct = optionIndex === question.correctIndex
      setVerdict({ correct, correctIndex: question.correctIndex })
      setAnswered((n) => n + 1)
      if (correct) setScore((s) => s + POINTS)
      return
    }

    // Authored questions are checked server-side — `correct_option` is hidden
    // from every GET, so the answer key never reaches the network tab.
    setChecking(true)
    try {
      const r = await api.checkStudyQuizAnswer(
        token,
        question.id,
        LETTERS[optionIndex].toLowerCase(),
      )
      const correctIndex = LETTERS.indexOf(String(r.correct_option).toUpperCase())
      setVerdict({ correct: r.correct, correctIndex })
      setAnswered((n) => n + 1)
      if (r.correct) setScore((s) => s + POINTS)
    } catch (err) {
      setError(err.message)
      setPicked(null)
    } finally {
      setChecking(false)
    }
  }

  /**
   * Tap a hanzi, then a meaning.
   *
   * Marked in the browser because the answer came with the page — same rule as
   * the vocabulary rounds. A slip is counted rather than punished immediately:
   * the round scores only if it is completed cleanly, which is what makes
   * matching harder than picking one of four.
   */
  function tapTile(side, id) {
    if (verdict || solved.includes(id)) return

    if (side === 'left') {
      setHeldTile(id)
      setMissed(null)
      return
    }

    if (heldTile == null) return

    if (heldTile === id) {
      const next = [...solved, id]
      setSolved(next)
      setHeldTile(null)
      setMissed(null)

      // Last pair: the round is over, so score it now.
      if (next.length === question.pairs.length) {
        const clean = slips === 0
        setVerdict({ correct: clean, correctIndex: -1 })
        setAnswered((n) => n + 1)
        if (clean) setScore((sc) => sc + POINTS)
      }
      return
    }

    setMissed(id)
    setSlips((n) => n + 1)
    // Release the held tile so the next tap starts a fresh attempt.
    setHeldTile(null)
  }

  function advance() {
    if (index + 1 >= total) {
      setDone(true)
      return
    }
    setIndex((i) => i + 1)
    setPicked(null)
    setVerdict(null)
    resetMatch()
  }

  function resetMatch() {
    setHeldTile(null)
    setSolved([])
    setMissed(null)
    setSlips(0)
  }

  function restart() {
    setSeed((s) => s + 1)
    setIndex(0)
    setPicked(null)
    setVerdict(null)
    setScore(0)
    setAnswered(0)
    setDone(false)
    resetMatch()
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
            <p className="qp-score">
              {score}
              <span>/ {total * POINTS}</span>
            </p>
            <p className="qp-state-title">
              {answered === 0
                ? 'You skipped every question'
                : `${score / POINTS} of ${total} correct`}
            </p>
            <p className="qp-state-note">
              {total - answered > 0 && `${total - answered} skipped · `}
              {answered > 0 &&
                `${Math.round((score / POINTS / answered) * 100)}% of what you answered`}
            </p>
            <div className="qp-state-actions">
              <button type="button" className="qp-next" onClick={restart}>
                Play again
              </button>
              <Link to={backTo} className="qp-skip">
                Back to unit
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="qp-count">
              Question {index + 1} of {total}
            </p>
            <div className="qp-progress">
              <span style={{ width: `${((index + 1) / total) * 100}%` }} />
            </div>

            <div className="qp-question">
              <div className="qp-tags">
                <span className="qp-points">{POINTS} points</span>
                {/* The design's second pill is a difficulty rating, which has no
                    backing column. It carries the question's kind instead —
                    real information, and it is what tells a student why the
                    style of question just changed mid-run. */}
                <span className="qp-kind">{question.label}</span>
              </div>
              <p className="qp-prompt">{question.prompt}</p>
            </div>

            {question.kind === 'match' ? (
              <>
                {/* Two independently shuffled columns, so the rows never line
                    up and the pairing is a real recall test. */}
                <div className="qp-match">
                  <div className="qp-match-col">
                    {question.left.map((id) => {
                      const pair = question.pairs.find((p) => p.id === id)
                      const done = solved.includes(id)
                      return (
                        <button
                          key={`l-${id}`}
                          type="button"
                          className={`qp-tile qp-tile-hanzi${done ? ' done' : ''}${
                            heldTile === id ? ' held' : ''
                          }`}
                          onClick={() => tapTile('left', id)}
                          disabled={done || Boolean(verdict)}
                        >
                          {pair.hanzi}
                        </button>
                      )
                    })}
                  </div>

                  <div className="qp-match-col">
                    {question.right.map((id) => {
                      const pair = question.pairs.find((p) => p.id === id)
                      const done = solved.includes(id)
                      return (
                        <button
                          key={`r-${id}`}
                          type="button"
                          className={`qp-tile${done ? ' done' : ''}${
                            missed === id ? ' missed' : ''
                          }`}
                          onClick={() => tapTile('right', id)}
                          disabled={done || Boolean(verdict)}
                        >
                          {pair.answer}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <p className="qp-match-note">
                  {verdict
                    ? verdict.correct
                      ? 'All matched, first time.'
                      : `All matched — ${slips} wrong ${slips === 1 ? 'try' : 'tries'} along the way.`
                    : `${solved.length} of ${question.pairs.length} matched${
                        slips > 0 ? ` · ${slips} wrong so far` : ''
                      }`}
                </p>
              </>
            ) : (
              <div className="qp-options">
                {question.options.map((option, i) => {
                  /* Verdict colour is a plain static class, never a transition:
                   React reuses the same node for option B across questions, so
                   an animated background would ease out of the previous
                   question's result — and strand there if frames stop. */
                  let state = ''
                  if (verdict) {
                    if (i === verdict.correctIndex) state = ' correct'
                    else if (i === picked) state = ' wrong'
                  } else if (i === picked) state = ' picked'

                  return (
                    <button
                      key={`${question.key}-${i}`}
                      type="button"
                      className={`qp-option${state}`}
                      onClick={() => choose(i)}
                      disabled={Boolean(verdict) || checking}
                    >
                      <span className="qp-letter">{LETTERS[i]}</span>
                      <span className="qp-option-text">{option}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {error && <p className="qp-error">{error}</p>}

            <div className="qp-foot">
              <button type="button" className="qp-skip" onClick={advance} disabled={checking}>
                <FlagIcon />
                Skip
              </button>

              <button
                type="button"
                className="qp-next"
                onClick={advance}
                disabled={!verdict || checking}
              >
                {index + 1 >= total ? 'Finish' : 'Next Question'}
                <ChevronIcon />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
