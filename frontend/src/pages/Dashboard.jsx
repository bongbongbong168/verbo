import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import heroSwoosh from '../assets/dashboard/hero-swoosh-final.png'
import iconBell from '../assets/dashboard/icon-bell.png'
import iconProfile from '../assets/dashboard/icon-profile.png'
import './Dashboard.css'

/* The design's Top Reads filter is four content categories that do not exist in
   the data. `articles.type` is the real dimension, so the pills are built from
   it — plus an All that is selected by default. */
const HAN = /[一-鿿]/

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
     - there is no schedule/course-enrolment table at all
   (The activity chart used to be here too; it is real data now — see
   ActivityController and useActivityHeartbeat.)
   --------------------------------------------------------------------------- */
const PLACEHOLDER_PODCAST = { duration: '8mins', author: 'Chen Mingyue', language: 'Chinese｜Mandarin' }
const PLACEHOLDER_TEACHER = { lessons: '275', rating: '4.9' }
const PLACEHOLDER_COURSE = { title: 'Chinese for Tech Professional', time: '7:00pm - 8:00pm' }

function ArrowRightIcon() {
  return (
    <svg className="db-btn-cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <path d="M7.6 12.1 10.5 15 16.4 9.1" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4z" />
      <path d="M6 10.5V16c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5.5" />
    </svg>
  )
}

function LangIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

export default function Dashboard() {
  const { token, user } = useAuth()
  const [quote, setQuote] = useState(null)
  const [tutors, setTutors] = useState([])
  const [articles, setArticles] = useState([])
  const [podcasts, setPodcasts] = useState([])
  const [studyUnit, setStudyUnit] = useState(null)
  const [progress, setProgress] = useState(null)
  const [activity, setActivity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [readFilter, setReadFilter] = useState('all')

  const [editingQuote, setEditingQuote] = useState(false)
  const [quoteChinese, setQuoteChinese] = useState('')
  const [quotePinyin, setQuotePinyin] = useState('')
  const [quoteEnglish, setQuoteEnglish] = useState('')
  const [savingQuote, setSavingQuote] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [token])

  function loadDashboard() {
    setLoading(true)
    Promise.all([
      api.getQuote(token),
      api.getTutors(token),
      api.getArticles(token),
      api.getPodcasts(token),
      api.getStudyLevels(token),
      // Resolves to null until the user has actually opened a unit.
      api.getStudyProgress(token).catch(() => null),
      api.getActivitySummary(token, 7).catch(() => null),
    ])
      .then(([quoteData, tutorData, articleData, podcastData, levelData, progressData, activityData]) => {
        setQuote(quoteData)
        setQuoteChinese(quoteData?.chinese || '')
        setQuotePinyin(quoteData?.pinyin || '')
        setQuoteEnglish(quoteData?.english || '')
        setTutors(tutorData.slice(0, 3))
        setArticles(articleData)
        setPodcasts(podcastData)
        setProgress(progressData || null)
        setActivity(activityData || null)

        // With real progress there is nothing to guess at, so skip the extra
        // level lookup entirely.
        if (progressData) return

        // GET /study-levels returns levels without their units, so the study
        // tile needs the detail call to reach unit 1. Chained rather than
        // parallel because which level to open is only known once the list
        // arrives; a failure here leaves the tile out, not the whole page.
        //
        // Feature the level with the most units rather than whichever sorts
        // first — with no progress tracking, "the course with the most content
        // authored" is the closest honest stand-in for the one being worked
        // through, and it keeps empty levels out of the tile. `reduce` keeps
        // the natural sort order as the tie-break, since it only replaces on a
        // strictly greater count.
        const featured = levelData.reduce(
          (best, l) => ((l.units_count ?? 0) > (best?.units_count ?? 0) ? l : best),
          levelData[0]
        )
        if (featured) {
          return api
            .getStudyLevel(token, featured.id)
            .then((full) => setStudyUnit(full.units?.[0] ? { level: full, unit: full.units[0] } : null))
            .catch(() => setStudyUnit(null))
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleSaveQuote(e) {
    e.preventDefault()
    setError(null)
    setSavingQuote(true)
    try {
      const updated = await api.saveQuote(token, {
        chinese: quoteChinese,
        pinyin: quotePinyin,
        english: quoteEnglish,
      })
      setQuote(updated)
      setEditingQuote(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingQuote(false)
    }
  }

  /* The design's first "pick up" tile is a study *unit*: the level's book
     cover, a unit tag and a level tag, the unit's English title and its Chinese
     line. Unit titles are authored as "中文 - English", so the two halves are
     split off one field rather than needing separate columns — `description`
     wins for the English half when it is filled in. Nothing records progress,
     so this is unit 1 of the first level; the tile shape is the point. */
  const studyCard = useMemo(() => {
    // Real resume state when the user has opened a unit; otherwise fall back to
    // featuring unit 1 of the most-populated level, so the tile is never empty
    // for someone who has not started yet.
    const { level, unit } = progress
      ? { level: progress.level, unit: progress.unit }
      : studyUnit || {}
    if (!level || !unit) return null
    const raw = unit.title || ''
    // Split on the FIRST dash with optional surrounding space — the titles are
    // authored inconsistently ("接你们 - We will" but also "接你- We will"), so
    // requiring a leading space silently fails on half of them. Only treated as
    // a split when the left half actually holds Han characters, so an English
    // title containing a hyphen is left alone.
    const parts = raw.match(/^(.*?)\s*[-–—]\s*(.+)$/)
    const isSplit = Boolean(parts) && HAN.test(parts[1])
    const chinese = isSplit ? parts[1].trim() : HAN.test(raw) ? raw : ''
    const english = isSplit ? parts[2].trim() : ''

    return {
      to: `/study/units/${unit.id}`,
      cover: level.image_url,
      unitTag: `Unit ${unit.position ?? (level.units || []).findIndex((u) => u.id === unit.id) + 1}`,
      levelTag: level.title,
      title: unit.description || english || raw,
      chinese,
    }
  }, [progress, studyUnit])

  const visibleReads = useMemo(
    () =>
      articles.filter((a) => readFilter === 'all' || a.type === readFilter).slice(0, 3),
    [articles, readFilter]
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
    return `${Math.max(1, Math.round(seconds / 60))} min`
  }

  if (loading) return <p className="db-empty">Loading...</p>

  return (
    <div className="db">
      <div className="db-topbar">
        <button type="button" className="db-icon-btn" aria-label="Notifications">
          <img src={iconBell} alt="" />
        </button>
        <button type="button" className="db-icon-btn" aria-label="Profile">
          <img src={iconProfile} alt="" />
        </button>
      </div>

      {error && <p className="db-error">{error}</p>}

      <div className="db-hero">
        <img className="db-hero-swoosh" src={heroSwoosh} alt="" />
        <span
          className={'db-streak-badge' + (streak > 0 ? '' : ' idle')}
          title={
            streak > 0
              ? `Longest streak: ${longestStreak} ${longestStreak === 1 ? 'day' : 'days'}`
              : 'Open Verbo on consecutive days to build a streak'
          }
        >
          {/* Emoji rather than an inline SVG: it renders in the platform's own
              colour font, so it stays sharp at any zoom and needs no palette of
              its own. aria-hidden because the adjacent text already says it. */}
          <span className="db-streak-flame" role="img" aria-hidden="true">
            🔥
          </span>
          {/* "5 day streak", not "5 days streak" — attributive, and it is how
              the design words it. */}
          {streak > 0 ? `${streak} day streak` : 'No streak yet'}
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
                <button type="button" className="db-btn-ghost" onClick={() => setEditingQuote(false)}>
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
              <button type="button" className="db-quote-edit-toggle" onClick={() => setEditingQuote(true)}>
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
            <SectionHead title="Pick up where you left off" />
            <div className="db-pickup">
              {studyCard && (
                <Link className="db-study" to={studyCard.to}>
                  <span className="db-study-cover">
                    {studyCard.cover && <img src={studyCard.cover} alt="" />}
                  </span>
                  <span className="db-study-body">
                    <span className="db-study-tags">
                      <span className="db-tag db-tag-unit">{studyCard.unitTag}</span>
                      <span className="db-tag db-tag-level">{studyCard.levelTag}</span>
                    </span>
                    <span className="db-study-title">{studyCard.title}</span>
                    <span className="db-study-rule" />
                    {studyCard.chinese && (
                      <span className="db-study-quote">&ldquo;{studyCard.chinese}&rdquo;</span>
                    )}
                  </span>
                </Link>
              )}
              {/* Two, not three: with the study tile that fills the row exactly,
                  which is what the design shows. */}
              {podcasts.slice(0, 2).map((p) => (
                <PodcastCard key={p.id} podcast={p} />
              ))}
              {!studyCard && podcasts.length === 0 && (
                <p className="db-empty">Nothing to pick up yet.</p>
              )}
            </div>
          </section>

          {/* ---- Recommend Teachers ---- */}
          <section className="db-section">
            <SectionHead title="Recommend Teachers" to="/find-tutor" />
            {tutors.length === 0 ? (
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
                      <StarIcon /> {PLACEHOLDER_TEACHER.rating} Rating
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ---- Podcasts ---- */}
          <section className="db-section">
            <SectionHead title="Podcasts" to="/podcast" />
            {podcasts.length === 0 ? (
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
              {visibleReads.length === 0 ? (
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
            <SectionHead title="My Course" />
            <div className="db-course" title="Course scheduling is not built yet">
              <span className="db-course-thumb" />
              <span className="db-course-body">
                <span className="db-course-title">{PLACEHOLDER_COURSE.title}</span>
                <span className="db-course-time">{PLACEHOLDER_COURSE.time}</span>
              </span>
              <ChevronRight />
            </div>
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
                  {/* Marks the best day, sitting on top of that bar and
                      labelled with its time. It used to mark the average,
                      which on a real week — one busy day, six quiet ones —
                      put it near the floor and read as a broken chart. */}
                  {hasActivity && (
                    <span className="db-chart-mark" style={{ bottom: `${pct(maxSeconds)}%` }}>
                      <span className="db-chart-mark-chip">{readDuration(maxSeconds)}</span>
                    </span>
                  )}

                  {activityDays.map((d) => (
                    <span className="db-chart-col" key={d.date}>
                      <span
                        className={
                          'db-chart-bar' + (hasActivity && d.date === peakDay?.date ? ' peak' : '')
                        }
                        style={{ height: `${pct(d.seconds)}%` }}
                        title={`${readDuration(d.seconds)} on ${d.date}`}
                      />
                      <span className="db-chart-day">{d.label}</span>
                    </span>
                  ))}
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
