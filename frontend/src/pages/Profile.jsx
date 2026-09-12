import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
/* The same artwork the Dashboard's streak badge uses. One flame in the app, so
   the mark means the same thing wherever a streak is shown. */
import FlameMark from '../components/FlameMark'
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
 * The streak, given its own block rather than a pill beside the clock.
 *
 * THIS IS THE PAGE'S SECOND FOCAL POINT AND IT IS WARM ON PURPOSE. Before, the
 * streak and "1h 8m this week" were two identical lavender pills, so the one
 * fact a learner checks daily read as interchangeable with a duration. Orange
 * is not a new colour here — it is the Dashboard's `--db-tag-level` (#fe916a),
 * and the flame mark was already orange; it is simply being used where it
 * means something.
 *
 * A broken run goes grey and says so. Colouring a zero would promise heat
 * that is not there, and "0" in a warm block reads as a bug rather than a
 * fact.
 */
function StreakBar({ days, week }) {
  const on = days > 0

  return (
    <div className={'pf-streakbar' + (on ? ' on' : '')}>
      {/* Drawn, so a broken run gets a real grey rather than a desaturated
          orange. The raster this replaced could only be filtered, which is
          why the cold state used to be `grayscale(1) opacity(0.4)`. */}
      <FlameMark className="pf-streak-mark" lit={on} />
      <span className="pf-streak-text">
        <span className="pf-streak-n">{days}</span>
        {/* Attributive: "1 day streak", "12 day streak" — never "days". */}
        <span className="pf-streak-label">{on ? 'day streak' : 'no streak yet'}</span>
      </span>
      {/* THE DOTS LIVE HERE, not under their own grey "LAST 7 DAYS" heading.
          They are the streak's evidence — the same fact drawn a second way —
          so splitting them into a separate labelled row was one more
          equal-weight band on a page that already had five. */}
      <WeekStrip days={week} />
    </div>
  )
}

/**
 * The four counts carry a MARK AND A TINT, because they are four different
 * kinds of thing and read as one kind without them.
 *
 * Every hue is already sampled elsewhere in this app rather than invented for
 * this row: lavender is the fill, #bcb3e8 the Dashboard's Unit tag, #7d76a0
 * its hero, #fe916a its level tag. A count with no glyph is a number and a
 * word; with one it is a place you have been.
 */
const COUNT_MARKS = {
  flashcards: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18" strokeLinecap="round" />
    </svg>
  ),
  units_opened: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </svg>
  ),
  podcasts_opened: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
    </svg>
  ),
  scans: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" strokeLinecap="round" />
      <path d="M7 12h10" strokeLinecap="round" />
    </svg>
  ),
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
          {/* THE HERO BAND. Everything below it is deliberately quiet.
              This card used to be five elements of identical weight stacked in
              a column — a small ring, two matching pills, a day strip and four
              grey tiles — so nothing on the page said "look here first". Now
              the ring is sized to be the focal point, the streak is a real
              second object in its own warm colour, and the week strip is the
              band's base rather than another row. */}
          <section className="pf-card pf-hero-card">
            {/* ROW ONE: the ring and what it is a ring OF. Two zones, not
                three — the rail's left column is ~384px, and a third zone on
                this row starved the middle to 59px and broke "HSK 1" across
                two lines. */}
            <div className={'pf-band' + (level ? '' : ' pf-band-empty')}>
              <ProgressRing percent={level ? level.percent : 0} />

              <div className="pf-band-mid">
                <span className="pf-band-level">{level ? level.title : 'No level yet'}</span>
                {/* Says OPENED, not completed — nothing in the app records a
                    unit as finished, so the label cannot claim more. */}
                <span className="pf-band-note">
                  {level
                    ? `${level.units_opened} of ${level.units_total} units opened`
                    : /* An empty state is an invitation to act, not a
                         statement of absence. */
                      'Open a study unit to start one'}
                </span>
                <span className="pf-band-time">
                  <ClockIcon />
                  {loading ? '—' : weekLabel} this week
                </span>
              </div>
            </div>

            {/* ROW TWO: the streak, full width and warm, with its own evidence
                beside it. */}
            <StreakBar days={streak} week={activity?.days} />
          </section>

          {/* Lifted out of the progress card and given marks. Four anonymous
              grey numbers read as one kind of thing; these are four different
              places, and the whole idea of Verbo is that words arrive from all
              of them. */}
          <div className="pf-counts">
            {COUNTS.map((c) => (
              <Link key={c.key} className={`pf-count pf-count-${c.key}`} to={c.to}>
                <span className="pf-count-mark">{COUNT_MARKS[c.key]}</span>
                <span className="pf-count-n">{loading ? '—' : (overview?.stats?.[c.key] ?? 0)}</span>
                <span className="pf-count-label">{c.label}</span>
              </Link>
            ))}
          </div>

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
