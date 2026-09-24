import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import PageTools from '../components/PageTools'
import './Bookings.css'
import ConfirmDialog from '../components/ConfirmDialog'

/* Tabs are STATES, not directions — "where does this booking stand" is the
   question someone opens this page with. The order flips by role because the
   first thing each side needs is different: a student checks what is confirmed,
   a tutor checks what is waiting on them. */
const TABS = {
  student: ['upcoming', 'requests', 'past'],
  teacher: ['requests', 'upcoming', 'past'],
}

const TAB_LABELS = { upcoming: 'Upcoming', requests: 'Requests', past: 'Past' }

/* One status vocabulary for the whole page. `completed` is derived rather than
   stored — a confirmed lesson whose time has passed is finished, and deriving
   it means no job has to sweep the table to keep it true. */
const STATUS = {
  pending: { label: 'Pending', tone: 'wait' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  declined: { label: 'Declined', tone: 'no' },
  completed: { label: 'Completed', tone: 'done' },
  cancelled: { label: 'Cancelled', tone: 'off' },
  expired: { label: 'Expired', tone: 'off' },
}

const DECLINE_REASONS = ['I’m unavailable', 'That time doesn’t work', 'Other']

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const dayFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function describeDays(days = []) {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d])
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/** End of a lesson, so "upcoming" survives while it is actually running. */
function endsAt(booking) {
  if (!booking?.starts_at) return null
  return new Date(booking.starts_at).getTime() + (booking.duration_minutes || 0) * 60000
}

/**
 * The one place a raw row becomes a status.
 *
 * `held` and `pending` are both "the tutor has not answered yet" — the first is
 * the scheduled shape, the second predates scheduling — so they collapse into
 * one word the student can act on.
 */
function statusOf(booking) {
  const s = booking.status
  if (s === 'held' || s === 'pending') {
    const lapsed =
      booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() <= Date.now()
    /* A paid request has no hold any more (paying clears it), so it used to
       wait for the tutor forever: a Sep 1 lesson still read "Waiting for Xu
       Jiayin to confirm" on Sep 19. Once the lesson's start has passed it
       can never be confirmed, so it is expired. */
    const tooLate = booking.starts_at && new Date(booking.starts_at).getTime() <= Date.now()
    return lapsed || tooLate ? 'expired' : 'pending'
  }
  if (s === 'confirmed') {
    const end = endsAt(booking)
    return end && end < Date.now() ? 'completed' : 'confirmed'
  }
  return s
}

function CalendarIcon() {
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
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  )
}

/* On the same 24 grid as the rest of the page's marks. Drawn at 1.7 so it
   holds up beside 0.9rem text at the small size a pill allows. */
function TrashIcon() {
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
      <path d="M4 6.5h16M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10.5 10v6.5M13.5 10v6.5" />
    </svg>
  )
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  )
}

/* The dot used to be a colour emoji per status (🟡🟢🔴⚪⚫), which carried its
   OWN colour and so disagreed with the chip around it — a yellow emoji inside
   an amber chip. It is a CSS circle painted with `currentColor` now, so the
   dot is always exactly the tone the chip already sets. One source of truth,
   and one less thing that can drift. */
function StatusChip({ status }) {
  const meta = STATUS[status] || { label: status, tone: 'off' }
  return (
    <span className={`bo-chip bo-chip-${meta.tone}`}>
      <span className="bo-chip-dot" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

export default function Bookings() {
  const { token } = useAuth()

  const [bookings, setBookings] = useState({ sent: [], received: [] })
  const [enrollments, setEnrollments] = useState([])
  const [isTutor, setIsTutor] = useState(false)
  const [role, setRole] = useState('student')
  const [tab, setTab] = useState('upcoming')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [declining, setDeclining] = useState(null)
  const [reason, setReason] = useState(DECLINE_REASONS[0])
  /* Whether the "Clear past bookings?" confirm popup is open. */
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    load()
  }, [token])

  function load() {
    setLoading(true)
    Promise.all([
      api.getBookings(token),
      api.getMyEnrollments(token),
      // Having a tutor profile is what makes the teacher view meaningful; an
      // account with none never sees the switch at all.
      api.getMyTutorProfile(token).catch(() => null),
    ])
      .then(([b, e, mine]) => {
        setBookings(b)
        setEnrollments(e)
        /* `mine.profile`, not `mine` — the endpoint returns {profile, options}
           and the object is always truthy, so testing it directly would show
           the teacher switch to every account in the app.
           APPROVED specifically: someone whose application is still pending is
           not a tutor yet, and a teacher view with nothing in it is worse than
           no switch at all. */
        setIsTutor(mine?.profile?.status === 'approved')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /* Clearing opens a confirm popup rather than arming the button for a
     second click — the usual pattern, and the one that says what happens. */
  async function clearPast() {
    setError(null)
    setClearing(true)
    try {
      await api.clearPastBookings(token, role)
      setConfirmClear(false)
      load()
    } catch (err) {
      setConfirmClear(false)
      setError(err.message)
    } finally {
      setClearing(false)
    }
  }

  async function act(row, what) {
    setError(null)
    setBusyId(row.uid)
    try {
      if (row.type === 'course') {
        if (what === 'confirm') await api.confirmEnrollment(token, row.raw.id)
        else await api.cancelEnrollment(token, row.raw.id)
      } else if (what === 'confirm') {
        await api.confirmBooking(token, row.raw.id)
      } else if (what === 'decline') {
        await api.declineBooking(token, row.raw.id, reason)
      } else if (what === 'hide') {
        if (row.type === 'course') await api.hideEnrollment(token, row.raw.id)
        else await api.hideBooking(token, row.raw.id)
      } else {
        await api.cancelBooking(token, row.raw.id)
      }
      setDeclining(null)
      load()
    } catch (err) {
      setError(err.message)
      load()
    } finally {
      setBusyId(null)
    }
  }

  /* Everything becomes one row shape first, so the tab logic below does not
     have to know whether it is looking at a lesson or a course enrolment. */
  const rows = useMemo(() => {
    if (role === 'teacher') {
      return (bookings.received || []).map((b) => ({
        uid: `r-${b.id}`,
        type: 'lesson',
        raw: b,
        status: statusOf(b),
        who: b.student?.name || 'Student',
        title: b.lesson?.name || 'Private lesson',
        price: b.lesson?.price,
        minutes: b.duration_minutes,
        at: b.starts_at,
        note: b.message,
        cancelledBy: b.cancelled_by,
        reason: b.decline_reason,
        sortKey: b.starts_at,
      }))
    }

    const lessons = (bookings.sent || []).map((b) => ({
      uid: `s-${b.id}`,
      type: 'lesson',
      raw: b,
      status: statusOf(b),
      who: b.tutor?.name || 'Tutor',
      title: b.lesson?.name || 'Private lesson',
      price: b.lesson?.price,
      minutes: b.duration_minutes,
      at: b.starts_at,
      declineReason: b.decline_reason,
      cancelledBy: b.cancelled_by,
      reason: b.decline_reason,
      sortKey: b.starts_at,
    }))

    /* Group courses never enter the request flow — the tutor published the
       schedule, so enrolment is immediate. They only ever appear as Upcoming
       or Past. */
    const courses = (enrollments || []).map((e) => ({
      uid: `c-${e.id}`,
      type: 'course',
      raw: e,
      status: statusOf({ ...e, starts_at: null }),
      who: e.course?.tutor_profile?.user?.name || 'Tutor',
      title: e.course?.title || 'Group course',
      price: e.course?.price,
      course: e.course,
      sortKey: e.course?.starts_on,
      endsOn: e.course?.ends_on,
    }))

    return [...lessons, ...courses]
  }, [role, bookings, enrollments])

  const buckets = useMemo(() => {
    const now = Date.now()
    const out = { upcoming: [], requests: [], past: [] }

    for (const row of rows) {
      if (row.status === 'pending') out.requests.push(row)
      else if (row.status === 'confirmed') {
        // A course stays upcoming until its LAST class, not its first.
        const stillAhead =
          row.type === 'course'
            ? !row.endsOn || new Date(row.endsOn).getTime() > now
            : !row.at || (endsAt(row.raw) ?? 0) > now
        ;(stillAhead ? out.upcoming : out.past).push(row)
      } else out.past.push(row)
    }

    const by = (a, b) => new Date(a.sortKey || 0) - new Date(b.sortKey || 0)
    out.upcoming.sort(by)
    out.requests.sort(by)
    out.past.sort((a, b) => by(b, a))
    return out
  }, [rows])

  const tabs = TABS[role]

  /* Switching role lands on that role's FIRST tab, not wherever you happened to
     be. The order flips precisely because each side opens this page with a
     different question — a tutor wants the requests waiting on them — so
     keeping the old tab would throw away the whole point of reordering. */
  function switchRole(next) {
    setRole(next)
    setTab(TABS[next][0])
    setArmedClear(false)
  }

  function renderRow(row) {
    const busy = busyId === row.uid
    const isCourse = row.type === 'course'
    const pending = row.status === 'pending'
    const confirmed = row.status === 'confirmed'

    return (
      <li className="bo-row" key={row.uid}>
        <span className="bo-avatar">{(row.who || '?').charAt(0).toUpperCase()}</span>

        <div className="bo-main">
          <p className="bo-who">
            {row.who}
            <em className="bo-kind">{isCourse ? 'Group course' : 'Private lesson'}</em>
          </p>
          <p className="bo-title">{row.title}</p>

          <p className="bo-when">
            <CalendarIcon />
            {isCourse
              ? `${describeDays(row.course?.days_of_week)} · ${shortFmt.format(
                  new Date(row.course?.starts_on),
                )} – ${shortFmt.format(new Date(row.course?.ends_on))}`
              : row.at
                ? dayFmt.format(new Date(row.at))
                : 'No time set — sent before scheduling existed'}
          </p>

          {!isCourse && row.at && (
            <p className="bo-when">
              <ClockIcon />
              {clockFmt.format(new Date(row.at))}
              {row.minutes ? ` – ${clockFmt.format(new Date(endsAt(row.raw)))}` : ''}
              {row.minutes ? ` · ${row.minutes} min` : ''}
              {row.price != null ? ` · $${row.price}` : ''}
            </p>
          )}

          {/* The student's note is the whole reason a tutor can judge a
              request, so it is shown in full rather than truncated. */}
          {row.note && <p className="bo-note">“{row.note}”</p>}

          {/* Wording differs by role: the student is waiting on someone, the
              tutor is the someone. */}
          {pending && role === 'student' && !isCourse && (
            <p className="bo-hint">Waiting for {row.who} to confirm your lesson.</p>
          )}
          {/* Why it expired - two different stories. A PAID request the
              tutor never answered before the lesson time, or a time that was
              held for payment and never paid. */}
          {row.status === 'expired' && !isCourse && row.raw.status === 'pending' && (
            <p className="bo-hint">
              {role === 'student'
                ? `${row.who} didn't confirm before the lesson time.`
                : 'You didn’t answer this request before the lesson time.'}
            </p>
          )}
          {row.status === 'expired' && !isCourse && row.raw.status === 'held' && (
            <p className="bo-hint">
              {role === 'student'
                ? 'Payment wasn’t finished, so the time was released.'
                : 'The student didn’t finish booking, so the time was released.'}
            </p>
          )}
          {/* "Cancelled" alone is ambiguous — the student needs to know whether
              they called it off or the tutor did. */}
          {row.status === 'cancelled' && row.cancelledBy && (
            <p
              className={`bo-hint${row.cancelledBy === 'tutor' && role === 'student' ? ' bo-hint-no' : ''}`}
            >
              {row.cancelledBy === 'tutor'
                ? role === 'student'
                  ? `${row.who} cancelled this lesson.`
                  : 'You cancelled this lesson.'
                : role === 'student'
                  ? 'You cancelled this lesson.'
                  : `${row.who} cancelled this lesson.`}
              {row.reason ? ` ${row.reason}` : ''}
            </p>
          )}
          {row.status === 'declined' && (
            <p className="bo-hint bo-hint-no">
              {row.declineReason
                ? `${row.who} declined: ${row.declineReason}`
                : `${row.who} isn’t available at this time.`}
            </p>
          )}
        </div>

        <div className="bo-side">
          <StatusChip status={row.status} />

          <div className="bo-actions">
            {role === 'teacher' && pending && (
              <>
                <button
                  type="button"
                  className="bo-btn bo-btn-primary"
                  onClick={() => act(row, 'confirm')}
                  disabled={busy}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="bo-btn"
                  onClick={() => setDeclining(row)}
                  disabled={busy}
                >
                  Decline
                </button>
              </>
            )}

            {role === 'student' && pending && (
              <button
                type="button"
                className="bo-btn"
                onClick={() => act(row, 'cancel')}
                disabled={busy}
              >
                Cancel request
              </button>
            )}

            {confirmed && (
              <button
                type="button"
                className="bo-btn"
                onClick={() => act(row, 'cancel')}
                disabled={busy}
              >
                Cancel
              </button>
            )}

            {/* Another time only helps where the lesson did not happen. */}
            {row.status === 'declined' && role === 'student' && (
              <Link to="/find-tutor" className="bo-btn">
                Find another time
              </Link>
            )}
            {row.status === 'completed' && role === 'student' && !isCourse && (
              <Link to="/find-tutor" className="bo-btn">
                Book again
              </Link>
            )}
            {row.status === 'cancelled' && row.cancelledBy === 'tutor' && role === 'student' && (
              <Link to="/find-tutor" className="bo-btn">
                Find another time
              </Link>
            )}

            {/* Only settled rows can be cleared, and only from Past — hiding a
                lesson someone is still expecting would lose it. */}
            {tab === 'past' && (
              <button
                type="button"
                className="bo-btn bo-btn-quiet"
                onClick={() => act(row, 'hide')}
                disabled={busy}
                aria-label={`Remove ${row.title} from your list`}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </li>
    )
  }

  const list = buckets[tab] || []

  const emptyCopy = {
    upcoming:
      role === 'teacher'
        ? 'No confirmed lessons coming up.'
        : 'Nothing coming up — book a lesson or join a course to get started.',
    requests:
      role === 'teacher'
        ? 'No new booking requests. Students can only request times you have opened.'
        : 'No pending requests. Anything you book waits here until the tutor confirms.',
    past: 'Nothing here yet.',
  }

  return (
    <div className="bo-page">
      {/* Messages, bell and account, as on every other top-level page. The
          title and the tools share one row so the icons sit on the heading's
          line rather than pushing the page down — the same shape Messages
          uses. */}
      <header className="bo-head">
        <div className="bo-head-text">
          <h1 className="bo-title-h1">Bookings</h1>
          <p className="bo-sub">
            {role === 'teacher'
              ? 'Requests waiting on you, and the lessons you have agreed to teach.'
              : 'Lessons you have booked and courses you have joined.'}
          </p>
        </div>
        <div className="bo-tools">
          <PageTools />
        </div>
      </header>

      {/* Only an account with a tutor profile has a teacher side to look at. */}
      {isTutor && (
        <div className="bo-roles" role="tablist" aria-label="View as">
          {['student', 'teacher'].map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={role === r}
              className={`bo-role${role === r ? ' active' : ''}`}
              onClick={() => switchRole(r)}
            >
              {r === 'student' ? 'As a student' : 'As a teacher'}
            </button>
          ))}
        </div>
      )}

      {/* Tabs and the Clear-all control share one line, since one sits left and
          the other right. Wrapped in a flex row rather than pulled up with a
          negative margin: the row can then WRAP on a narrow window instead of
          running into the tab pills. */}
      <div className="bo-tabrow">
      <div className="bo-tabs" role="tablist">
        {tabs.map((key) => {
          const count = buckets[key].length
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`bo-tab${tab === key ? ' active' : ''}`}
              onClick={() => {
                setTab(key)
                setArmedClear(false)
              }}
            >
              {TAB_LABELS[key]}
              {count > 0 && <span className="bo-count">{count}</span>}
            </button>
          )
        })}
      </div>

      {tab === 'past' && list.length > 0 && (
        <div className="bo-bulk">
          <button
            type="button"
            className="bo-clear"
            onClick={() => setConfirmClear(true)}
            disabled={clearing}
          >
            <TrashIcon />
            Clear all
          </button>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title={`Clear ${list.length} past ${list.length === 1 ? 'booking' : 'bookings'}?`}
          message={`They will be removed from your list. ${
            role === 'teacher' ? 'Your students' : 'Your tutors'
          } keep their own records, and this can't be undone.`}
          confirmLabel="Clear all"
          busyLabel="Clearing…"
          busy={clearing}
          onConfirm={clearPast}
          onCancel={() => setConfirmClear(false)}
        />
      )}
      </div>

      {/* Below the row, so an error message spans the full width rather than
          being squeezed into the flex line beside the tabs. */}
      {error && <p className="bo-error">{error}</p>}

      {loading ? (
        <p className="bo-empty">Loading…</p>
      ) : list.length === 0 ? (
        <p className="bo-empty">{emptyCopy[tab]}</p>
      ) : (
        <ul className={`bo-list${tab === 'past' ? ' bo-list-muted' : ''}`}>
          {list.map(renderRow)}
        </ul>
      )}

      {/* Declining asks why, because "declined" with no reason tells the
          student nothing they can act on. */}
      {declining && (
        <div
          className="bo-scrim"
          onMouseDown={(e) => e.target === e.currentTarget && setDeclining(null)}
        >
          <div className="bo-modal" role="dialog" aria-modal="true" aria-label="Decline request">
            <p className="bo-modal-title">Decline this request?</p>
            <p className="bo-modal-sub">
              {declining.who}
              {declining.at ? ` · ${dayFmt.format(new Date(declining.at))}` : ''}
            </p>

            <div className="bo-reasons">
              {DECLINE_REASONS.map((r) => (
                <label key={r} className={`bo-reason${reason === r ? ' active' : ''}`}>
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {r}
                </label>
              ))}
            </div>

            <div className="bo-modal-actions">
              <button type="button" className="bo-btn" onClick={() => setDeclining(null)}>
                Keep it
              </button>
              <button
                type="button"
                className="bo-btn bo-btn-danger"
                onClick={() => act(declining, 'decline')}
                disabled={busyId === declining.uid}
              >
                Send decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
