import { useEffect, useRef } from 'react'
import { CalendarIcon, ClockIcon, CloseIcon, TickIcon } from './CourseDialog'
import './CourseDialog.css'
import useScrollLock from '../useScrollLock'

/**
 * A private lesson, in the same popup card a group course opens in.
 *
 * Both rows sit in the same "Lessons" list, so clicking either has to feel
 * like one product: same card, same bands, same price footer. It reuses the
 * `cx-` styles outright rather than copying them, so the two cannot drift.
 *
 * It only describes the lesson. Picking a time stays in BookingDialog — the
 * CTA hands this lesson over, and the booking calendar opens already on it.
 *
 * A lesson has no outcomes field, so the list below states what the booking
 * actually includes instead of inventing things it will teach.
 */
export default function LessonDialog({ tutor, lesson, isSelf, onBook, onClose }) {
  const panelRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useScrollLock()

  const teacher = tutor.user?.name || 'Your tutor'
  // The trial is once per tutor — BookingDialog greys it out for the same reason.
  const trialSpent = lesson.is_trial && tutor.trial_used
  const minutes = lesson.duration_minutes

  const included = [
    `One-to-one with ${teacher}`,
    minutes ? `${minutes} minutes of live lesson time` : null,
    'Pick any open time in the next 4 weeks',
    `Chat with ${teacher.split(' ')[0]} once it’s booked`,
  ].filter(Boolean)

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
        aria-label={lesson.name}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="cx-head">
          <span className="cx-avatar" title={teacher}>
            {tutor.photo_url ? (
              <img src={tutor.photo_url} alt="" />
            ) : (
              <span>{teacher.charAt(0).toUpperCase()}</span>
            )}
          </span>
          <div className="cx-head-text">
            <p className="cx-title">
              {lesson.name}
              {lesson.is_trial && <em className="cx-tag">Trial</em>}
            </p>
            <p className="cx-blurb">
              {teacher} · Private lesson{minutes ? ` · ${minutes} min` : ''}
            </p>
          </div>
          <button type="button" className="cx-icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="cx-body">
          {lesson.description && <p className="cx-desc">{lesson.description}</p>}

          {/* Where a course leads with its fixed schedule, a lesson leads with
              the fact that the student sets it. */}
          <div className="cx-when">
            <p className="cx-when-row">
              <CalendarIcon />
              <span>
                <strong>You choose the day</strong>
                From {teacher.split(' ')[0]}’s open times
              </span>
            </p>
            {minutes > 0 && (
              <p className="cx-when-row">
                <ClockIcon />
                <span>
                  <strong>{minutes} minutes</strong>
                  One lesson, one-to-one
                </span>
              </p>
            )}
          </div>

          <h3 className="cx-h3">What’s included</h3>
          <ul className="cx-outcomes">
            {included.map((item) => (
              <li key={item}>
                <TickIcon />
                {item}
              </li>
            ))}
          </ul>

          {trialSpent && (
            <p className="cx-note">You’ve already had a trial lesson with {teacher}.</p>
          )}
        </div>

        <footer className="cx-foot">
          <div className="cx-price-row">
            <p className="cx-price">
              ${lesson.price}
              <em>per lesson</em>
            </p>
            {lesson.is_trial && <p className="cx-seats">One per student</p>}
          </div>
          <button
            type="button"
            className="cx-cta"
            onClick={() => onBook(lesson)}
            disabled={isSelf || trialSpent}
          >
            {isSelf ? 'This is your lesson' : trialSpent ? 'Trial already used' : 'Choose a time'}
          </button>
        </footer>
      </div>
    </div>
  )
}
