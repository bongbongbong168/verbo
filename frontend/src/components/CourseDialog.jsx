import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import './CourseDialog.css'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const longDateFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function describeDays(days = []) {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d])
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/** "7:00 PM – 8:00 PM" from two H:i:s strings. */
function timeRange(start, end) {
  const fmt = (t) => {
    const [h, m] = String(t).split(':').map(Number)
    const suffix = h < 12 ? 'AM' : 'PM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
  }
  return `${fmt(start)} – ${fmt(end)}`
}

export function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function TickIcon() {
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
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

export function CalendarIcon() {
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
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

export function ClockIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.2 1.9" />
    </svg>
  )
}

/**
 * A group course, in the same popup card the private flow uses.
 *
 * A course and a lesson are two shapes of one product, so they are chosen the
 * same way: the card opens over the tutor you were already looking at rather
 * than taking you to a page of its own.
 *
 * Deliberately no calendar. The course already has a schedule, so the student
 * accepts its dates rather than choosing one — that is the whole difference
 * from the private flow, where they pick the lesson, then the day, then a time.
 *
 * Either `course` (already loaded) or `courseId` (fetched here) must be given.
 */
export default function CourseDialog({ course: initial, courseId, onClose }) {
  const { token, user } = useAuth()
  const navigate = useNavigate()

  const [course, setCourse] = useState(initial || null)
  const [loading, setLoading] = useState(!initial)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [enrolled, setEnrolled] = useState(false)

  const panelRef = useRef(null)

  useEffect(() => {
    let live = true
    const id = initial?.id ?? courseId
    /* Enrolments are fetched alongside the course so the card knows whether to
       offer joining or the group chat — the course payload alone cannot say
       whether *you* are in it. The course itself is refetched even when one was
       handed in, since a list row carries no outcomes or description. */
    Promise.all([api.getCourse(token, id), api.getMyEnrollments(token).catch(() => [])])
      .then(([c, mine]) => {
        if (!live) return
        setCourse(c)
        setEnrolled(
          mine.some(
            (e) => Number(e.course_id) === Number(id) && ['held', 'confirmed'].includes(e.status),
          ),
        )
      })
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [token, initial?.id, courseId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /* The page keeps its scrollbar (html carries `overflow-y: scroll`), so
     locking body scroll here cannot shift the layout sideways. */
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  async function openGroupChat() {
    setError(null)
    try {
      const c = await api.openCourseConversation(token, course.id)
      navigate(`/messages?c=${c.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function enroll() {
    setError(null)
    setBusy(true)
    try {
      const enrollment = await api.enrollInCourse(token, course.id)
      // Enrolment is a *hold*; checkout is what settles it, exactly like a
      // booking. Both flows meet at the same screen from here on.
      navigate(`/checkout/course/${enrollment.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const seats = course ? (course.seats_taken ?? course.live_enrollments_count ?? 0) : 0
  const full = course ? seats >= course.capacity : false
  const isOwn = Number(course?.tutor_profile?.user_id) === Number(user?.id)
  const outcomes = (course?.outcomes || '').split('\n').filter(Boolean)
  const teacher = course?.tutor_profile?.user?.name || 'Your tutor'

  const stats = course
    ? [
        { label: 'Weeks', value: course.weeks },
        { label: 'Classes', value: course.total_classes },
        { label: 'Per week', value: course.classes_per_week },
        { label: 'Minutes', value: course.minutes_per_class },
      ]
    : []

  function body() {
    if (loading) return <p className="cx-note">Loading course…</p>
    if (!course) return <p className="cx-error">{error || 'Course not found.'}</p>

    if (confirming) {
      /* Still no calendar — this restates the schedule they are accepting and
         what it costs, with nothing left to choose. */
      return (
        <dl className="cx-summary">
          <div>
            <dt>Course</dt>
            <dd>{course.title}</dd>
          </div>
          <div>
            <dt>Teacher</dt>
            <dd>{teacher}</dd>
          </div>
          <div>
            <dt>Runs</dt>
            <dd>
              {dateFmt.format(new Date(course.starts_on))} –{' '}
              {longDateFmt.format(new Date(course.ends_on))}
            </dd>
          </div>
          <div>
            <dt>Schedule</dt>
            <dd>
              {describeDays(course.days_of_week)},{' '}
              {timeRange(course.start_time, course.end_time)}
            </dd>
          </div>
          <div>
            <dt>Students</dt>
            <dd>
              {seats} / {course.capacity} enrolled
            </dd>
          </div>
          <div className="cx-summary-total">
            <dt>Course fee</dt>
            <dd>${course.price}</dd>
          </div>
          <p className="cx-fineprint">
            You are enrolling in the complete {course.weeks}-week course — all{' '}
            {course.total_classes} classes.
          </p>
        </dl>
      )
    }

    return (
      <>
        {course.description && <p className="cx-desc">{course.description}</p>}

        {/* The schedule is the thing being accepted, so it leads. */}
        <div className="cx-when">
          <p className="cx-when-row">
            <CalendarIcon />
            <span>
              <strong>{describeDays(course.days_of_week)}</strong>
              {dateFmt.format(new Date(course.starts_on))} –{' '}
              {dateFmt.format(new Date(course.ends_on))}
            </span>
          </p>
          <p className="cx-when-row">
            <ClockIcon />
            <span>
              <strong>{timeRange(course.start_time, course.end_time)}</strong>
              {course.minutes_per_class} min per class
            </span>
          </p>
        </div>

        {/* What you get for the money — a course is sold by the term, so these
            four are the shape of the thing being bought. */}
        <div className="cx-stats">
          {stats.map((s) => (
            <span key={s.label}>
              <strong>{s.value}</strong>
              {s.label}
            </span>
          ))}
        </div>

        <h3 className="cx-h3">What you’ll learn</h3>
        {outcomes.length === 0 ? (
          <p className="cx-empty">The tutor hasn’t listed outcomes for this course yet.</p>
        ) : (
          <ul className="cx-outcomes">
            {outcomes.map((o) => (
              <li key={o}>
                <TickIcon />
                {o}
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  function footer() {
    if (loading || !course) return null

    if (confirming) {
      return (
        <>
          <button type="button" className="cx-cta" onClick={enroll} disabled={busy}>
            {busy ? 'Reserving…' : 'Continue to payment →'}
          </button>
          <button type="button" className="cx-back" onClick={() => setConfirming(false)}>
            ← Back to course
          </button>
        </>
      )
    }

    return (
      <>
        <div className="cx-price-row">
          <p className="cx-price">
            ${course.price}
            <em>total</em>
          </p>
          <p className="cx-seats">
            {seats} / {course.capacity} seats filled
          </p>
        </div>

        {/* A course cannot be booked by its own teacher, and a full one says so
            rather than failing at the server. */}
        <button
          type="button"
          className="cx-cta"
          onClick={() => setConfirming(true)}
          disabled={full || isOwn || enrolled}
        >
          {enrolled
            ? 'Already enrolled'
            : isOwn
              ? 'This is your course'
              : full
                ? 'Course full'
                : 'Join course'}
        </button>

        {/* The group chat belongs to people already in the course — everyone
            else has nothing to discuss there yet. */}
        {(isOwn || enrolled) && (
          <button type="button" className="cx-ghost" onClick={openGroupChat}>
            Course group chat
          </button>
        )}
      </>
    )
  }

  const foot = footer()

  return (
    <div
      className="cx-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="cx"
        role="dialog"
        aria-modal="true"
        aria-label={course ? `Join ${course.title}` : 'Group course'}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="cx-head">
          <Link
            to={course ? `/find-tutor/${course.tutor_profile_id}` : '/find-tutor'}
            className="cx-avatar"
            title={teacher}
          >
            {course?.tutor_profile?.photo_url ? (
              <img src={course.tutor_profile.photo_url} alt="" />
            ) : (
              <span>{teacher.charAt(0).toUpperCase()}</span>
            )}
          </Link>
          <div className="cx-head-text">
            <p className="cx-title">{confirming ? 'Confirm enrolment' : course?.title || 'Course'}</p>
            <p className="cx-blurb">
              {teacher}
              {course?.level ? ` · ${course.level}` : ''}
            </p>
          </div>
          <button type="button" className="cx-icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="cx-body">
          {body()}
          {error && course && <p className="cx-error">{error}</p>}
        </div>

        {foot && <footer className="cx-foot">{foot}</footer>}
      </div>
    </div>
  )
}
