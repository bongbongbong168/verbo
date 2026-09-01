import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
/* The same artwork the Dashboard's streak badge uses. One flame in the app, so
   the mark means the same thing wherever a streak is shown. */
import iconStreak from '../assets/dashboard/icon-streak.png'
/* The supplied export, kept separate from the quiz launcher's copy of the same
   figure: that one was cropped out of a screenshot and flood-filled, this is
   the clean original with a real alpha channel. */
import heroArt from '../assets/profile/graduate.png'
import './Profile.css'

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const shortDateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

/* Real counts, each linking to the module it came from. */
const COUNTS = [
  { key: 'flashcards', label: 'Vocabulary', to: '/vocabulary' },
  { key: 'units_opened', label: 'Units', to: '/study' },
  { key: 'podcasts_opened', label: 'Episodes', to: '/podcast' },
  { key: 'scans', label: 'Scans', to: '/scan' },
]

/* Account rows. `soon` marks the one with no backend at all — payment is a
   mock that stores no methods, so it renders disabled and says so rather than
   linking somewhere that would lie. */
const ACCOUNT = [
  // Deep-linked into the right Settings section rather than dropping someone
  // at the top of the page to hunt for it — `?s=` is the section's address.
  { label: 'Personal Information', note: 'Name, picture and email', to: '/settings?s=profile' },
  { label: 'Notifications', note: 'Booking replies, messages and courses', to: '/notifications' },
  { label: 'Payment Methods', note: 'Not built yet', soon: true },
  { label: 'Privacy & Security', note: 'Password and signed-in devices', to: '/settings?s=security' },
]

/**
 * The level percentage as a ring, with the number living inside it.
 *
 * Drawn with `stroke-dasharray`, and deliberately STATIC — no transition and
 * no keyframes. An animation only advances while the tab composites frames, so
 * a ring that sweeps into place would sit empty in a backgrounded tab and
 * report 0% for a user who is at 100%. Same rule as every other stateful mark
 * in this app.
 *
 * `rotate(-90)` starts the arc at twelve o'clock; unrotated, SVG angles start
 * at three, which would make a small percentage look like it began mid-way.
 *
 * The circumference is computed, not read from `getTotalLength()`. The browser
 * approximates a circle with beziers, so its measured length differs by ~0.16%
 * (213.28 against 213.63) — about a third of a pixel of arc, invisible. Reading
 * it would mean measuring the DOM and re-rendering, which leaves the ring wrong
 * on the first paint if that pass never runs. Static beats exact here.
 */
function ProgressRing({ percent }) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0))
  const r = 34
  const circumference = 2 * Math.PI * r

  return (
    <div className="pf-ring">
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle className="pf-ring-track" cx="40" cy="40" r={r} />
        <circle
          className="pf-ring-fill"
          cx="40"
          cy="40"
          r={r}
          transform="rotate(-90 40 40)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
        />
      </svg>
      <span className="pf-ring-pct">{pct}%</span>
    </div>
  )
}

/**
 * One of the two figures beside the ring.
 *
 * The mark sits on the RIGHT, after the number it belongs to: the tiles are a
 * pair, and a left-hand icon would put a column of glyphs between the ring and
 * the numbers, which is the one place the eye needs a clear run. Written once
 * rather than twice because the card renders these in both the with-level and
 * without-level branches, and two copies is how they drift.
 */
function Metric({ value, label, icon, hot }) {
  return (
    <div className={`pf-metric${hot ? ' hot' : ''}`}>
      <span className="pf-metric-text">
        <span className="pf-metric-n">{value}</span>
        <span className="pf-metric-label">{label}</span>
      </span>
      <span className="pf-metric-mark">{icon}</span>
    </div>
  )
}

/**
 * The last seven days, one circle each — the strip from the reference.
 *
 * A day is ticked on `active`, not on `seconds > 0`. The first heartbeat of a
 * day credits nothing, so a genuine short visit stores a row worth zero
 * seconds; the streak counts that day, and if this strip did not, a "3 day
 * streak" could sit beside two ticks on the same card and read as a bug.
 *
 * Today is ringed rather than ticked until it has been earned, so the strip
 * says where you are as well as what you have done.
 */
function WeekStrip({ days }) {
  if (!days?.length) return null

  const today = days[days.length - 1]?.date

  return (
    <div className="pf-week-strip">
      <span className="pf-week-label">Last 7 days</span>
      <div className="pf-week-days">
        {days.map((d) => {
          const isToday = d.date === today
          return (
            <span
              key={d.date}
              className={
                'pf-day' + (d.active ? ' on' : '') + (isToday ? ' today' : '')
              }
              /* The strip is decorative shorthand for the sentence below it,
                 so each circle carries its own day and state in the title
                 rather than leaving a row of bare letters. */
              title={`${d.label}${d.active ? ' — active' : ' — no activity'}`}
            >
              {d.active ? (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                /* First letter only — the circles are 28px and a three-letter
                   label would not fit without shrinking the type past reading
                   size. The full day name is in the title. */
                d.label.charAt(0)
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
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
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

export default function Profile() {
  const { user, token } = useAuth()
  const [overview, setOverview] = useState(null)
  const [activity, setActivity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getUserOverview(token),
      // The streak and the week's hours already have an endpoint — no reason
      // for this page to grow a second copy of that logic.
      api.getActivitySummary(token, 7).catch(() => null),
    ])
      .then(([overviewData, activityData]) => {
        setOverview(overviewData)
        setActivity(activityData)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const initial = (user?.name || '?').trim().charAt(0).toUpperCase()
  const streak = activity?.streak?.current ?? 0
  const weekSeconds = (activity?.days || []).reduce((sum, d) => sum + d.seconds, 0)
  const level = overview?.level
  const tutors = overview?.tutors || []
  const courses = overview?.courses || []

  /* "4h 20m" reads better than "4.33 hours"; below an hour drop to minutes,
     because "0.03 hours" says nothing on a real first week. */
  const weekLabel = (() => {
    if (weekSeconds <= 0) return 'No time yet'
    if (weekSeconds < 3600) return `${Math.max(1, Math.round(weekSeconds / 60))}m`
    const h = Math.floor(weekSeconds / 3600)
    const m = Math.round((weekSeconds % 3600) / 60)
    return m ? `${h}h ${m}m` : `${h}h`
  })()

  return (
    <div className="pf">
      <h1 className="pf-title">Profile</h1>

      {error && <p className="pf-error">{error}</p>}

      <header className="pf-hero">
        {/* The graduation art already used by the quiz launcher. Decorative, so
            `alt=""` and pointer-events off — it must never sit between a click
            and the Edit link beneath it. */}
        <img className="pf-hero-art" src={heroArt} alt="" aria-hidden="true" />
        {/* The picture is also the affordance for changing it — clicking your
            own face is where people look first. Editing itself stays in
            Settings, so name and photo have one home between them. */}
        <Link className="pf-avatar-link" to="/settings?s=profile" title="Change profile picture">
          {user?.avatar_url ? (
            <img className="pf-avatar" src={user.avatar_url} alt="" />
          ) : (
            <span className="pf-avatar">{initial}</span>
          )}
          <span className="pf-avatar-edit">Change</span>
        </Link>

        <div className="pf-ident">
          {/* "Edit" sits beside the name, as in the reference, rather than as a
              large button on the far right. It edits the identity next to it,
              and against the banner a solid block competed with the name for
              the one thing the eye should land on first. */}
          <h2 className="pf-name">
            {user?.name}
            <Link className="pf-edit" to="/settings?s=profile">
              Edit
            </Link>
          </h2>
          {/* Derived from the last unit opened — see ProfileController. */}
          <p className="pf-sub">
            {level ? level.title : user?.email}
            {overview?.is_admin && <span className="pf-admin">Admin</span>}
          </p>
          {overview?.member_since && (
            <p className="pf-joined">
              Member since {dateFmt.format(new Date(overview.member_since))}
            </p>
          )}
        </div>

      </header>

      <div className="pf-body">
        <div className="pf-col">
          {/* ---- Learning Progress ---- */}
          <section className="pf-card">
            <h3 className="pf-card-title">Learning Progress</h3>

            {level ? (
              /* The ring replaced a full-width bar. A bar spends the card's
                 whole width saying one number and leaves the level name to
                 float beside it; the ring holds the number inside itself and
                 frees that width for the facts that belong next to it. */
              <div className="pf-prog">
                <ProgressRing percent={level.percent} />
                <div className="pf-prog-facts">
                  <span className="pf-prog-level">{level.title}</span>
                  {/* Says OPENED, not completed — nothing in the app records a
                      unit as finished, so the label cannot claim more. */}
                  <span className="pf-prog-note">
                    {level.units_opened} of {level.units_total} units opened
                  </span>
                  <div className="pf-metrics">
                    <Metric
                      value={loading ? '—' : weekLabel}
                      label="this week"
                      icon={<ClockIcon />}
                    />
                    {/* Attributive: "1 day streak", "12 day streak". */}
                    <Metric
                      value={streak}
                      label="day streak"
                      hot={streak > 0}
                      icon={<img src={iconStreak} alt="" />}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="pf-empty">
                  Open a study unit and your progress through that level shows up here.
                </p>
                {/* The two metrics are true with or without a level, so they
                    stay put rather than disappearing with the ring. */}
                <div className="pf-metrics pf-metrics-wide">
                  <Metric
                    value={loading ? '—' : weekLabel}
                    label="this week"
                    icon={<ClockIcon />}
                  />
                  <Metric
                    value={streak}
                    label="day streak"
                    hot={streak > 0}
                    icon={<img src={iconStreak} alt="" />}
                  />
                </div>
              </>
            )}

            <WeekStrip days={activity?.days} />

            <div className="pf-counts">
              {COUNTS.map((c) => (
                <Link key={c.key} className="pf-count" to={c.to}>
                  <span className="pf-count-n">{loading ? '—' : (overview?.stats?.[c.key] ?? 0)}</span>
                  <span className="pf-count-label">{c.label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* ---- My Tutors ---- */}
          <section className="pf-card">
            <div className="pf-card-head">
              <h3 className="pf-card-title">My Tutors</h3>
              <Link className="pf-more" to="/find-tutor">
                Find a tutor
                <ChevronIcon />
              </Link>
            </div>

            {tutors.length === 0 ? (
              <p className="pf-empty">
                Tutors you book appear here. Cancelled trials do not count.
              </p>
            ) : (
              <ul className="pf-list">
                {tutors.map((t) => (
                  <li key={t.id}>
                    <Link className="pf-row" to={t.profile_id ? `/find-tutor/${t.profile_id}` : '#'}>
                      {t.photo_url ? (
                        <img className="pf-face" src={t.photo_url} alt="" />
                      ) : (
                        <span className="pf-face pf-face-initial">
                          {(t.name || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="pf-row-body">
                        <span className="pf-row-name">{t.name}</span>
                        {t.subjects && <span className="pf-row-note">{t.subjects}</span>}
                      </span>
                      <ChevronIcon />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- My Courses ---- */}
          <section className="pf-card">
            <div className="pf-card-head">
              <h3 className="pf-card-title">My Courses</h3>
              <Link className="pf-more" to="/find-tutor">
                Browse courses
                <ChevronIcon />
              </Link>
            </div>

            {courses.length === 0 ? (
              <p className="pf-empty">Group courses you enrol in appear here.</p>
            ) : (
              <ul className="pf-list">
                {courses.map((c) => (
                  <li key={c.id}>
                    <Link className="pf-row" to={`/courses/${c.id}`}>
                      <span className="pf-row-body">
                        <span className="pf-row-name">{c.title}</span>
                        <span className="pf-row-note">
                          {/* Week 0 means the run has not started, which is a
                              different thing from "week 1 of 8". */}
                          {c.week === 0 && c.starts_on
                            ? `Starts ${shortDateFmt.format(new Date(c.starts_on))} · ${c.weeks} weeks`
                            : c.week
                              ? `Week ${c.week} / ${c.weeks}`
                              : `${c.weeks} weeks`}
                        </span>
                      </span>
                      {c.week > 0 && (
                        <span className="pf-week">
                          <span
                            className="pf-week-fill"
                            style={{ width: `${Math.round((c.week / c.weeks) * 100)}%` }}
                          />
                        </span>
                      )}
                      <ChevronIcon />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ---- Account ---- */}
        <aside className="pf-rail">
          <section className="pf-card">
            <h3 className="pf-card-title">Account</h3>
            <ul className="pf-list pf-list-plain">
              {ACCOUNT.map((a) =>
                a.soon ? (
                  <li key={a.label}>
                    <div className="pf-row pf-row-off" aria-disabled="true">
                      <span className="pf-row-body">
                        <span className="pf-row-name">{a.label}</span>
                        <span className="pf-row-note">{a.note}</span>
                      </span>
                      <span className="pf-soon">Soon</span>
                    </div>
                  </li>
                ) : (
                  <li key={a.label}>
                    <Link className="pf-row" to={a.to}>
                      <span className="pf-row-body">
                        <span className="pf-row-name">{a.label}</span>
                        <span className="pf-row-note">{a.note}</span>
                      </span>
                      <ChevronIcon />
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </section>

          {/* Only for accounts that actually teach. */}
          {overview?.tutor_profile_id && (
            <section className="pf-card">
              <h3 className="pf-card-title">Teaching</h3>
              <p className="pf-empty pf-empty-tight">
                Your lessons, weekly hours and courses are edited on your tutor profile.
              </p>
              <Link className="pf-more" to={`/find-tutor/${overview.tutor_profile_id}`}>
                Open tutor profile
                <ChevronIcon />
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
