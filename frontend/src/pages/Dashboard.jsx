import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { useApiData } from '../useApiData'
import { invalidate } from '../dataCache'
import Skeleton, { SkeletonCards } from '../components/Skeleton'
import ArticleCover from '../components/ArticleCover'
import { TRENDING, byTrending } from '../trending'
import PageTools from '../components/PageTools'
import MenuDotsIcon from '../components/MenuDotsIcon'
import TutorCover from '../components/TutorCover'
import questBook from '../assets/quests/book.webp'
import questBookClosed from '../assets/quests/book-closed.webp'
import questBookmark from '../assets/quests/bookmark.webp'
import questCamera from '../assets/quests/camera.webp'
import questCheck from '../assets/quests/check.webp'
import questHeadphones from '../assets/quests/headphones.webp'
import questRefresh from '../assets/quests/refresh.webp'
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

/* Same reason as EMPTY: a stable identity for "no quest has been changed yet",
   so the memo below does not re-run on every render. */
const EMPTY_EDITS = {}

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
    /* The reading for the Chinese line, derived server-side from CC-CEDICT by
       the same service Read and Study use. Absent for a unit whose title
       carries no Han characters, and the line simply does not render. */
    pinyin: unit.title_pinyin || '',
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

function tutorLanguages(value) {
  const languages = String(value || 'Chinese (Mandarin)')
    .split(',')
    .map((language) => language.trim())
    .filter(Boolean)

  return languages.slice(1).join(', ')
}

function TutorSpecialtyRotator({ specialties }) {
  const ordered = useMemo(
    () => [...specialties].sort((a, b) => (b.key === 'speaking') - (a.key === 'speaking')),
    [specialties],
  )
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
    if (ordered.length < 2) return undefined

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % ordered.length)
    }, 4000)

    return () => window.clearInterval(timer)
  }, [ordered])

  if (!ordered.length) return null
  const specialty = ordered[activeIndex]

  return (
    <span className="db-teacher-tags">
      <span className="db-teacher-tag db-teacher-tag-rotating" key={specialty.key}>
        {specialty.label}
      </span>
    </span>
  )
}

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

/* The rating's star. Solid, in the accent — a rating is a number with a mark,
   not an outline drawing, and it is the one figure on this card that is real. */
function StarMark() {
  return (
    <svg className="db-teacher-star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z" />
    </svg>
  )
}

function VerifiedIcon() {
  return (
    <svg className="db-verified" viewBox="0 0 24 24" aria-label="Verified" role="img">
      {/* The app's accent, not a red tick: Verbo owns lavender plus one warm
          accent, and a third hue for a badge would be a colour family minted
          for one 13px mark. The reference draws it purple too. */}
      <path
        fill="#6a6191"
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
  /* THE ONLY MARK LEFT HERE IS THE CARD'S OWN — a day with a tick in it,
     beside "Daily Quest". Every quest now carries a supplied 3D drawing
     (`QUEST_ART`), so the flat glyphs they used to fall back on were deleted
     rather than left behind; this one stays drawn because it names the card
     rather than a quest, and it is the wrong thing for an illustration. */
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="m9 14.5 2 2 4-4.2" />
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

/* THE SUPPLIED 3D MARKS, one per quest, keyed by the server's own `mark` so
   the two reading quests can carry different drawings without the client
   knowing what a quest key means.

   EVERY FILE IS A 160px SQUARE AND THEY ARE MATCHED BY INK AREA, not by
   bounding box — see `scratchpad/icons/quests.js`. At a fixed box the
   headphones (wide, thin) would otherwise read far larger than the bookmark
   (tall, narrow) though both boxes measure 38. That is why the CSS needs no
   per-mark size and `object-fit` has nothing left to do. */
const QUEST_ART = {
  book: questBook,
  book_closed: questBookClosed,
  camera: questCamera,
  check: questCheck,
  headphones: questHeadphones,
  refresh: questRefresh,
  sparkle: questBookmark,
}

function QuestMark({ quest }) {
  const art = QUEST_ART[quest.mark]

  /* The flat fallback only matters if a quest is added server-side before its
     drawing exists — every mark in the catalogue has art today. */
  return (
    <span className="db-goal-mark">
      {art ? <img src={art} alt="" /> : GOAL_MARKS[quest.mark] ? <GoalMark type={quest.mark} /> : null}
    </span>
  )
}

/**
 * One quest, and the three things a learner may do with it.
 *
 * The ⋯ opens a small panel INSIDE the row rather than three buttons on it:
 * the card is ~236px wide in the rail, and the row already carries a mark, a
 * label, a bar and a count. Everything it offers is a real choice the server
 * enforces — swap within the same area, one of three targets — so nothing
 * here can invent a quest or a number.
 */
function QuestRow({ quest, onChange }) {
  const { token } = useAuth()
  const [panel, setPanel] = useState(null) // null | 'menu' | 'change' | 'target' | 'why'
  const [options, setOptions] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  /* Fetched when the panel is opened, never with the card: most days nobody
     touches a quest, and the Dashboard already fans out to eight requests. */
  async function open(next) {
    setError(null)
    setPanel(next)
    if ((next === 'change' || next === 'target') && !options) {
      try {
        setOptions(await api.getQuestOptions(token, quest.id))
      } catch (err) {
        setError(err.message)
      }
    }
  }

  async function run(work) {
    setBusy(true)
    setError(null)
    try {
      const { quest: updated } = await work()
      onChange(updated)
      setOptions(null)
      setPanel(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={quest.done ? 'db-goal done' : 'db-goal'}>
      <QuestMark quest={quest} />
      <span className="db-goal-label">{quest.label}</span>
      <button
        type="button"
        className="db-goal-more"
        aria-label={`Options for ${quest.label}`}
        aria-expanded={panel !== null}
        onClick={() => (panel ? setPanel(null) : open('menu'))}
      >
        <MenuDotsIcon />
      </button>
      {/* A track, not an animation — a width transition only advances while
          the tab composites frames, so a backgrounded tab would leave every
          bar sitting at zero.

          The count rides INSIDE the bar, as the reference draws it, which is
          what buys the room for the tick beside it. */}
      <span className="db-goal-track">
        <span className="db-goal-fill" style={{ width: `${(quest.progress / quest.target) * 100}%` }} />
        <span className={'db-goal-count' + (quest.progress / quest.target >= 0.5 ? ' db-goal-count-on-fill' : '')}>
          {quest.progress} / {quest.target}
        </span>
      </span>
      {/* Done is a real state read off the count, so the tick is a drawing and
          not a button — there is nothing to claim here (no XP in Verbo) and
          progress cannot be ticked by hand. An empty ring before that reads as
          the thing the bar is filling towards. */}
      <span className="db-goal-tick" aria-hidden="true">
        {quest.done && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        )}
      </span>

      {panel && (
        <div className="db-quest-panel">
          {panel === 'menu' && (
            <>
              <button type="button" onClick={() => open('change')} disabled={quest.changes_left === 0}>
                {quest.changes_left === 0 ? 'No changes left today' : 'Change quest'}
              </button>
              <button type="button" onClick={() => open('target')}>
                Adjust target
              </button>
              <button type="button" onClick={() => open('why')}>
                Why am I seeing this?
              </button>
            </>
          )}

          {panel === 'change' && (
            <>
              <p className="db-quest-panel-title">Choose another quest</p>
              {(options?.options || []).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className="db-quest-option"
                  disabled={busy}
                  onClick={() => run(() => api.changeQuest(token, quest.id, o.key))}
                >
                  <span className="db-quest-option-mark">
                    <GoalMark type={o.mark} />
                  </span>
                  <span>
                    <strong>{o.label}</strong>
                    <em>{o.blurb}</em>
                  </span>
                </button>
              ))}
              <p className="db-quest-panel-note">
                {quest.changes_left} change{quest.changes_left === 1 ? '' : 's'} left today
              </p>
            </>
          )}

          {panel === 'target' && (
            <>
              <p className="db-quest-panel-title">How much today?</p>
              <div className="db-quest-levels">
                {(options?.levels || []).map((l) => (
                  <button
                    key={l.level}
                    type="button"
                    className={l.level === quest.level ? 'on' : ''}
                    disabled={busy}
                    onClick={() => run(() => api.setQuestTarget(token, quest.id, l.level))}
                  >
                    {l.target}
                    <em>{l.level}</em>
                  </button>
                ))}
              </div>
            </>
          )}

          {panel === 'why' && <p className="db-quest-why">{quest.why}</p>}

          {error && <p className="db-quest-panel-error">{error}</p>}
        </div>
      )}
    </li>
  )
}

/* Section heading, with the design's optional "View all" link on the right. */
/**
 * Today's three quests.
 *
 * THE LEVEL BAND CAME OFF THIS CARD. It carried the current level, the lessons
 * left and the OPENED / WORDS / CHANGE tiles above the quests; the user struck
 * it out and asked for the reference's card instead, which is quests alone.
 * `GET /learning-plan` still returns that `plan` block — nothing renders it,
 * and it is left on the wire rather than deleted because the level and pace
 * are real and cheap, and the next card that wants them should not have to
 * rebuild the query.
 *
 * Every figure is counted server-side from rows the app already writes, so
 * there is nothing to invalidate when a word is saved or a lesson opened — the
 * next load is simply current.
 */
function LearningPlanCard({ quests, onQuestChange }) {
  // Nothing has arrived yet. No skeleton: this sits below the fold of the rail
  // and a flashing block there is more distracting than a moment of nothing.
  if (!quests) return null

  const done = quests.filter((q) => q.done).length

  return (
    <section className="db-plan">
      <div className="db-goals-head">
        {/* The reference's marked chip beside the title. Drawn rather than a
            fourth 3D file: it names the card, it is not one of the quests. */}
        <span className="db-quest-badge" aria-hidden="true">
          <GoalMark type="calendar" />
        </span>
        <div className="db-goals-heading">
          <h2 className="db-goals-title">Daily Quest</h2>
          <p className="db-goals-sub">Small steps. Big progress.</p>
        </div>
        {/* The reference puts "Claim all" here. There is nothing to claim —
            no XP in Verbo, by decision — so the slot carries the count, which
            the user asked for by name. It warms once the day is cleared. */}
        <span className={done === quests.length ? 'db-goals-count all' : 'db-goals-count'}>
          {done} / {quests.length}
        </span>
      </div>

      <ul className="db-goals-list">
        {quests.map((q) => (
          <QuestRow key={q.id} quest={q} onChange={onQuestChange} />
        ))}
      </ul>
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

  /* A quest the learner just swapped or retargeted. The server answers with
     the whole updated row, so it is folded over the fetched list rather than
     refetching the plan — one call, and the card never blanks mid-choice.
     The cache entry is dropped too, so the next visit loads the real thing
     instead of the copy this page happens to be holding. */
  const [questEdits, setQuestEdits] = useState(EMPTY_EDITS)
  const quests = useMemo(() => {
    const rows = planQuery.data?.quests
    return rows ? rows.map((q) => questEdits[q.id] || q) : null
  }, [planQuery.data, questEdits])
  const onQuestChange = useCallback((updated) => {
    setQuestEdits((prev) => ({ ...prev, [updated.id]: updated }))
    invalidate('learning-plan')
  }, [])

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
    /* NO SUGGESTIONS UNTIL HISTORY IS KNOWN. Suggestions exist to PAD a row that
       real history cannot fill, so they can only be placed once that history
       has arrived - built earlier, the padding study tile took the first slot
       on its own and was then shoved aside when the real row landed. That was
       the HSK card flashing up before the podcast you had just opened. While
       history is loading the row stays empty, which renders the skeleton. */
    if (recentQuery.loading) return { tiles, fromHistory: 0 }
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
  }, [recents, studyUnit, podcasts, levels, recentQuery.loading])

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
                      {/* THE LEVEL IS THE PILL AND THE UNIT IS PLAIN TEXT, as
                          the reference draws it: the level is what the book on
                          the left already says, so it reads as the label of
                          that cover, and the unit is the position inside it. */}
                      <span className="db-study-tags">
                        <span className="db-tag db-tag-unit">{tile.levelTag}</span>
                        <span className="db-study-unit">{tile.unitTag}</span>
                      </span>
                      <span className="db-study-title">{tile.title}</span>
                      {tile.chinese && (
                        <span className="db-study-quote">{tile.chinese}</span>
                      )}
                      {/* The reading, under the characters, exactly as Read and
                          Study print it. Only when the server derived one. */}
                      {tile.pinyin && <span className="db-study-pinyin">{tile.pinyin}</span>}
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
                      {/* A SPAN, not a button — the whole tile is already the
                          link to this unit, so the click lands on the same
                          place whether it hits the cover, the title or this.
                          A button inside an anchor is a nested interactive
                          control, the call `.du-card`'s "Start →" makes. */}
                      <span className="db-study-cta">
                        Continue
                        <ChevronRight />
                      </span>
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
                {tutors.map((t) => {
                  const alsoSpeaks = tutorLanguages(t.languages_spoken)

                  return (
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
                    <span className="db-teacher-name">
                      <span className="db-teacher-name-text">{t.user.name}</span>
                      <VerifiedIcon />
                    </span>
                    {/* The rating leads the line, as the reference draws it.
                        No reviews yet reads as "New tutor", never 0 — a zero
                        looks like a terrible score rather than an absent one,
                        and it takes the whole line because there is no figure
                        to sit beside. */}
                    <span className="db-teacher-stats">
                      {t.reviews_avg_rating != null ? (
                        <>
                          <StarMark />
                          <strong>{t.reviews_avg_rating}</strong>
                          <span className="db-teacher-dot">·</span>
                          <span className="db-teacher-lessons">
                            {PLACEHOLDER_TEACHER.lessons} lessons
                          </span>
                        </>
                      ) : (
                        <span className="db-teacher-lessons">New tutor</span>
                      )}
                    </span>
                    <span className="db-teacher-languages">
                      {alsoSpeaks && (
                        <span>
                          <em>Speaks</em>
                          <strong>{alsoSpeaks}</strong>
                        </span>
                      )}
                    </span>
                    {/* REAL, not the reference's invented tags:
                        `tutor_profiles.specialties`, resolved to their labels
                        server-side so no client keeps its own copy of the list,
                        main specialty first.

                        ONE, where the reference draws two. Measured, this card
                        is 144px wide at 1440 and a pill pair came out as
                        "Conversa…" beside "Speaki…" — two stubs say less than
                        one label a reader can actually finish. */}
                    {t.specialty_list?.length > 0 && (
                      <TutorSpecialtyRotator specialties={t.specialty_list} />
                    )}
                    {t.cheapest_lesson != null && (
                      <span className="db-teacher-price">From ${t.cheapest_lesson}</span>
                    )}
                    {/* A SPAN, not a button: the whole card is already the link
                        to this profile, and a button inside an anchor is a
                        nested interactive control — the same call the Daily Use
                        card's "Start →" makes. */}
                    {/* The label alone — the chevron came off at the user's
                        request, the same call the quiz's Back and Skip made. */}
                    <span className="db-teacher-cta">View Profile</span>
                  </Link>
                  )
                })}
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
          <LearningPlanCard quests={quests} onQuestChange={onQuestChange} />
        </aside>
      </div>
    </div>
  )
}
