import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { useApiData } from '../useApiData'
import Skeleton, { SkeletonCards } from '../components/Skeleton'
import ArticleCover from '../components/ArticleCover'
import PageTools from '../components/PageTools'
import heroSwoosh from '../assets/dashboard/hero-swoosh-final.png'
import heroHanzi from '../assets/dashboard/hero-hanzi.png'
import iconStreak from '../assets/dashboard/icon-streak.png'
import './Dashboard.css'

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

const READ_FILTERS = [
  { key: 'all', label: 'All' },
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

function ArrowRightIcon() {
  return (
    <svg
      className="db-btn-cta-arrow"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
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
      <path d="M8.73 6.5v11c0 .8.9 1.3 1.6.9l8.2-5.5c.6-.4.6-1.4 0-1.8L10.33 5.6c-.7-.4-1.6.1-1.6.9z" />
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

function CapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4z" />
      <path d="M6 10.5V16c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5.5" />
    </svg>
  )
}

function LangIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h9M7.5 4v2M10 6c0 4-3.5 7-7 7" />
      <path d="M6 10.5c1.5 2 3.5 3.2 5.5 3.7" />
      <path d="m13 20 4-9 4 9M14.4 17h5.2" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#f5b301" aria-hidden="true">
      <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  )
}

/* Section heading, with the design's optional "View all" link on the right. */
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

  const visibleReads = useMemo(
    () => articles.filter((a) => readFilter === 'all' || a.type === readFilter).slice(0, 3),
    [articles, readFilter],
  )

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
          {/* The supplied artwork, not the 🔥 emoji it replaced — that rendered
              as a different picture on every OS, so the badge could not be
              designed around it, and its ink sat off-centre in its line box and
              needed a measured nudge to look level. A 512px source for a 15px
              mark, so it stays sharp at any zoom or pixel ratio. */}
          <img className="db-streak-flame" src={iconStreak} alt="" />
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
              <ArrowRightIcon />
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
            <div className="db-pickup">
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
            </div>
          </section>

          {/* ---- Recommend Teachers ---- */}
          <section className="db-section">
            <SectionHead title="Recommend Teachers" to="/find-tutor" />
            {tutorQuery.loading ? (
              <SkeletonCards className="db-grid3" count={3} mediaHeight={96} />
            ) : tutors.length === 0 ? (
              <p className="db-empty">No tutors yet.</p>
            ) : (
              <div className="db-grid3">
                {tutors.map((t) => (
                  <Link className="db-teacher" key={t.id} to={`/find-tutor/${t.id}`}>
                    <span className="db-teacher-cover">
                      {t.photo_url && <img src={t.photo_url} alt="" />}
                    </span>
                    <span className="db-teacher-head">
                      <span className="db-teacher-avatar">
                        {t.photo_url ? (
                          <img src={t.photo_url} alt="" />
                        ) : (
                          t.user.name.charAt(0).toUpperCase()
                        )}
                      </span>
                      <span className="db-teacher-name">{t.user.name}</span>
                      <VerifiedIcon />
                    </span>
                    <span className="db-teacher-meta">
                      <CapIcon /> {PLACEHOLDER_TEACHER.lessons} Lesson
                    </span>
                    <span className="db-teacher-meta">
                      <LangIcon /> {t.languages_spoken || 'Chinese (Mandarin)'}
                    </span>
                    <span className="db-teacher-meta">
                      {/* No reviews yet reads as "New", not 0 — a zero looks
                          like a terrible score rather than an absent one. */}
                      <StarIcon />{' '}
                      {t.reviews_avg_rating != null
                        ? `${t.reviews_avg_rating} Rating`
                        : 'New tutor'}
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
              <SkeletonCards className="db-grid3" count={3} mediaHeight={96} />
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

            <div className="db-reads">
              {articleQuery.loading ? (
                <>
                  <Skeleton style={{ height: 74 }} />
                  <Skeleton style={{ height: 74 }} />
                  <Skeleton style={{ height: 74 }} />
                </>
              ) : visibleReads.length === 0 ? (
                <p className="db-empty">No reads match that filter.</p>
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
        </aside>
      </div>
    </div>
  )
}
