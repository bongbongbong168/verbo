import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ArticleCover from './ArticleCover'
/* The app's own 3D illustrations, already used on Profile and Login. Reused
   rather than newly sourced so the banner carries the same cast as the rest of
   Verbo — the reference banners all lean on one illustration each, and a
   character the learner has already met on sign-up does that job here. */
import graduateArt from '../assets/profile/graduate.png'
import scholarArt from '../assets/login/graduate-illustration.png'
import './ReadHero.css'

/**
 * The Read page's banner: four slides, one request.
 *
 * Composition is taken from the supplied reference — a compact dark panel with
 * a text block and its call to action on the left, and the content it is
 * pointing at shown as a card on the right. The PALETTE is Verbo's, not the
 * reference's: `#2b2643` is the app's own dark surface (the sidebar is the same
 * colour) and `#a89ce3` is the accent every other filled control here uses. A
 * brown-and-orange banner would have looked imported.
 *
 * Nothing on it is invented. The recommendation carries the same
 * "Recommended because…" sentence the page already shows, "continue" is the
 * last article actually opened, the weekly counts are real queries, and the Pro
 * benefits are the four canonical ones from the Upgrade page.
 *
 * MOTION RULES, which this page's codebase is strict about: the visible slide
 * is React STATE, never a CSS transition — a transition only advances while the
 * tab composites frames, so a slid-to slide would be stranded off-screen by a
 * backgrounded tab. The only animation is `rh-in`, a transform-only nudge that
 * is pure ornament: every slide is fully readable at frame 0. Auto-rotation is
 * `setInterval` rather than requestAnimationFrame, since rAF is throttled to a
 * standstill exactly when a tab is in the background.
 */

const ROTATE_MS = 7000

/* The four benefits, worded as on the Upgrade page. Kept to the four that page
   calls out first, so the two cannot describe different products. */
const PRO_POINTS = [
  'Unlimited Chinese text scans',
  'Full story library',
  'Full podcast library',
  'Ad-free learning',
]

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8h9M8.5 4l4 4-4 4" />
    </svg>
  )
}

function Chevron({ back = false }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={back ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} />
    </svg>
  )
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 5" />
    </svg>
  )
}

/** One article slide — used by both Recommended and Continue. */
function ArticleSlide({ eyebrow, article, note, cta }) {
  const meta = [article.category, article.hsk_level, `${article.reading_minutes || 1} min read`]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <div className="rh-text">
        <p className="rh-eyebrow">{eyebrow}</p>
        <h2 className="rh-title">{article.title}</h2>
        <p className="rh-meta">{meta}</p>
        {note && <p className="rh-note">{note}</p>}
        <Link to={`/read/${article.id}`} className="rh-cta">
          {cta}
          <Arrow />
        </Link>
      </div>
      {/* The same generated cover the cards below use, so the banner is
          pointing at a recognisable object rather than showing new artwork. */}
      <div className="rh-visual rh-visual-cover">
        <ArticleCover article={article} />
      </div>
    </>
  )
}

function ProgressSlide({ week }) {
  const read = week.articles_read
  const goal = week.goal || 1
  const pct = Math.min(100, Math.round((read / goal) * 100))

  return (
    <>
      <div className="rh-text">
        <p className="rh-eyebrow">This week</p>
        <h2 className="rh-title rh-title-plain">
          {read === 0
            ? 'Nothing read yet this week'
            : `You've read ${read} article${read === 1 ? '' : 's'} this week`}
        </h2>
        {/* Says whose goal it is. The app sets it — the learner never chose a
            number of articles — and implying otherwise would be a small lie
            told in a motivational voice. */}
        <p className="rh-meta">
          {read} of {goal} · Verbo's weekly reading goal
          {week.words_saved > 0 && ` · ${week.words_saved} word${week.words_saved === 1 ? '' : 's'} saved`}
        </p>
        {/* Static width, never transitioned — the width IS the state, and a
            transition that never gets a frame would show every week at 0%.
            The ring that used to sit on the right is gone: a counter and a bar
            said the same thing twice, and the pair read as a dashboard widget
            rather than a banner. */}
        <div className="rh-bar" role="img" aria-label={`${read} of ${goal} articles read this week`}>
          <span className="rh-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <Link to="/vocabulary" className="rh-cta rh-cta-ghost">
          Your vocabulary
          <Arrow />
        </Link>
      </div>

      <div className="rh-visual rh-visual-art">
        <img src={graduateArt} alt="" className="rh-art rh-art-graduate" />
      </div>
    </>
  )
}

function ProSlide() {
  return (
    <>
      <div className="rh-text">
        <p className="rh-eyebrow">Verbo Pro</p>
        <h2 className="rh-title rh-title-plain">Scan without limits, read the whole library</h2>
        {/* The benefits moved into the text column so the illustration can have
            the right side to itself. Two columns of two — a single stacked list
            beside a headline and a button does not fit the banner's height, and
            shortening the list to make it fit would drop a real benefit. */}
        <ul className="rh-points">
          {PRO_POINTS.map((p) => (
            <li key={p}>
              <span className="rh-tick"><Tick /></span>
              {p}
            </li>
          ))}
        </ul>
        <Link to="/upgrade" className="rh-cta">
          Upgrade to Pro
          <Arrow />
        </Link>
      </div>

      <div className="rh-visual rh-visual-art">
        <img src={scholarArt} alt="" className="rh-art rh-art-scholar" />
      </div>
    </>
  )
}

export default function ReadHero({ data }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const rootRef = useRef(null)

  /* Slides are built from what actually came back. An article slide with no
     article is not rendered at all rather than shown empty, so a new account
     sees three slides and never a blank one. */
  const slides = []
  if (data?.recommended) {
    slides.push({
      key: 'recommended',
      variant: 'rh-v-article',
      label: 'Recommended',
      render: () => (
        <ArticleSlide
          eyebrow="Recommended for you"
          article={data.recommended}
          note={data.recommended.why}
          cta="Read now"
        />
      ),
    })
  }
  if (data?.continue) {
    const resuming = data.continue.kind === 'resume'
    slides.push({
      key: 'continue',
      variant: 'rh-v-article',
      label: resuming ? 'Continue' : 'Start here',
      render: () => (
        <ArticleSlide
          // Worded off the real state: only call it continuing if they opened
          // it before. Otherwise it is honestly just a second suggestion.
          eyebrow={resuming ? 'Pick up where you left off' : 'A good place to start'}
          article={data.continue}
          cta={resuming ? 'Keep reading' : 'Read now'}
        />
      ),
    })
  }
  if (data?.week) {
    slides.push({ key: 'week', variant: 'rh-v-week', label: 'This week', render: () => <ProgressSlide week={data.week} /> })
  }
  slides.push({ key: 'pro', variant: 'rh-v-pro', label: 'Verbo Pro', render: () => <ProSlide /> })

  const count = slides.length
  const active = Math.min(index, count - 1)

  /* Auto-rotation. Paused while the pointer or the keyboard is inside the
     banner — moving the thing someone is reading or about to click is the way
     a carousel becomes annoying — and switched off entirely for a reader who
     asked for reduced motion. */
  useEffect(() => {
    if (paused || count < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS)
    return () => clearInterval(t)
  }, [paused, count])

  const go = (n) => setIndex((n + count) % count)

  if (count === 0) return null

  return (
    <section
      className={"rh " + slides[active].variant}
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Reading highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget)) setPaused(false)
      }}
    >
      {/* `key` still remounts, which is what resets any per-slide state; there is
          no entrance animation to replay — see the note in the stylesheet. */}
      <div className="rh-slide" key={slides[active].key}>
        {slides[active].render()}
      </div>

      {count > 1 && (
        <div className="rh-controls">
          <div className="rh-dots">
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                className={'rh-dot' + (i === active ? ' on' : '')}
                onClick={() => go(i)}
                aria-label={s.label}
                aria-current={i === active}
              />
            ))}
          </div>
          <div className="rh-arrows">
            <button type="button" className="rh-arrow" onClick={() => go(active - 1)} aria-label="Previous">
              <Chevron back />
            </button>
            <button type="button" className="rh-arrow" onClick={() => go(active + 1)} aria-label="Next">
              <Chevron />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
