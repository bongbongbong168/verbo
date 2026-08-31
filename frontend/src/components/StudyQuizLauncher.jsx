import { Link } from 'react-router-dom'
import { buildVocabQuestions } from '../studyQuiz'
import illustration from '../assets/study/quiz-illustration.png'
import './StudyQuizLauncher.css'

/**
 * The Quiz tab's contents, built to `design/Group 39644.png`: a centred card
 * with the graduation illustration, a heading, one line of description and a
 * single Start Quiz button.
 *
 * The quiz itself is a page, not a panel — authored questions and vocabulary
 * rounds play as one sequence and want the full width.
 *
 * The design's static copy is kept for the heading, but the description says
 * what the run ACTUALLY contains: "Reinforce what you've learned…" is the same
 * sentence on every unit, whereas the count differs per unit and is the one
 * thing worth knowing before you press the button.
 */
export default function StudyQuizLauncher({ unitId, questionCount = 0, vocabulary = [] }) {
  /* Counted by running the real generator, not by estimating from the word
     count: a word whose partners share nothing in the same field produces no
     question, so the two numbers genuinely differ on real data. */
  const vocabRounds = buildVocabQuestions(vocabulary).length
  const total = questionCount + vocabRounds

  if (total === 0) {
    return (
      <p className="ql-empty">
        No quiz yet. Add quiz questions from <strong>Edit unit</strong>, or add a couple of
        vocabulary words that share a meaning or pinyin field and a round will be built from them
        automatically.
      </p>
    )
  }

  const madeOf =
    questionCount > 0 && vocabRounds > 0
      ? `${questionCount} written for this unit and ${vocabRounds} built from its vocabulary`
      : questionCount > 0
        ? 'written for this unit'
        : 'built from this unit’s vocabulary'

  return (
    <div className="ql">
      <img className="ql-art" src={illustration} alt="" />

      <h3 className="ql-heading">Practice Exercises</h3>

      <p className="ql-lede">
        Reinforce what you’ve learned through practical exercises designed to improve your
        understanding, vocabulary and grammar.
      </p>

      <p className="ql-count">
        {total} question{total === 1 ? '' : 's'} in one run — {madeOf}.
      </p>

      <Link to={`/study/units/${unitId}/quiz`} className="ql-start">
        Start Quiz
      </Link>
    </div>
  )
}
