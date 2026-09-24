import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import './TutorLessonsCard.css'

/* Three rows per page, as in the design — the dot strip beneath is what makes
   a long price list browsable instead of an endless column. */
const PER_PAGE = 3

const TABS = [
  { key: 'private', label: 'Private Lessons' },
  { key: 'group', label: 'Group Courses' },
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

/** "Tuesday & Thursday" — the schedule line a course card leads with. */
function describeDays(days = []) {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d])
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/**
 * The tutor's price list: private lessons and group courses behind one toggle.
 *
 * They are deliberately different products — a lesson is a length the student
 * schedules themselves, a course is a fixed run of dates they accept — so the
 * secondary line says different things for each rather than forcing "minutes"
 * onto something sold by the term.
 */
export default function TutorLessonsCard({
  tutor,
  token,
  canEdit,
  onBookLesson,
  onOpenCourse,
  /* Lets the page place this card in its own grid. Without it the card was
     unreachable from the page's stylesheet: `.td-lessons` had grid coordinates
     written for it and matched nothing, so the card had only ever been
     auto-placed and could not be reordered on a phone. */
  className = '',
}) {

  const [tab, setTab] = useState('private')
  const [page, setPage] = useState(0)
  const [courses, setCourses] = useState([])
  const [loadingCourses, setLoadingCourses] = useState(false)

  // Courses are not part of the profile payload, and most visitors never open
  // the tab — so they are fetched the first time it is opened.
  useEffect(() => {
    if (tab !== 'group' || courses.length || loadingCourses) return
    setLoadingCourses(true)
    api
      .getTutorCourses(token, tutor.id)
      .then(setCourses)
      .catch(() => {})
      .finally(() => setLoadingCourses(false))
  }, [tab, courses.length, loadingCourses, token, tutor.id])

  const rows = useMemo(() => {
    if (tab === 'private') {
      return (tutor.lessons || []).map((l) => ({
        id: `l-${l.id}`,
        title: l.name,
        // A lesson is sold by the clock, so the sub-line is its length.
        note: [l.duration_minutes ? `${l.duration_minutes} min` : null, l.description]
          .filter(Boolean)
          .join(' · '),
        price: l.price,
        tag: l.is_trial ? 'Trial' : null,
        onOpen: () => onBookLesson?.(l),
      }))
    }

    return courses.map((c) => ({
      id: `c-${c.id}`,
      title: c.title,
      /* "minutes" alone means nothing for something sold by the term, so a
         course leads with what you actually get for the money. */
      note: `${c.weeks} weeks · ${c.total_classes} classes · ${c.minutes_per_class} min/class`,
      meta: `${describeDays(c.days_of_week)} · ${c.seats_taken ?? c.live_enrollments_count ?? 0}/${c.capacity} students`,
      price: c.price,
      /* Opens the course popup right here, the same way a private lesson row
         opens its lesson popup (LessonDialog, the same card). Navigating away to a page of its own made
         the two products behave like two different apps. */
      onOpen: () => onOpenCourse?.(c),
    }))
  }, [tab, tutor.lessons, courses, onOpenCourse, onBookLesson])

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const safePage = Math.min(page, pages - 1)
  const shown = rows.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)

  function switchTab(key) {
    setTab(key)
    setPage(0)
  }

  return (
    <section className={`tl ${className}`.trim()}>
      <h2 className="tl-title">Lessons</h2>

      <div className="tl-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tl-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'group' && loadingCourses ? (
        <p className="tl-empty">Loading courses…</p>
      ) : rows.length === 0 ? (
        <p className="tl-empty">
          {tab === 'private'
            ? canEdit
              ? 'No lessons yet — add one from Edit profile.'
              : 'No private lessons listed yet.'
            : canEdit
              ? 'No group courses yet — add one from Edit profile.'
              : 'No group courses running right now.'}
        </p>
      ) : (
        <div className="tl-list">
          {shown.map((row) => (
            <button type="button" className="tl-row" key={row.id} onClick={row.onOpen}>
              <span className="tl-row-main">
                <span className="tl-row-name">
                  {row.title}
                  {row.tag && <em className="tl-row-tag">{row.tag}</em>}
                </span>
                {row.note && <span className="tl-row-note">{row.note}</span>}
                {row.meta && <span className="tl-row-meta">{row.meta}</span>}
              </span>
              <span className="tl-row-price">${row.price} USD</span>
            </button>
          ))}
        </div>
      )}

      {/* Only worth drawing when there is more than one page of rows. */}
      {pages > 1 && (
        <div className="tl-dots" role="tablist" aria-label="More lessons">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === safePage}
              aria-label={`Page ${i + 1}`}
              className={`tl-dot${i === safePage ? ' active' : ''}`}
              onClick={() => setPage(i)}
            />
          ))}
        </div>
      )}

      {tab === 'group' && courses.length > 0 && (
        <p className="tl-foot">Next intake {dateFmt.format(new Date(courses[0].starts_on))}</p>
      )}
    </section>
  )
}
