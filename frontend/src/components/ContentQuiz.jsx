import { Link } from 'react-router-dom'
import './ContentQuiz.css'
import questionBlock from '../assets/quiz/question-block.webp'

/**
 * The way in to the optional practice quiz, under an article or an episode.
 *
 * Only a card and a link: the quiz itself plays on its own page in the Study
 * quiz's design (ContentQuizPage). Nothing is fetched here, so the reading
 * page costs no request for a quiz nobody opened.
 */
export default function ContentQuiz({ kind, id, label = 'this article' }) {
  const to = kind === 'podcasts' ? `/podcast/${id}/quiz` : `/read/${id}/quiz`

  return (
    <section className="cq" aria-labelledby={`cq-title-${kind}-${id}`}>
      <div className="cq-intro">
        <span className="cq-mark" aria-hidden="true">
          <img src={questionBlock} alt="" />
        </span>
        <div className="cq-intro-text">
          <h3 id={`cq-title-${kind}-${id}`} className="cq-title">Practice quiz</h3>
          <p className="cq-sub">5 quick questions on {label}: what it says and the words it uses.</p>
        </div>
        <Link to={to} className="cq-go">
          Start quiz
        </Link>
      </div>
    </section>
  )
}
