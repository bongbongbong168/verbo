import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import './TutorLessonsCard.css'

/* Three rows per page, as in the design — the dot strip beneath is what makes
   a long price list browsable instead of an endless column. */
const PER_PAGE = 3

const TABS = [
  { key: 'private', label: 'Private Lessons' },
  { key: 'group', label: 'Group Courses' },
]

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

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
        /* Sold by the clock, so the length is the tile (a watch face). The
           description is NOT on the row - rows were wordy - it is in the
           lesson popup a tap away. */
        tileNum: l.duration_minutes || 30,
        tileUnit: 'min',
        tileBand: '1-on-1',
        // One short line so the row says what the lesson IS (clamped to one
        // line; the full text is in the lesson popup).
        note: l.description || (l.is_trial ? 'Meet your tutor and plan your goals' : ''),
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
      tileNum: c.weeks,
      tileUnit: c.weeks === 1 ? 'week' : 'weeks',
      tileBand: 'Group',
      // One short line: what the run holds and how full it is.
      note: `${c.total_classes} classes · ${c.seats_taken ?? c.live_enrollments_count ?? 0}/${c.capacity} seats`,
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

  /* The pill SLIDES between tabs. Its resting place is static (it is rendered
     inside the active tab), and the slide is a Web Animation from where the
     old tab was, cancelled by a timer: a tab that never composites just shows
     the pill already on the right tab, never stuck halfway. */
  const tabRefs = useRef({})
  const fromRect = useRef(null)

  function switchTab(key) {
    if (key === tab) return
    fromRect.current = tabRefs.current[tab]?.getBoundingClientRect() || null
    setTab(key)
    setPage(0)
  }

  useLayoutEffect(() => {
    const from = fromRect.current
    fromRect.current = null
    const btn = tabRefs.current[tab]
    const pill = btn?.querySelector('.tl-tab-pill')
    if (!from || !pill || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const to = btn.getBoundingClientRect()
    // Rects are painted px; the transform is in CSS px under #root's zoom.
    const scale = to.width / btn.offsetWidth || 1
    const anim = pill.animate(
      [
        { transform: `translateX(${(from.left - to.left) / scale}px) scaleX(${from.width / to.width})` },
        { transform: 'none' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' },
    )
    const backstop = setTimeout(() => anim.cancel(), 700)
    return () => {
      clearTimeout(backstop)
      anim.cancel()
    }
  }, [tab])

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
            ref={(el) => { tabRefs.current[t.key] = el }}
            onClick={() => switchTab(t.key)}
          >
            {tab === t.key && <span className="tl-tab-pill" aria-hidden="true" />}
            <span className="tl-tab-label">{t.label}</span>
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
        <div className="tl-list" key={tab}>
          {shown.map((row) => (
            <button type="button" className="tl-row" key={row.id} onClick={row.onOpen}>
              {/* The My Learning calendar tile, holding the lesson's facts
                  instead of a date: the band says what kind, the big number
                  how long. */}
              <span className="tl-tile" aria-hidden="true">
                <span className="tl-tile-band">{row.tileBand}</span>
                <strong className="tl-tile-num">{row.tileNum}</strong>
                <span className="tl-tile-unit">{row.tileUnit}</span>
              </span>
              <span className="tl-row-main">
                <span className="tl-row-name">
                  {row.title}
                  {row.tag && <em className="tl-row-tag">{row.tag}</em>}
                </span>
                {row.note && <span className="tl-row-note">{row.note}</span>}
              </span>
              <span className="tl-row-price">${row.price}</span>
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
