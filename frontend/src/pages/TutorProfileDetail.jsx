import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import TutorEditDrawer from '../components/TutorEditDrawer'
import './TutorProfileDetail.css'

/* Figures the API has no field for yet. Kept together and named so they are
   obviously stand-ins rather than data — swap them out as the backend grows
   ratings, lesson counts and a resume. */
const PLACEHOLDER_STATS = { rating: '4.9', students: '268', lessons: '1,229', experience: '5y' }

/* The tab strip is fixed so it stays stable even when one section is empty;
   the entries under it are real rows from the API. */
const RESUME_SECTIONS = ['Education', 'Certifications']

const PLACEHOLDER_REVIEWS = [
  { name: 'Steve Roger', stars: 4, text: "Ping is the best language tutor I've ever had! She ensures you're moving at a pace comfortable to you whilst also maintaining great progress." },
  { name: 'Steve Roger', stars: 4, text: "Ping is the best language tutor I've ever had! She ensures you're moving at a pace comfortable to you whilst also maintaining great progress." },
  { name: 'Steve Roger', stars: 4, text: "Ping is the best language tutor I've ever had! She ensures you're moving at a pace comfortable to you whilst also maintaining great progress." },
]

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
    return /^\d+$/.test(id || '') ? { kind: 'embed', src: `https://player.vimeo.com/video/${id}?autoplay=1` } : null
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
      <path d="M7.6 12.1 10.5 15 16.4 9.1" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="m14.5 6.5 3 3" />
    </svg>
  )
}

function GradCapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4z" />
      <path d="M6 10.5V16c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5.5" />
    </svg>
  )
}

function LangIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h9M7.5 4v2M10 6c0 4-3.5 7-7 7" />
      <path d="M6 10.5c1.5 2 3.5 3.2 5.5 3.7" />
      <path d="m13 20 4-9 4 9M14.4 17h5.2" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="13" rx="2.5" />
      <path d="m4 7 8 5.5L20 7" />
    </svg>
  )
}

function Stars({ count = 4 }) {
  return (
    <span className="td-stars" aria-label={`${count} out of 5`}>
      {'★'.repeat(count)}
    </span>
  )
}

export default function TutorProfileDetail() {
  const { id } = useParams()
  const { token, user } = useAuth()

  const [tutor, setTutor] = useState(null)
  const [others, setOthers] = useState([])
  const [alreadyBooked, setAlreadyBooked] = useState(false)
  const [message, setMessage] = useState('')
  const [showMessageForm, setShowMessageForm] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const [resumeTab, setResumeTab] = useState('Education')
  const [playing, setPlaying] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

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
        setOthers(allTutors.filter((t) => Number(t.id) !== Number(id)).slice(0, 3))
        setAlreadyBooked(
          bookingData.sent.some((b) => Number(b.tutor_id) === Number(tutorData.user_id))
        )
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleRequestBooking(e) {
    e?.preventDefault()
    setError(null)
    setSending(true)
    try {
      await api.createBooking(token, { tutor_id: tutor.user.id, message })
      setJustSent(true)
      setShowMessageForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
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
              <strong>{PLACEHOLDER_STATS.rating}</strong>
              <Stars count={4} />
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
            <h3 className="td-h3">Review from Students</h3>
            <p className="td-sub">These are the reviews who studied with her</p>

            {PLACEHOLDER_REVIEWS.map((r, i) => (
              <article className="td-review" key={i}>
                <span className="td-review-avatar">{r.name.charAt(0)}</span>
                <div>
                  <p className="td-review-name">
                    {r.name} <Stars count={r.stars} />
                  </p>
                  <p className="td-review-text">
                    {r.text} <button type="button" className="td-see-more">See more</button>
                  </p>
                </div>
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

            <p className="td-price-row">
              <span className="td-price-label">
                <TagIcon /> Price per lesson
              </span>
              <span className="td-price">
                ${tutor.hourly_rate ?? '—'}
                <em>/hrs</em>
              </span>
            </p>

            <button
              type="button"
              className="td-btn-primary"
              onClick={handleRequestBooking}
              disabled={isSelf || booked || sending}
            >
              <MessageIcon />
              {isSelf
                ? 'This is your profile'
                : booked
                ? 'Request sent'
                : sending
                ? 'Sending…'
                : 'Book trial lesson'}
            </button>

            <button
              type="button"
              className="td-btn-ghost"
              onClick={() => setShowMessageForm((v) => !v)}
              disabled={isSelf || booked}
            >
              {showMessageForm ? 'Cancel' : 'Send message'}
            </button>

            {showMessageForm && !isSelf && !booked && (
              <form className="td-message-form" onSubmit={handleRequestBooking}>
                <textarea
                  rows={3}
                  placeholder="What would you like to work on?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button type="submit" className="td-btn-primary" disabled={sending}>
                  {sending ? 'Sending…' : 'Send request'}
                </button>
              </form>
            )}

            <p className="td-response">
              <ClockIcon /> Quick Response time
            </p>
          </section>

          <section className="td-card td-lessons">
            <h2 className="td-h2">Lessons</h2>

            {languages.length > 0 && (
              <div className="td-lang-pills">
                {languages.map((l) => (
                  <span className="td-lang-pill" key={l}>
                    {l}
                  </span>
                ))}
              </div>
            )}

            {tutor.lessons.length === 0 ? (
              <p className="td-empty-inline">
                {canEdit ? 'No lessons yet — add one from Edit profile.' : 'No lessons listed yet.'}
              </p>
            ) : (
              <div className="td-lesson-list">
                {tutor.lessons.map((l) => (
                  <div className="td-lesson" key={l.id}>
                    <p className="td-lesson-name">{l.name}</p>
                    {l.description && <p className="td-lesson-desc">{l.description}</p>}
                    <span className="td-lesson-price">${l.price} USD</span>
                  </div>
                ))}
              </div>
            )}
          </section>
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
    </div>
  )
}
