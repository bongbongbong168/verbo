import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { useApiData } from '../useApiData'
import Skeleton, { SkeletonCards } from '../components/Skeleton'
import ArticleCover from '../components/ArticleCover'
import { TRENDING, byTrending } from '../trending'
import PageTools from '../components/PageTools'
import TutorCover from '../components/TutorCover'
import heroSwoosh from '../assets/dashboard/hero-swoosh-final.png'
import heroHanzi from '../assets/dashboard/hero-hanzi.png'
import FlameMark from '../components/FlameMark'
import './Dashboard.css'
import ShelfRail from '../components/ShelfRail'

/* The design's Top Reads filter is four content categories that do not exist in
   the data. `articles.type` is the real dimension, so the pills are built from
   it — plus an All that is selected by default. */
const HAN = /[一-鿿]/

/* Three tiles, as the design draws them: one wide then two narrow. */
const PICKUP_SLOTS = 3

/* One shared empty array, so a section with no data keeps a STABLE identity
   between renders. A fresh `[]` each time would change on every render and
   re-run every `useMemo` that depends on it. */
const EMPTY = []

/**
 * A study unit as a pick-up tile: the level's book cover, a unit tag and a
 * level tag, the unit's English title and its Chinese line.
 *
 * Unit titles are authored as "中文 - English", so the two halves are split off
 * one field rather than needing separate columns — `description` wins for the
 * English half when it is filled in. The split matches the FIRST dash with
 * optional surrounding space, since the titles are authored inconsistently
 * ("接你们 - We will" but also "接你- We will") and requiring a leading space
 * silently fails on half of them. It only counts as a split when the left half
 * actually holds Han characters, so an English title containing a hyphen is
 * left alone.
 */
/* `progress` is the matching row from GET /study-levels, which carries
   units_count and units_opened. It is optional: the recent-views payload does
   not include them, so a tile whose level is missing from that list simply
   renders without a bar rather than with an empty one, which would read as
   "you have done none of this" when the truth is "we do not know". */
function shapeStudyTile(level, unit, progress) {
  if (!level || !unit) return null

  const raw = unit.title || ''
  const parts = raw.match(/^(.*?)\s*[-–—]\s*(.+)$/)
  const isSplit = Boolean(parts) && HAN.test(parts[1])
  const chinese = isSplit ? parts[1].trim() : HAN.test(raw) ? raw : ''
  const english = isSplit ? parts[2].trim() : ''

  // Number(): SQLite hands these back as strings, and they are divided below.
  const total = Number(progress?.units_count ?? 0)
  const opened = Math.min(Number(progress?.units_opened ?? 0), total)

  return {
    kind: 'study_unit',
    key: `u${unit.id}`,
    to: `/study/units/${unit.id}`,
    cover: level.image_url,
    unitTag: `Unit ${unit.position ?? (level.units || []).findIndex((u) => u.id === unit.id) + 1}`,
    levelTag: level.title,
    title: unit.description || english || raw,
    chinese,
    /* Only when the level actually has units — 0/0 is not a progress bar.
       `pct` drives the bar's width and stays exact; `percent` is the rounded
       figure on the label, floored at 1 whenever anything has been opened so a
       long level cannot report a real visit as "0%". */
    progress: total > 0
      ? {
          opened,
          total,
          pct: (opened / total) * 100,
          percent: opened === 0 ? 0 : Math.max(1, Math.round((opened / total) * 100)),
        }
      : null,
  }
}

/* FORMAT filters, plus Trending. The three formats are `articles.type` values;
   All and Trending are not — they are the two entries that cut the list a
   different way, which is why Trending sits next to All rather than after the
   formats. Same arrangement as the Read page's topic row. */
const READ_FILTERS = [
  { key: 'all', label: 'All' },
  { key: TRENDING, label: 'Trending' },
  { key: 'article', label: 'Article' },
  { key: 'story', label: 'Story' },
  { key: 'funfact', label: 'Fun fact' },
]

/* ---------------------------------------------------------------------------
   Everything below is in the design but has no backend behind it. Grouped and
   named so it is obvious at a glance which parts of this page are real data
   and which are holding the layout:
     - podcasts have no duration or author column
     - tutors have no lesson count or rating
   (Two former residents have moved out: the activity chart is real data now —
   see ActivityController and useActivityHeartbeat — and so is My Learning,
   which reads real bookings and course enrolments through LearningController.)
   --------------------------------------------------------------------------- */
const PLACEHOLDER_PODCAST = {
  duration: '8mins',
  author: 'Chen Mingyue',
  language: 'Chinese｜Mandarin',
}
const PLACEHOLDER_TEACHER = { lessons: '275', rating: '4.9' }

/* "Today · 7:00 PM", "Tomorrow · 6:00 PM", else "Sep 8 · 7:00 PM".
   Relative for the two days a student actually has to act on, absolute after
   that — "in 9 days" is a number you have to convert back into a date.

   The weekday is deliberately dropped from the absolute form. The right rail
   is ~300px, which leaves this line about 116px: "Tue, Sep 1 · 6:00 PM" wraps
   onto two lines there, and a time broken across a line break is harder to read
   than one without a weekday. Within a week the label is relative anyway, which
   is when the weekday would have earned its space. */
function whenLabel(iso, endIso) {
  const at = new Date(iso)
  const now = new Date()

  /* A session already under way says so. Showing its start time once it has
     passed is the least useful thing the card could say — "6:00 PM" at 6:20
     reads as upcoming when you are already ten minutes late to it. */
  if (endIso && at <= now && new Date(endIso) > now) {
    const mins = Math.max(1, Math.round((new Date(endIso) - now) / 60000))
    return `Happening now · ${mins} min left`
  }

  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate())
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((day - midnight) / 86400000)

  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days === 0) return `Today · ${time}`
  if (days === 1) return `Tomorrow · ${time}`

  const date = at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return `${date} · ${time}`
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.875 6.5v11c0 .8.9 1.3 1.6.9l8.2-5.5c.6-.4.6-1.4 0-1.8L8.475 5.6c-.7-.4-1.6.1-1.6.9z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  )
}

function VerifiedIcon() {
  return (
    <svg className="db-verified" viewBox="0 0 24 24" aria-label="Verified" role="img">
      <path
        fill="#d61f1f"
        d="M12.00 1.00 L9.64 3.21 L6.50 2.47 L5.57 5.57 L2.47 6.50 L3.21 9.64 L1.00 12.00 L3.21 14.36 L2.47 17.50 L5.57 18.43 L6.50 21.53 L9.64 20.79 L12.00 23.00 L14.36 20.79 L17.50 21.53 L18.43 18.43 L21.53 17.50 L20.79 14.36 L23.00 12.00 L20.79 9.64 L21.53 6.50 L18.43 5.57 L17.50 2.47 L14.36 3.21 Z"
      />
      <path
        d="M7.6 12.1 10.5 15 16.4 9.1"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* `CapIcon`, `LangIcon` and `StarIcon` were deleted with the teacher card's
   meta rows. The podcast card beside it carries no icons on its text lines, so
   matching it meant losing all three rather than keeping the star alone —
   one glyph left in a row of three plain lines reads as a leftover. */

/**
 * One mark per goal type, on the app's usual 24 grid at strokeWidth 1.7.
 *
 * THE GLYPH IS WHAT DISTINGUISHES THE THREE, NOT A COLOUR. The reference this
 * was rebuilt from gives every row its own hue, but it owns a palette with
 * three of them and Verbo owns lavender plus one warm accent — inventing a
 * blue and a green to fill the gap is exactly the second colour family the
 * `#8b6ff0` sweep took back out. Colour here carries STATE (see the CSS);
 * identity is carried by the drawing.
 *
 * Declared here rather than in `components/` because these three exist nowhere
 * else. Extract them the moment a second page wants one — the `MenuDotsIcon`
 * note is about a mark that had already been copied twice, not about marks
 * with a single home.
 */
const GOAL_MARKS = {
  // An open book with a line of text on it — reading, not a filed document.
  read_article: (
    <>
      <path d="M12 7.5v12" />
      <path d="M12 7.5C10.6 6.2 8.8 5.5 6.8 5.5H3.5v12h3.3c2 0 3.8.7 5.2 2 1.4-1.3 3.2-2 5.2-2h3.3v-12h-3.3c-2 0-3.8.7-5.2 2z" />
      <path d="M15.5 10.5h3M15.5 13.5h3" />
    </>
  ),
  review_words: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.5 3.5v4.5H16" />
    </>
  ),
  // A bookmark with a star — saving something worth keeping.
  save_words: (
    <>
      <path d="M6.5 3h11a1 1 0 0 1 1 1v17l-6.5-3.8L5.5 21V4a1 1 0 0 1 1-1z" />
      <path d="m12 7 1.15 2.33 2.57.38-1.86 1.81.44 2.56L12 12.87l-2.3 1.21.44-2.56-1.86-1.81 2.57-.38z" />
    </>
  ),
  opened: (
    <>
      <path d="M12 7.5v12" />
      <path d="M12 7.5C10.6 6.2 8.8 5.5 6.8 5.5H3.5v12h3.3c2 0 3.8.7 5.2 2 1.4-1.3 3.2-2 5.2-2h3.3v-12h-3.3c-2 0-3.8.7-5.2 2z" />
    </>
  ),
  words: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  /* Sliders, NOT the mockup's circular arrow. That glyph is already
     "Review 5 words" three rows below, and the same drawing meaning two
     different things inside one card is worse than a small deviation — this
     one also points where the link actually goes, which is the Learning panel
     in Settings. */
  change: (
    <>
      <path d="M4 8h10M18 8h2M4 16h3M11 16h9" />
      <circle cx="16" cy="8" r="2.2" />
      <circle cx="9" cy="16" r="2.2" />
    </>
  ),
}

function GoalMark({ type }) {
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
      {GOAL_MARKS[type]}
    </svg>
  )
}

/** One of the three boxes under the level: a marked chip, a number, a label. */
function PlanStat({ mark, value, label, to }) {
  const inner = (
    <>
      <span className="db-plan-stat-mark" aria-hidden="true">
        <GoalMark type={mark} />
      </span>
      {/* Both of these carry a CLASS, and that is not decoration. The rule
          that styles the label used to be the bare type selector
          `.db-plan-stat span` — which also matches `.db-plan-stat-mark`,
          because the chip is a span too, and at (0,1,1) it outranked the
          chip's own (0,1,0) rule and killed its `display: flex`. The glyph
          then sat hard against the top of its circle with 13px of nothing
          beneath it. Same family as the `.up` collision the Vocabulary Bank
          documents: never let a selector reach further than the one element
          it is describing. */}
      <span className="db-plan-stat-body">
        {value !== undefined && <strong className="db-plan-stat-value">{value}</strong>}
        <span className="db-plan-stat-label">{label}</span>
      </span>
    </>
  )

  return to ? (
    <Link className="db-plan-stat db-plan-stat-link" to={to}>
      {inner}
    </Link>
  ) : (
    <div className="db-plan-stat">{inner}</div>
  )
}

/* Section heading, with the design's optional "View all" link on the right. */
/**
 * Where the learner is in their level, and today's three goals.
 *
 * THERE IS NO PROJECTED FINISH DATE. The reference this was built from leads
 * with "HSK 1 in 1 month and 9 days", and nothing in Verbo measures how long a
 * lesson takes — that date would be an assumption dressed as a measurement.
 * The card reports lessons left at the pace the learner chose and lets them do
 * the arithmetic, which they can see.
 *
 * Every figure is counted server-side from rows the app already writes, so
 * there is nothing to invalidate when a word is saved or a lesson opened — the
 * next load is simply current.
 */
function LearningPlanCard({ plan, goals }) {
  // Nothing has arrived yet. No skeleton: this sits below the fold of the rail
  // and a flashing block there is more distracting than a moment of nothing.
  if (!goals) return null

  const done = goals.filter((g) => g.done).length

  return (
    <section className="db-plan">
      {plan ? (
        <>
          {/* The heading takes the FULL width. CHANGE sits on the stats row
              below instead of beside the title — which is what the reference
              does, and it is load-bearing: in the rail the card is ~171px of
              content at 1240, so a button beside the title left ~110px and
              broke "7 lessons left" across two lines mid-phrase. */}
          <div className="db-plan-top">
            <h2 className="db-plan-level">{plan.level}</h2>
            {/* Real, admin-authored: `study_levels.level_label`, the same
                column Daily Use reads. Nothing is inferred from the HSK
                number — see the note in LearningPlanController. */}
            {plan.level_label && (
              <span className="db-plan-tag">
                <span className="db-plan-tag-mark" aria-hidden="true">
                  <GoalMark type="opened" />
                </span>
                {plan.level_label}
              </span>
            )}
          </div>
          <p className="db-plan-sub">
            {plan.units_left > 0
              ? `${plan.units_left} ${plan.units_left === 1 ? 'lesson' : 'lessons'} left`
              : 'Every lesson opened'}
            {/* The pace is only stated when one was actually chosen.
                "Whenever I have time" is a real answer for someone who will
                not commit to a number, and turning it into a silent
                assumption would be the one untrue thing here. */}
            {plan.pace_label ? ` · ${plan.pace_label}` : ''}
          </p>

          <div className="db-plan-stats">
            {/* "Opened", never "completed" — nothing records a unit as
                finished, so the label cannot claim more than is known. The
                Profile page words it the same way. */}
            <PlanStat mark="opened" value={plan.units_opened} label="OPENED" />
            <PlanStat mark="words" value={plan.words_saved} label="WORDS" />
            <PlanStat mark="change" label="CHANGE" to="/settings?s=learning" />
          </div>
        </>
      ) : (
        <div className="db-plan-top">
          <div>
            <h2 className="db-plan-level">Pick a level</h2>
            <p className="db-plan-sub">Open a lesson and your progress shows up here.</p>
          </div>
          <Link className="db-plan-change" to="/study">
            BROWSE
          </Link>
        </div>
      )}

      <div className="db-goals">
        <div className="db-goals-head">
          <h3 className="db-goals-title">Today</h3>
          {/* Warm once the day is cleared, the same signal a finished row
              carries. The reference puts a reward ladder here instead —
              50exp / 100exp / Claim Now — and there is no XP in Verbo, by
              decision rather than omission. */}
          <span className={done === goals.length ? 'db-goals-count all' : 'db-goals-count'}>
            {done} / {goals.length} done
          </span>
        </div>

        <ul className="db-goals-list">
          {goals.map((g) => (
            <li className={g.done ? 'db-goal done' : 'db-goal'} key={g.type}>
              <span className="db-goal-mark">
                <GoalMark type={g.type} />
              </span>
              <span className="db-goal-label">{g.label}</span>
              {/* A track, not an animation — a width transition only advances
                  while the tab composites frames, so a backgrounded tab would
                  leave every bar sitting at zero.

                  The count sits OUTSIDE the bar now, in its own column. It
                  rode inside while the groove was white-on-lavender and the
                  number needed somewhere solid to sit; with the row inverted
                  the bar is free to be a plain bar, and the three counts line
                  up down a single right edge where they can be compared. */}
              <span className="db-goal-track">
                <span
                  className="db-goal-fill"
                  style={{ width: `${(g.progress / g.target) * 100}%` }}
                />
              </span>
              <span className="db-goal-count">
                {g.progress} / {g.target}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SectionHead({ title, to }) {
  return (
    <div className="db-head">
      <h2 className="db-section-title">{title}</h2>
      {to && (
        <Link className="db-viewall" to={to}>
          View all
          {/* The chevron is the part that actually says "there is more this
              way" — the word alone gives no direction. */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  )
}

/* The podcast tile used in both "Pick up where you left off" and "Podcasts":
   cover with a duration badge and a centred play button, then the meta stack. */
function PodcastCard({ podcast }) {
  return (
    <Link className="db-pod" to={`/podcast/${podcast.id}`}>
      <span className="db-pod-cover">
        {podcast.image_url && <img src={podcast.image_url} alt="" />}
        <span className="db-pod-duration">{PLACEHOLDER_PODCAST.duration}</span>
        <span className="db-pod-play">
          <PlayIcon />
        </span>
      </span>
      <span className="db-pod-level">{podcast.level || 'Beginner'}</span>
      <span className="db-pod-title">{podcast.title}</span>
      <span className="db-pod-author">{PLACEHOLDER_PODCAST.author}</span>
      <span className="db-pod-lang">{PLACEHOLDER_PODCAST.language}</span>
    </Link>
  )
}

/* The read tile, for "Pick up where you left off".
 *
 * Same shell as the podcast card beside it — white card, the page's navy
 * stroke, 14px radius, the same lift on hover — because they sit in one row and
 * a second card style would read as a second kind of product.
 *
 * What makes it a READ rather than an episode is all real, none of it invented:
 * the generated topic cover it already wears on the Read page (so the same
 * article looks like itself in both places), the FORMAT badge in place of the
 * podcast's duration, no play button, and the derived reading time where the
 * podcast card carries its author. Notably it does NOT get a duration badge —
 * that figure is a placeholder on the podcast card, and copying a placeholder
 * onto a new card is how a stand-in turns into a fact. */
function ReadCard({ article }) {
  return (
    <Link className="db-read-tile" to={`/read/${article.id}`}>
      <ArticleCover article={article} small />
      <span className="db-read-tile-meta">
        {[article.category, article.hsk_level].filter(Boolean).join(' · ')}
      </span>
      <span className="db-read-tile-title">{article.title}</span>
      <span className="db-read-tile-time">{article.reading_minutes || 1} min read</span>
    </Link>
  )
}

export default function Dashboard() {
  const { token, user } = useAuth()

  /* ONE REQUEST PER SECTION, each painting the moment its own data lands.
     This was a single `Promise.all` over eight calls behind one
     `if (loading) return <p>Loading...</p>`, so the entire page waited on the
     slowest of the eight — and the deployed API answers most requests in
     ~200ms but stalls for seconds on roughly one in three, which meant the
     Dashboard almost always waited on a straggler. Split up, a stalled request
     costs one late section instead of a blank screen; cached, a revisit paints
     immediately and refreshes behind. See `dataCache.js`. */
  const quoteQuery = useApiData('quote', () => api.getQuote(token))
  const tutorQuery = useApiData('tutors', () => api.getTutors(token))
  const articleQuery = useApiData('articles', () => api.getArticles(token))
  const podcastQuery = useApiData('podcasts', () => api.getPodcasts(token))
  /* The level list is also the only place units_count / units_opened arrive —
     the recent-views payload carries neither, and re-deriving them there would
     be a query per row for numbers already on the wire. */
  const levelQuery = useApiData('study-levels', () => api.getStudyLevels(token))
  const recentQuery = useApiData('recent-views:3', () => api.getRecentViews(token, 3))
  const activityQuery = useApiData('activity:7', () => api.getActivitySummary(token, 7))
  const planQuery = useApiData('learning-plan', () => api.getLearningPlan(token))
  const learningQuery = useApiData('my-learning:3', () => api.getMyLearning(token, 3))

  const quote = quoteQuery.data ?? null
  const activity = activityQuery.data ?? null
  const asList = (v) => (Array.isArray(v) ? v : EMPTY)
  const tutors = useMemo(() => asList(tutorQuery.data).slice(0, 3), [tutorQuery.data])
  const articles = asList(articleQuery.data)
  const podcasts = asList(podcastQuery.data)
  const levels = asList(levelQuery.data)
  const recents = asList(recentQuery.data)
  const learning = asList(learningQuery.data)

  /* Only a failure that leaves a section with NOTHING is worth a banner —
     `useApiData` swallows a background refresh that fails behind data already
     on screen, since replacing a good page with an error because a revalidation
     stalled is strictly worse than leaving it alone. */
  const [actionError, setActionError] = useState(null)
  const error =
    actionError ||
    [quoteQuery, tutorQuery, articleQuery, podcastQuery, levelQuery].find((q) => q.error)?.error
      ?.message ||
    null

  const [readFilter, setReadFilter] = useState('all')

  const [editingQuote, setEditingQuote] = useState(false)
  const [quoteChinese, setQuoteChinese] = useState('')
  const [quotePinyin, setQuotePinyin] = useState('')
  const [quoteEnglish, setQuoteEnglish] = useState('')
  const [savingQuote, setSavingQuote] = useState(false)

  /* The quote form mirrors the loaded quote, but must NOT stamp over what is
     being typed — so it re-syncs only while the form is closed. */
  useEffect(() => {
    if (editingQuote) return
    setQuoteChinese(quote?.chinese || '')
    setQuotePinyin(quote?.pinyin || '')
    setQuoteEnglish(quote?.english || '')
  }, [quote, editingQuote])

  /* The study fallback only exists to fill a row real history cannot fill, so
     the extra request is skipped once there are three real tiles — or once a
     study unit is already among them, since that is the slot it would take. */
  const needsStudyFallback =
    recents.length < PICKUP_SLOTS && !recents.some((r) => r.kind === 'study_unit')

  /* GET /study-levels returns levels WITHOUT their units, so reaching unit 1
     needs the detail call. It stays dependent rather than parallel because
     which level to open is only known once the list arrives — but it is now its
     own query, so it no longer holds up the rest of the page.

     Feature the level with the most units rather than whichever sorts first —
     with no progress tracking, "the course with the most content authored" is
     the closest honest stand-in for the one being worked through, and it keeps
     empty levels out of the tile. `reduce` keeps the natural sort order as the
     tie-break, since it only replaces on a strictly greater count. */
  const featuredLevel = useMemo(() => {
    if (!needsStudyFallback || levels.length === 0) return null
    return levels.reduce(
      (best, l) => ((l.units_count ?? 0) > (best?.units_count ?? 0) ? l : best),
      levels[0],
    )
  }, [needsStudyFallback, levels])

  const featuredQuery = useApiData(featuredLevel ? `study-level:${featuredLevel.id}` : null, () =>
    api.getStudyLevel(token, featuredLevel.id),
  )

  // A failure here leaves the tile out, not the whole page.
  const studyUnit = useMemo(() => {
    const full = featuredQuery.data
    return full?.units?.[0] ? { level: full, unit: full.units[0] } : null
  }, [featuredQuery.data])

  /* Nothing is known yet for the pick-up row while its three inputs are still
     in flight. Distinct from "there is genuinely nothing here", which is what
     the row's own empty state says — showing that first and then filling it in
     would tell a new user they have nothing before checking. */
  const pickupLoading =
    recentQuery.loading ||
    podcastQuery.loading ||
    levelQuery.loading ||
    (Boolean(featuredLevel) && featuredQuery.loading)

  async function handleSaveQuote(e) {
    e.preventDefault()
    setActionError(null)
    setSavingQuote(true)
    try {
      const updated = await api.saveQuote(token, {
        chinese: quoteChinese,
        pinyin: quotePinyin,
        english: quoteEnglish,
      })
      // Written THROUGH the cache, so the new quote survives leaving the page
      // and coming back rather than being replaced by the stale cached copy.
      quoteQuery.setData(updated)
      setEditingQuote(false)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setSavingQuote(false)
    }
  }

  /* The pick-up row is ONE recency order across modules, not a fixed study
     tile plus two podcasts. Whatever the user opened last leads the row and
     the rest follow behind it, so clicking HSK 1 then a podcast puts the
     podcast first and HSK 1 second.

     Suggestions pad the row when real history cannot fill it — a new user has
     none at all — but they always sit AFTER real history and never duplicate
     something already in it. Capped at three, which is what the design draws. */
  const pickup = useMemo(() => {
    const tiles = []
    const seen = new Set()
    // Number() on both sides: SQLite returns ids as strings on list endpoints,
    // so a bare === silently never matches and every bar would go missing.
    const levelById = (id) => levels.find((l) => Number(l.id) === Number(id))
    /* Everything added in the FIRST loop is something this person actually
       opened; everything after it is a suggestion. The count is kept so the
       heading can tell the truth — "Pick up where you left off" over a row of
       things you have never opened is a claim about your history that is
       simply false. */
    let fromHistory = 0

    for (const row of recents) {
      if (row.kind === 'study_unit') {
        const tile = shapeStudyTile(row.level, row.unit, levelById(row.level?.id))
        if (tile) {
          tiles.push(tile)
          seen.add(tile.key)
          fromHistory++
        }
      } else if (row.kind === 'podcast' && row.podcast) {
        const key = `p${row.podcast.id}`
        tiles.push({ kind: 'podcast', key, podcast: row.podcast })
        seen.add(key)
        fromHistory++
      } else if (row.kind === 'article' && row.article) {
        const key = `a${row.article.id}`
        tiles.push({ kind: 'article', key, article: row.article })
        seen.add(key)
        fromHistory++
      }
    }

    // Unit 1 of the most-populated level, for someone who has not opened one.
    if (tiles.length < PICKUP_SLOTS && studyUnit) {
      const tile = shapeStudyTile(
        studyUnit.level,
        studyUnit.unit,
        levelById(studyUnit.level?.id),
      )
      if (tile && !seen.has(tile.key)) {
        tiles.push(tile)
        seen.add(tile.key)
      }
    }

    for (const podcast of podcasts) {
      if (tiles.length >= PICKUP_SLOTS) break
      const key = `p${podcast.id}`
      if (seen.has(key)) continue
      tiles.push({ kind: 'podcast', key, podcast })
      seen.add(key)
    }

    return { tiles: tiles.slice(0, PICKUP_SLOTS), fromHistory }
  }, [recents, studyUnit, podcasts, levels])

  const visibleReads = useMemo(() => {
    // Shared with the Read page, so the same three articles lead in the same
    // order on both — see src/trending.js.
    if (readFilter === TRENDING) return byTrending(articles).slice(0, 3)
    return articles.filter((a) => readFilter === 'all' || a.type === readFilter).slice(0, 3)
  }, [articles, readFilter])

  /* The chart scales to the busiest day, so the tallest bar always fills it and
     the dashed average sits in proportion to the real bars. An earlier version
     floored the scale at one hour, which pinned everything to the bottom until
     a user had logged a full hour — technically honest, but it read as a broken
     chart and the average line looked stuck on the floor.

     Ratios are computed from seconds, not the rounded `hours` field: at small
     totals the 2dp rounding is a large fraction of the value and would put the
     average line visibly off its true position. */
  const activityDays = activity?.days || []
  const streak = activity?.streak?.current ?? 0
  const longestStreak = activity?.streak?.longest ?? 0
  const maxSeconds = Math.max(0, ...activityDays.map((d) => d.seconds))
  const hasActivity = maxSeconds > 0
  const peakDay = activityDays.reduce((a, b) => (b && b.seconds > (a?.seconds ?? -1) ? b : a), null)
  /* The rule sits below the tallest bar, as in the design. Its height and its
     label have to agree — a line drawn at 78% of the peak but labelled with the
     peak would simply be wrong — so what it marks is the average across the
     week. The peak bar stays highlighted, which is what identifies the best day
     now that the rule no longer points at it. */
  const avgSeconds = activityDays.length
    ? activityDays.reduce((sum, d) => sum + d.seconds, 0) / activityDays.length
    : 0
  // Guard the divisor only for the all-zero case, where every ratio is 0 anyway.
  const scale = maxSeconds || 1
  const pct = (seconds) => (seconds / scale) * 100

  /* "0.01 hours" is a useless label on a real early week — read it out in the
     unit that actually carries information at that magnitude. */
  const readDuration = (seconds) => {
    if (seconds >= 3600) {
      const hours = seconds / 3600
      return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} hours`
    }
    // A day with nothing on it has to read as nothing. The floor below rounds
    // any non-zero value up to "1 min" so a real but tiny session is not
    // reported as zero — but it must not catch an actually-empty day.
    if (seconds <= 0) return 'No time'
    return `${Math.max(1, Math.round(seconds / 60))} min`
  }

  /* No page-wide loading gate. The hero, the rail and every section frame are
     known before any request returns, so they paint immediately and each
     section fills itself in. */
  return (
    <div className="db">
      <div className="db-topbar">
        {/* Messages, bell, account — shared with every other page through
            PageTools so the set cannot drift between them. This page had been
            importing the two menus directly, which is exactly why it missed
            the Messages button when that was added to PageTools. */}
        <PageTools />
      </div>

      {error && <p className="db-error">{error}</p>}

      <div className="db-hero">
        <img className="db-hero-swoosh" src={heroSwoosh} alt="" />
        {/* 学 is its OWN element rather than part of the swoosh above it. The
            swoosh strip is 1500x281 and the hero is roughly 875x305, so
            `object-fit: fill` squeezes it to 58% of its width while stretching
            it to 109% of its height — fine for an abstract curve, ruinous for
            a character, which came out visibly narrow and tall. Split out, it
            scales uniformly off the hero's height and keeps its shape at every
            width. */}
        <img className="db-hero-hanzi" src={heroHanzi} alt="" />
        <span
          className={'db-streak-badge' + (streak > 0 ? '' : ' idle')}
          title={
            streak > 0
              ? `Longest streak: ${longestStreak} ${longestStreak === 1 ? 'day' : 'days'}`
              : 'Open Verbo on consecutive days to build a streak'
          }
        >
          {/* Drawn, not a raster — and not the 🔥 emoji before that, which
              rendered as a different picture on every OS. The reason for the
              second swap is the cold state: a PNG cannot be recoloured, so
              "no streak yet" had to be `filter: grayscale(1)`, which gives a
              desaturated orange rather than the app's grey. The component
              takes `lit` and uses real colours for both. */}
          <FlameMark className="db-streak-flame" lit={streak > 0} />
          {/* "5 day streak", not "5 days streak" — attributive, and it is how
              the design words it. Wrapped so its vertical position can be tuned
              against the flame without dragging the flame along with it. */}
          <span className="db-streak-text">
            {streak > 0 ? `${streak} day streak` : 'No streak yet'}
          </span>
        </span>
        <div className="db-hero-content">
          <h1 className="db-greeting">你好, {user?.name}!</h1>

          {editingQuote ? (
            <form className="db-quote-form" onSubmit={handleSaveQuote}>
              <div>
                <label>Chinese</label>
                <input value={quoteChinese} onChange={(e) => setQuoteChinese(e.target.value)} />
              </div>
              <div>
                <label>Pinyin</label>
                <input value={quotePinyin} onChange={(e) => setQuotePinyin(e.target.value)} />
              </div>
              <div>
                <label>English</label>
                <input value={quoteEnglish} onChange={(e) => setQuoteEnglish(e.target.value)} />
              </div>
              <div className="db-quote-form-actions">
                <button type="submit" className="db-btn-primary" disabled={savingQuote}>
                  {savingQuote ? 'Saving...' : 'Save quote'}
                </button>
                <button
                  type="button"
                  className="db-btn-ghost"
                  onClick={() => setEditingQuote(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              {quote?.chinese && <p className="db-quote-chinese">{quote.chinese}</p>}
              {quote?.english && <p className="db-quote-english">&ldquo;{quote.english}&rdquo;</p>}
              {!quote?.chinese && !quote?.english && (
                <p className="db-quote-empty">No quote set yet.</p>
              )}
            </>
          )}

          <div className="db-hero-actions">
            <Link to="/find-tutor" className="db-btn-cta">
              Find Tutor
            </Link>
            {user?.is_admin && !editingQuote && (
              <button
                type="button"
                className="db-quote-edit-toggle"
                onClick={() => setEditingQuote(true)}
              >
                Edit quote
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="db-body">
        {/* ================= left panel ================= */}
        <div className="db-panel">
          {/* ---- Pick up where you left off ---- */}
          <section className="db-section">
            {/* The heading follows the CONTENT. A brand-new account has no
                recent views, so the row is padded entirely with suggestions —
                and "Pick up where you left off" over things this person has
                never opened is simply a false claim about their history. The
                tiles are the same either way; only the promise changes. */}
            <SectionHead
              title={pickup.fromHistory > 0 ? 'Pick up where you left off' : 'Start learning'}
            />
            {/* Rendered straight down the recency order — the first slot is
                wide whatever lands in it, so the most recent thing leads the
                row regardless of which module it came from. */}
            {/* The paging arrows, the ends detection and the wheel handler all
                come from `ShelfRail`, the same component the podcast shelves
                use — one behaviour for every scrolling row in the app rather
                than a second copy that drifts. The row keeps its own class, so
                the card widths, the gaps and the shadow clearance below are
                untouched. */}
            <ShelfRail className="db-pickup" label="Pick up where you left off">
              {pickup.tiles.map((tile) =>
                tile.kind === 'study_unit' ? (
                  <Link key={tile.key} className="db-study" to={tile.to}>
                    <span className="db-study-cover">
                      {tile.cover && <img src={tile.cover} alt="" />}
                    </span>
                    <span className="db-study-body">
                      <span className="db-study-tags">
                        <span className="db-tag db-tag-unit">{tile.unitTag}</span>
                        <span className="db-tag db-tag-level">{tile.levelTag}</span>
                      </span>
                      <span className="db-study-title">{tile.title}</span>
                      <span className="db-study-rule" />
                      {tile.chinese && (
                        <span className="db-study-quote">&ldquo;{tile.chinese}&rdquo;</span>
                      )}
                      {/* Units OPENED over the level's total — the same figure
                          the Study page shows, and worded the same way, because
                          nothing in the app records a unit as finished and
                          "complete" would claim more than the data knows.
                          role="img" rather than "progressbar": this sits inside
                          a link, and a progressbar role here would announce an
                          interactive widget that cannot be operated. */}
                      {tile.progress && (
                        <span
                          className="db-study-progress"
                          role="img"
                          aria-label={`${tile.progress.opened} of ${tile.progress.total} ${
                            tile.progress.total === 1 ? 'unit' : 'units'
                          } opened`}
                        >
                          {/* Label row over a full-width bar, the value picked
                              out in the accent — the arrangement and the
                              percentage both from the supplied reference. The
                              exact counts stay on the aria-label, which is the
                              more useful thing to hear read aloud and keeps
                              "3 of 8 units opened" on the record. */}
                          <span className="db-study-progress-head" aria-hidden="true">
                            <span className="db-study-progress-label">Progress</span>
                            <span className="db-study-progress-value">{tile.progress.percent}%</span>
                          </span>
                          <span className="db-study-track">
                            <span
                              className="db-study-fill"
                              style={{ width: `${tile.progress.pct}%` }}
                            />
                          </span>
                        </span>
                      )}
                    </span>
                  </Link>
                ) : tile.kind === 'article' ? (
                  <ReadCard key={tile.key} article={tile.article} />
                ) : (
                  <PodcastCard key={tile.key} podcast={tile.podcast} />
                ),
              )}
              {pickup.tiles.length === 0 &&
                (pickupLoading ? (
                  <>
                    <Skeleton className="db-study" style={{ height: 226 }} />
                    <Skeleton className="db-pod" style={{ height: 220 }} />
                    <Skeleton className="db-pod" style={{ height: 220 }} />
                  </>
                ) : (
                  <p className="db-empty">Nothing to study yet — check back soon.</p>
                ))}
            </ShelfRail>
          </section>

          {/* ---- Recommend Teachers ---- */}
          <section className="db-section">
            <SectionHead title="Recommend Teachers" to="/find-tutor" />
            {tutorQuery.loading ? (
              <SkeletonCards className="db-grid3" count={3} mediaHeight={112} />
            ) : tutors.length === 0 ? (
              <p className="db-empty">No tutors yet.</p>
            ) : (
              <div className="db-grid3">
                {tutors.map((t) => (
                  <Link className="db-teacher" key={t.id} to={`/find-tutor/${t.id}`}>
                    {/* THE PODCAST CARD'S SHAPE, one row down, because the two
                        sit in the same column and read as one page: a full
                        cover, then a muted eyebrow, the bold headline, a middle
                        line and a muted tail. Only what a TUTOR actually is
                        differs — a rating where the episode has a level, a name
                        where it has a title, lessons where it has an author.

                        The overlapping avatar that used to ride the cover's
                        bottom edge is GONE, and not only for the resemblance:
                        it was a second, smaller copy of the same photograph,
                        which is the exact thing the profile page's "Teacher you
                        may like" strip deleted for the same reason.

                        Shared with that strip — see `TutorCover` for why it was
                        pulled out. A tutor with no photo gets a generated cover
                        rather than a plain grey block: a tone and the initial,
                        oversized as texture rather than as something to
                        read. */}
                    <TutorCover
                      className="db-teacher-cover"
                      id={t.id}
                      photoUrl={t.photo_url}
                      name={t.user.name}
                    />
                    {/* No reviews yet reads as "New", not 0 — a zero looks like
                        a terrible score rather than an absent one. */}
                    <span className="db-teacher-rating">
                      {t.reviews_avg_rating != null
                        ? `${t.reviews_avg_rating} Rating`
                        : 'New tutor'}
                    </span>
                    <span className="db-teacher-name">
                      <span className="db-teacher-name-text">{t.user.name}</span>
                      <VerifiedIcon />
                    </span>
                    <span className="db-teacher-lessons">
                      {PLACEHOLDER_TEACHER.lessons} Lessons
                    </span>
                    <span className="db-teacher-lang">
                      {t.languages_spoken || 'Chinese (Mandarin)'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ---- Podcasts ---- */}
          <section className="db-section">
            <SectionHead title="Podcasts" to="/podcast" />
            {podcastQuery.loading ? (
              <SkeletonCards className="db-grid3" count={3} mediaHeight={112} />
            ) : podcasts.length === 0 ? (
              <p className="db-empty">No podcasts yet.</p>
            ) : (
              <div className="db-grid3">
                {podcasts.slice(0, 3).map((p) => (
                  <PodcastCard key={p.id} podcast={p} />
                ))}
              </div>
            )}
          </section>

          {/* ---- Top Reads ---- */}
          <section className="db-section db-section-last">
            <SectionHead title="Top Reads" />
            <div className="db-filters" role="tablist">
              {READ_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={readFilter === f.key}
                  className={'db-filter' + (readFilter === f.key ? ' active' : '')}
                  onClick={() => setReadFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* KEYED ON THE FILTER, so switching pills remounts the list and
                replays its landing. Without it the rows were replaced between
                one frame and the next, which is the thing that read as abrupt:
                the pill moved, and the content under it had simply already
                changed. See `db-read-land` for why the motion is safe. */}
            <div className="db-reads" key={readFilter}>
              {articleQuery.loading ? (
                <>
                  <Skeleton style={{ height: 74 }} />
                  <Skeleton style={{ height: 74 }} />
                  <Skeleton style={{ height: 74 }} />
                </>
              ) : visibleReads.length === 0 ? (
                /* Trending gets its own wording: "no reads match that filter"
                   is untrue here — every read matches, none has been liked. */
                <p className="db-empty">
                  {readFilter === TRENDING
                    ? 'No likes yet — the most liked reads will show up here.'
                    : 'No reads match that filter.'}
                </p>
              ) : (
                visibleReads.map((a) => (
                  <Link className="db-read" key={a.id} to={`/read/${a.id}`}>
                    <span className="db-read-body">
                      <span className="db-read-title">{a.title}</span>
                      <span className="db-read-excerpt">{a.excerpt}</span>
                    </span>
                    <span className="db-read-thumb">
                      {a.image_url && <img src={a.image_url} alt="" />}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>

        {/* ================= right rail ================= */}
        <aside className="db-panel db-rail">
          <section className="db-section">
            {/* "My Learning", not "My Courses" or "My Tutors".
                A student's relationship with a tutor runs through two different
                shapes — a private lesson they scheduled and a group course they
                joined — and this answers one question across both: what am I
                learning, and when do I turn up? "Courses" would drop every
                private lesson; "Tutors" would name a person when what is needed
                is a time. */}
            <SectionHead title="My Learning" />

            {learningQuery.loading ? (
              <>
                <Skeleton style={{ height: 62, marginBottom: '0.6rem' }} />
                <Skeleton style={{ height: 62 }} />
              </>
            ) : learning.length === 0 ? (
              <div className="db-course-empty">
                <p>No upcoming lessons</p>
                <Link to="/find-tutor">Explore tutors →</Link>
              </div>
            ) : (
              learning.map((item) => (
                <Link key={item.key} to={item.href} className="db-course">
                  {/* The tutor's own photo — real data, and it answers "who am
                      I learning with" at a glance. Falls back to the plain
                      cover block only when that tutor has no photo. */}
                  <span className="db-course-thumb">
                    {item.image_url && <img src={item.image_url} alt="" />}
                  </span>
                  <span className="db-course-body">
                    <span className="db-course-title">{item.title}</span>
                    {/* Who and which kind, on one quiet line. */}
                    <span className="db-course-who">
                      {[item.tutor, item.kind === 'group' ? 'Group' : 'Private']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="db-course-time">
                      {whenLabel(item.starts_at, item.ends_at)}
                    </span>
                  </span>
                  <ChevronRight />
                </Link>
              ))
            )}
          </section>

          <section className="db-section db-section-last">
            <SectionHead title="Stats Summary" />
            <div className="db-activity">
              <div className="db-activity-head">
                <span className="db-activity-label">Activity</span>
                <span className="db-activity-range">
                  <CalendarIcon /> last 7 days
                </span>
              </div>

              <p className="db-activity-total">
                <strong>{activity ? activity.total_hours : '—'}</strong>
                <span>
                  Hours
                  <br />
                  spent
                </span>
              </p>

              <div className="db-chart">
                {/* The rule and the bars must share one box, or their
                    percentages resolve against different heights and the rule
                    lands off the bar it is meant to touch. */}
                <div className="db-plot">
                  {/* Marks the weekly average, sitting below the tallest bar
                      as the design draws it. Known trade-off: on a lopsided
                      week — one busy day, six quiet ones — the average lands
                      near the floor, which is why this briefly marked the peak
                      instead. The dark peak bar is what identifies the best
                      day now. */}
                  {hasActivity && (
                    <span className="db-chart-mark" style={{ bottom: `${pct(avgSeconds)}%` }}>
                      <span className="db-chart-mark-chip">{readDuration(avgSeconds)}</span>
                    </span>
                  )}

                  {activityDays.map((d) => {
                    const height = pct(d.seconds)
                    return (
                      <span className="db-chart-col" key={d.date}>
                        {/* Sits just above its own bar, clamped so the peak's
                            label stays inside the plot instead of colliding
                            with the total above it. A styled readout rather
                            than `title`, which takes a second to appear and
                            cannot be positioned. */}
                        <span
                          className="db-chart-tip"
                          style={{ bottom: `calc(min(${height}%, 100% - 30px) + 6px)` }}
                        >
                          {d.label} · {readDuration(d.seconds)}
                        </span>
                        <span
                          className={
                            'db-chart-bar' + (hasActivity && d.date === peakDay?.date ? ' peak' : '')
                          }
                          style={{ height: `${height}%` }}
                        />
                        <span className="db-chart-day">{d.label}</span>
                      </span>
                    )
                  })}
                </div>
              </div>

              {!hasActivity && (
                <p className="db-activity-empty">
                  No time logged yet this week — it starts counting as you use Verbo.
                </p>
              )}
            </div>
          </section>

          {/* Directly under the chart, and the order is the point: the chart
              says how much you have done, this says what is left. */}
          <LearningPlanCard plan={planQuery.data?.plan} goals={planQuery.data?.goals} />
        </aside>
      </div>
    </div>
  )
}
