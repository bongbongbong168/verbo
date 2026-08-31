/**
 * Bits shared by the notification dropdown and the full page, so the two
 * cannot drift apart on what an icon means or how a time is worded.
 */
import { useState } from 'react'

function TutorIcon() {
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
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

function MessageIcon() {
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
      <path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.3-4.1A7.5 7.5 0 1 1 20 12z" />
    </svg>
  )
}

function CourseIcon() {
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
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2.5 2.5 0 0 1 2 1 2.5 2.5 0 0 1 2-1h4.5A1.5 1.5 0 0 1 20 5.5v12a1.5 1.5 0 0 1-1.5 1.5H14a2.5 2.5 0 0 0-2 1 2.5 2.5 0 0 0-2-1H5.5A1.5 1.5 0 0 1 4 17.5z" />
      <path d="M12 5v14" />
    </svg>
  )
}

/** One icon per category, so a row's kind is readable before the words are. */
export function CategoryIcon({ category }) {
  if (category === 'message') return <MessageIcon />
  if (category === 'course') return <CourseIcon />
  return <TutorIcon />
}

/**
 * The face of whoever caused the notification, falling back to the category
 * glyph when there is nobody to show.
 *
 * Almost every row here is somebody doing something to you — a tutor accepting
 * a lesson, a student sending a message — and their picture identifies them
 * faster than a row of identical grey silhouettes ever could.
 *
 * Two cases keep the glyph, and both are correct rather than a gap: a
 * notification with no actor at all, and an actor who has uploaded no picture
 * and has no tutor photo either. `onError` covers the third case — a stored
 * file that has since gone missing — by falling back at render time rather
 * than leaving a broken image in the circle.
 *
 * Returns the whole chip, not just its contents, because showing a photo means
 * dropping the category tint behind it: the picture IS the fill, and a tinted
 * ring around it would read as a second, competing shape.
 *
 * @param prefix `nm` for the dropdown, `nt` for the page — the two carry the
 *   same markup under different class names, and this is the one place that
 *   knows it.
 */
export function NotificationFace({ prefix, category, photoUrl, name }) {
  const [failed, setFailed] = useState(false)
  const showPhoto = photoUrl && !failed

  return (
    <span
      className={`${prefix}-icon ${prefix}-${category}${showPhoto ? ` ${prefix}-icon-photo` : ''}`}
    >
      {showPhoto ? (
        /* alt="" — the name is already the first thing the row says in text,
           so voicing it again here would just repeat it. */
        <img src={photoUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        <CategoryIcon category={category} />
      )}
    </span>
  )
}

/**
 * "2 min ago" / "2h ago" / "3 Sep".
 *
 * Falls back to a real date past a week, where "9 days ago" stops being easier
 * to read than the date itself.
 */
export function relativeTime(iso) {
  if (!iso) return ''
  const then = new Date(iso)
  const secs = Math.floor((Date.now() - then.getTime()) / 1000)

  if (secs < 60) return 'Just now'
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`

  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(then)
}
