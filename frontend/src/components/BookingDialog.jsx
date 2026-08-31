import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import './BookingDialog.css'

/* Times come back as ISO instants. They are rendered in the *student's* own
   timezone — that is the clock they will actually show up by — with the
   tutor's zone named underneath so a big offset is never a surprise. */
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayLetterFmt = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
const fullFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
})

/* The design groups the day into three parts rather than listing every slot in
   one run — which is also how someone actually thinks about when they are free. */
const PARTS = [
  { key: 'morning', label: 'Morning', until: 12 },
  { key: 'afternoon', label: 'Afternoon', until: 17 },
  { key: 'evening', label: 'Evening', until: 24 },
]

const DAYS_AHEAD = 28

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function ChevronIcon({ dir }) {
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
      <path d={dir === 'prev' ? 'm14.5 5-7 7 7 7' : 'm9.5 5 7 7-7 7'} />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  )
}

function MoonIcon() {
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
      <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
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

function CheckIcon() {
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

/** mm:ss left on a hold, or null once it has run out. */
function useCountdown(deadline) {
  const [left, setLeft] = useState(() => (deadline ? deadline - Date.now() : 0))

  useEffect(() => {
    if (!deadline) return undefined
    setLeft(deadline - Date.now())
    // A plain interval, not requestAnimationFrame: rAF is throttled to nothing
    // in a background tab, which is exactly when a 15-minute hold is most
    // likely to lapse without the user watching.
    const id = setInterval(() => setLeft(deadline - Date.now()), 1000)
    return () => clearInterval(id)
  }, [deadline])

  if (!deadline || left <= 0) return null

  const total = Math.floor(left / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export default function BookingDialog({ tutor, token, onClose, onBooked }) {
  const navigate = useNavigate()
  const lessons = tutor.lessons || []

  const [slots, setSlots] = useState([])
  const [tutorZone, setTutorZone] = useState(null)
  const [hasAvailability, setHasAvailability] = useState(true)
  const [duration, setDuration] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  /* Pick the lesson first, then the time — the lesson decides how long the
     booking runs, so the calendar cannot be built until it is chosen. A tutor
     with exactly one lesson skips the step rather than being asked to "choose"
     from a list of one. */
  const [lesson, setLesson] = useState(() => (lessons.length === 1 ? lessons[0] : null))

  const [weekOffset, setWeekOffset] = useState(0)
  const [activeDay, setActiveDay] = useState(null)
  const [picked, setPicked] = useState(null)
  const [message, setMessage] = useState('')
  const [showMessage, setShowMessage] = useState(false)

  const [booking, setBooking] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const panelRef = useRef(null)

  const holdLeft = useCountdown(
    booking && !confirmed && booking.hold_expires_at
      ? new Date(booking.hold_expires_at).getTime()
      : null,
  )

  useEffect(() => {
    // Nothing to fetch until a lesson is chosen: its length is what decides
    // which starts are offered.
    if (!lesson && lessons.length > 1) {
      setLoading(false)
      return undefined
    }

    let live = true
    setLoading(true)
    setPicked(null)
    api
      .getTutorSlots(token, tutor.id, { lessonId: lesson?.id, days: DAYS_AHEAD })
      .then((data) => {
        if (!live) return
        setSlots(data.slots || [])
        setTutorZone(data.timezone || null)
        setDuration(data.duration_minutes || 30)
        setHasAvailability(data.has_availability !== false)
      })
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [token, tutor.id, lesson, lessons.length])

  /* Keyed by the student's local date rather than the tutor's: a late slot in
     the tutor's evening can fall on the next day for the student, and filing it
     under the tutor's heading would put it on the wrong day. */
  const byDay = useMemo(() => {
    const map = new Map()
    for (const slot of slots) {
      /* `taken` is dropped, `busy` is kept and disabled — deliberately not the
         same treatment. A time the tutor has sold to someone else is none of
         this student's business and removing it keeps the list short. A time
         blocked by the student's OWN lesson is the opposite: silently removing
         it makes the tutor look unavailable, when the thing in the way is
         something they booked themselves and could move. */
      if (slot.taken) continue
      const at = new Date(slot.starts_at)
      const key = dayKey(at)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ ...slot, at })
    }
    return map
  }, [slots])

  /* A fixed seven-day strip that pages, as in the design — not just the days
     that happen to have slots. Showing an empty Tuesday is information; hiding
     it silently makes the calendar look shorter than it is. */
  const week = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() + weekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = dayKey(d)
      return { key, date: d, times: byDay.get(key) || [] }
    })
  }, [weekOffset, byDay])

  /* Land on the first day that actually has something.
     Re-checked whenever the week changes, not just when `activeDay` falls
     outside it: on the very first render the slots have not arrived yet, so
     every day looks empty and today gets picked — and today is often the one
     day with nothing left on it. Empty days are disabled, so moving off one
     can never override a deliberate choice. */
  useEffect(() => {
    const current = week.find((d) => d.key === activeDay)
    if (current && current.times.length > 0) return
    const firstFree = week.find((d) => d.times.length > 0)
    if (firstFree) setActiveDay(firstFree.key)
    else if (!current && week[0]) setActiveDay(week[0].key)
  }, [week, activeDay])

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

  /* Derived from `week` + `activeDay` rather than from an intermediate array:
     `week.find(...).times` is a fresh reference every render, so memoizing on
     it would recompute every time anyway. */
  const parts = useMemo(() => {
    const times = week.find((d) => d.key === activeDay)?.times ?? []
    let from = 0
    return PARTS.map((part) => {
      const inPart = times.filter((t) => t.at.getHours() >= from && t.at.getHours() < part.until)
      from = part.until
      return { ...part, times: inPart }
    }).filter((p) => p.times.length > 0)
  }, [week, activeDay])

  // The last week worth paging to — beyond it every day is empty anyway.
  const maxWeek = Math.floor((DAYS_AHEAD - 1) / 7)

  async function handleBook() {
    if (!picked) return
    setError(null)
    setBusy(true)
    try {
      const created = await api.createBooking(token, {
        tutor_id: tutor.user.id,
        tutor_lesson_id: lesson?.id ?? null,
        starts_at: picked,
        message: message.trim() || null,
      })
      onBooked?.(created)
      /* The hold exists; settling it is the checkout's job now, so both flows
         meet at one summary + payment + confirmation rather than this dialog
         having its own private version of them. */
      navigate(`/checkout/lesson/${created.id}`)
    } catch (err) {
      setError(err.message)
      // A 409 means somebody else took it while this dialog was open; a 422
      // carrying `conflict` means the student booked something else themselves
      // (likely in another tab) since this list loaded. Either way what is on
      // screen is stale, so refetch rather than leaving a time on offer that
      // cannot be booked.
      if (err.status === 409 || err.data?.conflict) {
        api
          .getTutorSlots(token, tutor.id, { lessonId: lesson?.id, days: DAYS_AHEAD })
          .then((data) => setSlots(data.slots || []))
          .catch(() => {})
        setPicked(null)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm() {
    setError(null)
    setBusy(true)
    try {
      const updated = await api.confirmBooking(token, booking.id)
      setBooking(updated)
      setConfirmed(true)
      onBooked?.(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const heading = lesson ? lesson.name : 'Book a lesson'
  const blurb = lesson
    ? lesson.description || `This lesson gives you ${duration} minutes with ${tutor.user.name}.`
    : `Choose a lesson with ${tutor.user.name}.`

  /* One body per stage. Everything below the header shares the same three-band
     frame from the design, so the dialog never changes shape between steps. */
  function body() {
    if (confirmed) {
      return (
        <div className="bk-state">
          <span className="bk-state-mark">
            <CheckIcon />
          </span>
          <p className="bk-state-title">
            {lesson?.is_trial ? 'Trial class booked' : 'Lesson booked'}
          </p>
          <p className="bk-state-when">{fullFmt.format(new Date(booking.starts_at))}</p>
        </div>
      )
    }

    if (booking) {
      return (
        <div className="bk-state">
          <p className="bk-state-title">Your slot is held</p>
          <p className="bk-state-when">{fullFmt.format(new Date(booking.starts_at))}</p>
          <p className="bk-state-note">
            <ClockIcon />
            {holdLeft ? (
              <>
                Held for <strong>{holdLeft}</strong> more — confirm to secure it.
              </>
            ) : (
              <>This hold has expired. Pick a time again.</>
            )}
          </p>
        </div>
      )
    }

    if (!lesson && lessons.length > 1) {
      return (
        <div className="bk-lessons">
          <p className="bk-eyebrow">Choose a lesson</p>
          {lessons.map((l) => {
            // The trial is offered once per tutor. Showing it greyed with the
            // reason beats letting them pick it and collecting a 422.
            const spent = l.is_trial && tutor.trial_used
            return (
              <button
                key={l.id}
                type="button"
                className="bk-lesson"
                onClick={() => setLesson(l)}
                disabled={spent}
              >
                <span className="bk-lesson-main">
                  <span className="bk-lesson-name">
                    {l.name}
                    {l.is_trial && <em className="bk-tag">Trial</em>}
                  </span>
                  {l.description && <span className="bk-lesson-desc">{l.description}</span>}
                  <span className="bk-lesson-meta">
                    {l.duration_minutes} min{spent && ' · already used'}
                  </span>
                </span>
                <span className="bk-lesson-price">${l.price}</span>
              </button>
            )
          })}
        </div>
      )
    }

    if (loading) return <p className="bk-empty">Loading available times…</p>

    if (lessons.length === 0) {
      return (
        <p className="bk-empty">
          {tutor.user.name} hasn&rsquo;t listed any lessons yet — there is nothing to book until
          they do.
        </p>
      )
    }

    if (!hasAvailability) {
      return (
        <p className="bk-empty">
          {tutor.user.name} hasn&rsquo;t opened any times yet — there is nothing to book until they
          set their weekly hours.
        </p>
      )
    }

    return (
      <>
        <div className="bk-booking-head">
          <p className="bk-booking-title">Booking</p>
          <div className="bk-nav">
            <button
              type="button"
              className="bk-icon-btn"
              onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
              disabled={weekOffset === 0}
              aria-label="Previous week"
            >
              <ChevronIcon dir="prev" />
            </button>
            <button
              type="button"
              className="bk-icon-btn"
              onClick={() => setWeekOffset((w) => Math.min(maxWeek, w + 1))}
              disabled={weekOffset >= maxWeek}
              aria-label="Next week"
            >
              <ChevronIcon dir="next" />
            </button>
          </div>
        </div>

        <div className="bk-week" role="tablist" aria-label="Choose a day">
          {week.map((d) => (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={d.key === activeDay}
              className={`bk-day${d.key === activeDay ? ' active' : ''}`}
              onClick={() => {
                setActiveDay(d.key)
                setPicked(null)
              }}
              disabled={d.times.length === 0}
            >
              <em>{dayLetterFmt.format(d.date)}</em>
              <strong>{d.date.getDate()}</strong>
            </button>
          ))}
        </div>

        {parts.length === 0 ? (
          <p className="bk-empty">No free {duration}-minute slots on this day.</p>
        ) : (
          parts.map((part) => (
            <section className="bk-part" key={part.key}>
              <h3 className="bk-part-title">
                {part.key === 'evening' ? <MoonIcon /> : <SunIcon />}
                {part.label}
              </h3>
              <div className="bk-times">
                {part.times.map((t) => (
                  <button
                    key={t.starts_at}
                    type="button"
                    className={`bk-time${picked === t.starts_at ? ' picked' : ''}${
                      t.busy ? ' busy' : ''
                    }`}
                    onClick={() => setPicked(t.starts_at)}
                    disabled={t.busy}
                    /* Says which of the student's own lessons is in the way.
                       A disabled time with no reason reads as broken. */
                    title={t.busy ? 'You already have a lesson at this time' : undefined}
                  >
                    {timeFmt.format(t.at)}
                  </button>
                ))}
              </div>
            </section>
          ))
        )}

        {/* Not in the design, which simply did not depict it — kept, but folded
            away so the default view matches the mockup exactly. */}
        {showMessage ? (
          <label className="bk-field">
            <span>Message (optional)</span>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything you'd like to cover?"
            />
          </label>
        ) : (
          <button type="button" className="bk-link" onClick={() => setShowMessage(true)}>
            + Add a message
          </button>
        )}

        {tutorZone && <p className="bk-zone">Times in your timezone · tutor is in {tutorZone}</p>}
      </>
    )
  }

  function footer() {
    if (confirmed) {
      return (
        <button type="button" className="bk-cta" onClick={onClose}>
          Done
        </button>
      )
    }
    if (booking) {
      return (
        <button
          type="button"
          className="bk-cta"
          onClick={handleConfirm}
          disabled={busy || !holdLeft}
        >
          {busy ? 'Confirming…' : 'Confirm booking'}
        </button>
      )
    }
    if (!lesson && lessons.length > 1) return null
    if (loading || !hasAvailability || lessons.length === 0) return null

    return (
      <>
        {lessons.length > 1 && (
          <button type="button" className="bk-back" onClick={() => setLesson(null)}>
            ← Change lesson
          </button>
        )}
        <button type="button" className="bk-cta" onClick={handleBook} disabled={!picked || busy}>
          {busy ? 'Holding…' : 'Continue'}
        </button>
      </>
    )
  }

  const foot = footer()

  return (
    <div
      className="bk-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bk"
        role="dialog"
        aria-modal="true"
        aria-label={`Book a lesson with ${tutor.user.name}`}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="bk-head">
          <span className="bk-avatar">
            {tutor.photo_url ? (
              <img src={tutor.photo_url} alt="" />
            ) : (
              <span>{tutor.user.name.charAt(0).toUpperCase()}</span>
            )}
          </span>
          <div className="bk-head-text">
            <p className="bk-title">{heading}</p>
            <p className="bk-blurb">{blurb}</p>
          </div>
          <button
            type="button"
            className="bk-icon-btn bk-close"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="bk-body">
          {body()}
          {error && <p className="bk-error">{error}</p>}
        </div>

        {foot && <footer className="bk-foot">{foot}</footer>}
      </div>
    </div>
  )
}
