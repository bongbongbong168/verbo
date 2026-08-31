import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { hasLiveBookingWith, isBookingLive } from '../bookings'
import BookingDialog from '../components/BookingDialog'
import CourseDialog from '../components/CourseDialog'
import TutorLessonsCard from '../components/TutorLessonsCard'
import TutorEditDrawer from '../components/TutorEditDrawer'
/* The one relativeTime in the app. Lives beside the notification bits
   because that is where it was first needed; duplicating it here so the
   import reads tidier is exactly how two wordings drift apart. */
import { relativeTime } from '../components/notifications'
import './TutorProfileDetail.css'

/* Figures the API has no field for yet. Kept together and named so they are
   obviously stand-ins rather than data — swap them out as the backend grows
   ratings, lesson counts and a resume. */
/* Rating is real now — see review_average. The rest still have no backend. */
const PLACEHOLDER_STATS = { students: '268', lessons: '1,229', experience: '5y' }

/* The tab strip is fixed so it stays stable even when one section is empty;
   the entries under it are real rows from the API. */
const RESUME_SECTIONS = ['Education', 'Certifications']

/**
 * Turn a pasted link into something playable.
 *
 * Returns {kind: 'embed', src} for YouTube/Vimeo — their watch URLs cannot go
 * in an iframe directly, they have to be rewritten to the /embed form — or
 * {kind: 'file', src} for a direct video file, which a <video> can play as-is.
 * Anything else returns null and the card falls back to the still image.
 */
function resolveVideo(url) {
  if (!url) return null
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1)
    return id ? { kind: 'embed', src: `https://www.youtube.com/embed/${id}?autoplay=1` } : null
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = parsed.searchParams.get('v') || parsed.pathname.split('/').pop()
    return id ? { kind: 'embed', src: `https://www.youtube.com/embed/${id}?autoplay=1` } : null
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parsed.pathname.split('/').filter(Boolean).pop()
    return /^\d+$/.test(id || '')
      ? { kind: 'embed', src: `https://player.vimeo.com/video/${id}?autoplay=1` }
      : null
  }

  if (/\.(mp4|webm|ogg|mov)$/i.test(parsed.pathname)) {
    return { kind: 'file', src: url }
  }

  return null
}

function VerifiedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Verified" role="img">
      <path
        fill="#d61f1f"
        d="M12.00 1.00 L9.64 3.21 L6.50 2.47 L5.57 5.57 L2.47 6.50 L3.21 9.64 L1.00 12.00 L3.21 14.36 L2.47 17.50 L5.57 18.43 L6.50 21.53 L9.64 20.79 L12.00 23.00 L14.36 20.79 L17.50 21.53 L18.43 18.43 L21.53 17.50 L20.79 14.36 L23.00 12.00 L20.79 9.64 L21.53 6.50 L18.43 5.57 L17.50 2.47 L14.36 3.21 Z"
      />
      <path
        d="M7.6 12.1 10.5 15 16.4 9.1"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BookmarkIcon() {
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
      <path d="M6 4h12v16l-6-4-6 4V4z" />
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

function PencilIcon() {
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
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="m14.5 6.5 3 3" />
    </svg>
  )
}

function GradCapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4z" />
      <path d="M6 10.5V16c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5.5" />
    </svg>
  )
}

function LangIcon() {
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
      <path d="M3 6h9M7.5 4v2M10 6c0 4-3.5 7-7 7" />
      <path d="M6 10.5c1.5 2 3.5 3.2 5.5 3.7" />
      <path d="m13 20 4-9 4 9M14.4 17h5.2" />
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

function TagIcon() {
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
      <path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

function MessageIcon() {
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
      <rect x="3" y="5" width="18" height="13" rx="2.5" />
      <path d="m4 7 8 5.5L20 7" />
    </svg>
  )
}

/**
 * Always five stars, filled up to `count`.
 *
 * It used to render only the filled ones, so a 3-star review showed three
 * stars and a 5-star review showed five — with nothing to measure them
 * against, three looked like a short row rather than a mediocre score. The
 * empty ones are what make the rating readable at a glance.
 */
function Stars({ count = 4 }) {
  return (
    <span className="td-stars" aria-label={`${count} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= count ? 'on' : ''} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}

/**
 * The rating summary: how many of each score, and the average.
 *
 * Every number here is counted from the reviews already on the page — no new
 * request and nothing invented. The bars answer the question an average alone
 * cannot: whether 4.0 means "everyone thought it was fine" or "half loved it
 * and half didn't".
 */
function ReviewSummary({ reviews, average }) {
  const total = reviews.length

  return (
    <div className="td-rsum">
      <div className="td-rsum-bars">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = reviews.filter((r) => r.rating === star).length
          /* Percentage of the TOTAL, not of the biggest bucket — the bars are
             meant to be read as "most people gave 5", and scaling to the
             largest would make a single 1-star review look like a full bar. */
          const pct = total ? (n / total) * 100 : 0

          return (
            <div className="td-rsum-row" key={star}>
              <span className="td-rsum-star">
                {star} <em>★</em>
              </span>
              <span className="td-rsum-track">
                {/* Static width, no transition — right on the first paint. */}
                <span className="td-rsum-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="td-rsum-n">{n}</span>
            </div>
          )
        })}
      </div>

      <div className="td-rsum-score">
        <span className="td-rsum-avg">{average ?? '—'}</span>
        <Stars count={Math.round(average ?? 0)} />
        <span className="td-rsum-count">
          {total} {total === 1 ? 'Review' : 'Reviews'}
        </span>
      </div>
    </div>
  )
}

export default function TutorProfileDetail() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const navigate = useNavigate()

  const [tutor, setTutor] = useState(null)
  const [others, setOthers] = useState([])
  const [alreadyBooked, setAlreadyBooked] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [justSent, setJustSent] = useState(false)
  const [showBooking, setShowBooking] = useState(false)
  const [openCourse, setOpenCourse] = useState(null)
  const [opening, setOpening] = useState(false)
  const [resumeTab, setResumeTab] = useState('Education')
  const [playing, setPlaying] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const [reviewRating, setReviewRating] = useState(5)
  const [reviewBody, setReviewBody] = useState('')
  const [savingReview, setSavingReview] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)

  useEffect(() => {
    loadTutor()
  }, [token, id])

  function loadTutor() {
    setLoading(true)
    // "Teacher you may like" is the one genuinely real block here — it comes
    // from the tutor list with this profile filtered out.
    Promise.all([api.getTutor(token, id), api.getBookings(token), api.getTutors(token)])
      .then(([tutorData, bookingData, allTutors]) => {
        setTutor(tutorData)
        setPlaying(false)
        /* Up to 6, not 3. The grid auto-fills, so this is a ceiling rather
           than a target — with only a handful of tutors on the platform it
           still shows however many exist, and it fills out on its own as more
           sign up instead of needing this number revisited. */
        setOthers(allTutors.filter((t) => Number(t.id) !== Number(id)).slice(0, 6))
        // Only *live* bookings block the button. Counting every row meant a
        // cancelled booking left this reading "Request sent" permanently.
        setAlreadyBooked(hasLiveBookingWith(bookingData.sent, tutorData.user_id))
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /* Booking now needs a time, so it happens in the dialog rather than here —
     `starts_at` is required server-side and this page has no picker. */
  /* Opening a thread is idempotent server-side, so pressing this repeatedly
     never creates a second conversation with the same tutor. */
  async function messageTutor() {
    setError(null)
    setOpening(true)
    try {
      const c = await api.openTutorConversation(token, tutor.id)
      navigate(`/messages?c=${c.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setOpening(false)
    }
  }

  function handleBooked(booking) {
    setJustSent(true)
    setAlreadyBooked(isBookingLive(booking))
  }

  async function handleSaveReview(e) {
    e.preventDefault()
    setError(null)
    setSavingReview(true)
    try {
      const saved = await api.saveReview(token, tutor.id, {
        rating: reviewRating,
        body: reviewBody,
      })
      // Replace your existing review if you had one, otherwise prepend — the
      // endpoint is an upsert, so the same call covers both.
      setTutor((prev) => {
        const rest = (prev.reviews || []).filter((r) => r.id !== saved.id)
        const reviews = [saved, ...rest]
        return {
          ...prev,
          reviews,
          review_count: reviews.length,
          review_average:
            Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10,
        }
      })
      setShowReviewForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingReview(false)
    }
  }

  async function handleDeleteReview(id) {
    setError(null)
    try {
      await api.deleteReview(token, id)
      setTutor((prev) => {
        const reviews = (prev.reviews || []).filter((r) => r.id !== id)
        return {
          ...prev,
          reviews,
          review_count: reviews.length,
          review_average: reviews.length
            ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
            : null,
        }
      })
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <p className="td-empty">Loading...</p>
  if (error && !tutor) return <p className="td-error">{error}</p>
  if (!tutor) return null

  const isSelf = user && Number(tutor.user.id) === Number(user.id)
  // An admin edits on behalf of the seeded tutors, whose accounts have no
  // usable password — the same rule the API enforces in authorizeProfile.
  const canEdit = Boolean(isSelf || user?.is_admin)
  const video = resolveVideo(tutor.video_url)
  const booked = alreadyBooked || justSent
  const resumeEntries = (tutor.resume_entries || []).filter((e) => e.section === resumeTab)
  const reviews = tutor.reviews || []
  const myReview = user ? reviews.find((r) => Number(r.user_id) === Number(user.id)) : null
  const languages = (tutor.languages_spoken || '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean)

  return (
    <div className="td">
      <Link className="td-back" to="/find-tutor">
        &larr; Back to tutors
      </Link>

      {error && <p className="td-error">{error}</p>}

      <div className="td-layout">
        <div className="td-main">
          {/* ---- profile ---- */}
          <section className="td-card td-profile">
            <header className="td-profile-head">
              <span className="td-avatar">
                {tutor.photo_url ? (
                  <img src={tutor.photo_url} alt={tutor.user.name} />
                ) : (
                  <span>{tutor.user.name.charAt(0).toUpperCase()}</span>
                )}
              </span>

              <div className="td-ident">
                <p className="td-name">
                  {tutor.user.name}
                  <span className="td-verified">
                    <VerifiedIcon />
                  </span>
                </p>
                <p className="td-role">{tutor.subjects || 'Chinese Teacher'}</p>
              </div>

              <div className="td-head-actions">
                {canEdit && (
                  <button type="button" className="td-edit" onClick={() => setShowEdit(true)}>
                    <PencilIcon /> Edit profile
                  </button>
                )}
                <button type="button" className="td-bookmark" aria-label="Save this tutor">
                  <BookmarkIcon />
                </button>
              </div>
            </header>

            {tutor.bio && <p className="td-bio">{tutor.bio}</p>}

            <div className="td-meta">
              {tutor.subjects && (
                <span className="td-meta-row">
                  <GradCapIcon /> {tutor.subjects}
                </span>
              )}
              {tutor.languages_spoken && (
                <span className="td-meta-row">
                  <LangIcon /> {tutor.languages_spoken}
                </span>
              )}
              {tutor.availability && (
                <span className="td-meta-row">
                  <ClockIcon /> Availability | ( {tutor.availability} )
                </span>
              )}
            </div>
          </section>

          {/* ---- stats ---- */}
          <section className="td-card td-stats">
            <div className="td-stat">
              <strong>{tutor.review_average ?? '—'}</strong>
              {tutor.review_average ? (
                <Stars count={Math.round(tutor.review_average)} />
              ) : (
                <span>No ratings yet</span>
              )}
            </div>
            <div className="td-stat">
              <strong>{PLACEHOLDER_STATS.students}</strong>
              <span>Students</span>
            </div>
            <div className="td-stat">
              <strong>{PLACEHOLDER_STATS.lessons}</strong>
              <span>Lessons</span>
            </div>
            <div className="td-stat">
              <strong>{PLACEHOLDER_STATS.experience}</strong>
              <span>Experience</span>
            </div>
          </section>

          {/* ---- resume ---- */}
          <section className="td-resume">
            <h2 className="td-h2">Resume</h2>

            <div className="td-tabs" role="tablist">
              {RESUME_SECTIONS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={resumeTab === tab}
                  className={'td-tab' + (resumeTab === tab ? ' active' : '')}
                  onClick={() => setResumeTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {resumeEntries.length === 0 ? (
              <p className="td-empty-inline">
                {canEdit
                  ? `No ${resumeTab.toLowerCase()} added yet — add some from Edit profile.`
                  : `No ${resumeTab.toLowerCase()} listed.`}
              </p>
            ) : (
              <ul className="td-entries">
                {resumeEntries.map((entry) => (
                  <li className="td-entry" key={entry.id}>
                    <span className="td-entry-years">{entry.years}</span>
                    <div>
                      <p className="td-entry-title">{entry.title}</p>
                      {entry.detail && <p className="td-entry-detail">{entry.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- reviews ---- */}
          <section className="td-reviews">
            <div className="td-reviews-head">
              <div>
                <h3 className="td-h3">Review from Students</h3>
                <p className="td-sub">
                  {reviews.length === 0
                    ? 'No reviews yet — be the first to leave one.'
                    : `${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}${
                        tutor.review_average ? ` · ${tutor.review_average} average` : ''
                      }`}
                </p>
              </div>

              {/* Anyone signed in can review, except the tutor themselves —
                  the server enforces that too. */}
              {user && !isSelf && !showReviewForm && (
                <button
                  type="button"
                  className="td-review-add"
                  onClick={() => {
                    setReviewRating(myReview?.rating ?? 5)
                    setReviewBody(myReview?.body ?? '')
                    setShowReviewForm(true)
                  }}
                >
                  {myReview ? 'Edit your review' : 'Write a review'}
                </button>
              )}
            </div>

            {/* Only once there is something to summarise — a distribution over
                zero reviews is five empty bars saying nothing. */}
            {reviews.length > 0 && (
              <ReviewSummary reviews={reviews} average={tutor.review_average} />
            )}

            {showReviewForm && (
              <form className="td-review-form" onSubmit={handleSaveReview}>
                <div className="td-review-rating">
                  <span>Your rating</span>
                  <span className="td-review-stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={'td-star' + (n <= reviewRating ? ' on' : '')}
                        onClick={() => setReviewRating(n)}
                        aria-label={`${n} star${n === 1 ? '' : 's'}`}
                        aria-pressed={n === reviewRating}
                      >
                        ★
                      </button>
                    ))}
                  </span>
                </div>

                <textarea
                  rows={4}
                  maxLength={2000}
                  placeholder="What were the lessons like?"
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  required
                />

                <div className="td-review-actions">
                  <button type="submit" className="td-btn-primary" disabled={savingReview}>
                    {savingReview ? 'Posting…' : myReview ? 'Update review' : 'Post review'}
                  </button>
                  <button
                    type="button"
                    className="td-btn-ghost"
                    onClick={() => setShowReviewForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {reviews.map((r) => (
              <article className="td-review" key={r.id}>
                {/* The reviewer's real picture where there is one, falling back
                    to their initial — an account with no avatar and no tutor
                    photo has no face to show, which is a fact, not a gap. */}
                <span className="td-review-avatar">
                  {r.author_photo_url ? (
                    <img src={r.author_photo_url} alt="" />
                  ) : (
                    (r.user?.name || '?').charAt(0)
                  )}
                </span>
                <div className="td-review-body">
                  <p className="td-review-name">{r.user?.name || 'Someone'}</p>
                  <p className="td-review-meta">
                    <Stars count={r.rating} />
                    {/* When it was written. Reviews carry created_at and it was
                        simply never shown — an undated review gives no way to
                        tell a comment from last week from one from two years
                        ago, which is most of what makes it worth reading. */}
                    <span className="td-review-when">{relativeTime(r.created_at)}</span>
                  </p>
                  <p className="td-review-text">{r.body}</p>
                </div>
                {/* The author can remove their own; an admin can remove any,
                    which is the only moderation this app has. */}
                {(myReview?.id === r.id || user?.is_admin) && (
                  <button
                    type="button"
                    className="td-review-remove"
                    onClick={() => handleDeleteReview(r.id)}
                    aria-label="Delete review"
                  >
                    &times;
                  </button>
                )}
              </article>
            ))}
          </section>

          {/* ---- similar tutors ---- */}
          {others.length > 0 && (
            <section className="td-similar">
              <p className="td-sub">Teacher you may like</p>
              <div className="td-similar-grid">
                {others.map((t) => (
                  <Link className="td-similar-card" to={`/find-tutor/${t.id}`} key={t.id}>
                    <span className="td-similar-cover">
                      {t.photo_url && <img src={t.photo_url} alt="" />}
                    </span>
                    <span className="td-similar-head">
                      <span className="td-similar-avatar">
                        {t.photo_url ? (
                          <img src={t.photo_url} alt="" />
                        ) : (
                          t.user.name.charAt(0).toUpperCase()
                        )}
                      </span>
                      <span className="td-similar-name">{t.user.name}</span>
                      <span className="td-verified sm">
                        <VerifiedIcon />
                      </span>
                    </span>
                    {t.languages_spoken && (
                      <span className="td-similar-lang">
                        <LangIcon /> {t.languages_spoken.split(',')[0]} +1
                      </span>
                    )}
                    {t.bio && <span className="td-similar-bio">{t.bio}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ---- right rail ---- */}
        <aside className="td-side">
          <section className="td-card td-hire">
            <div className="td-video">
              {playing && video ? (
                video.kind === 'embed' ? (
                  <iframe
                    className="td-video-frame"
                    src={video.src}
                    title={`${tutor.user.name} introduction`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video className="td-video-frame" src={video.src} controls autoPlay />
                )
              ) : (
                <>
                  {tutor.photo_url && <img src={tutor.photo_url} alt="" />}
                  <button
                    type="button"
                    className={'td-play' + (video ? '' : ' disabled')}
                    onClick={() => video && setPlaying(true)}
                    disabled={!video}
                    title={video ? 'Play introduction' : 'No introduction video linked yet'}
                    aria-label="Play introduction"
                  >
                    <PlayIcon />
                  </button>
                </>
              )}
            </div>

            {/* The cheapest lesson you can actually book, not the free-text
                rate the tutor typed — those had drifted, and the old number
                matched nothing in the catalogue. "From", because it is the
                bottom of a range. No "/hrs" either: lessons here run 30 or 60
                minutes, so quoting an hourly price against a 30-minute lesson
                was wrong twice over. Falls back to the stated rate for a tutor
                with no priced lessons yet, which is then all there is to go on. */}
            <p className="td-price-row">
              <span className="td-price-label">
                <TagIcon /> {tutor.cheapest_lesson != null ? 'Lessons from' : 'Hourly rate'}
              </span>
              <span className="td-price">
                {tutor.cheapest_lesson != null ? (
                  `$${tutor.cheapest_lesson}`
                ) : (
                  <>
                    ${tutor.hourly_rate ?? '—'}
                    <em>/hrs</em>
                  </>
                )}
              </span>
            </p>

            {/* Having a booking no longer disables this. It used to, back when
                a booking was a one-off contact request — but a student is meant
                to book lesson after lesson with a tutor they like. The only
                thing limited to once is the trial, and that is enforced per
                lesson inside the dialog. */}
            <button
              type="button"
              className="td-btn-primary"
              onClick={() => setShowBooking(true)}
              disabled={isSelf}
            >
              <MessageIcon />
              {isSelf ? 'This is your profile' : booked ? 'Book another lesson' : 'Book a lesson'}
            </button>

            {/* Real messaging now, not a second booking flow. Hidden entirely
                when the tutor has switched off questions from people who have
                not booked — showing a button that only 403s would be worse
                than not offering it. */}
            {!isSelf && (tutor.allows_pre_booking_questions !== false || booked) && (
              <button
                type="button"
                className="td-btn-ghost"
                onClick={messageTutor}
                disabled={opening}
              >
                {opening ? 'Opening…' : 'Message tutor'}
              </button>
            )}

            <p className="td-response">
              <ClockIcon /> Quick Response time
            </p>
          </section>

          <TutorLessonsCard
            className="td-lessons"
            tutor={tutor}
            token={token}
            canEdit={canEdit}
            onBookLesson={() => setShowBooking(true)}
            onOpenCourse={(c) => setOpenCourse(c)}
          />
        </aside>
      </div>

      {showEdit && (
        <TutorEditDrawer
          token={token}
          tutor={tutor}
          onChange={(updated) => setTutor((prev) => ({ ...prev, ...updated }))}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showBooking && (
        <BookingDialog
          token={token}
          tutor={tutor}
          onBooked={handleBooked}
          onClose={() => setShowBooking(false)}
        />
      )}

      {openCourse && (
        <CourseDialog course={openCourse} onClose={() => setOpenCourse(null)} />
      )}
    </div>
  )
}
