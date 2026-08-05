import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import './FindTutor.css'

export default function TutorProfileDetail() {
  const { id } = useParams()
  const { token, user } = useAuth()

  const [tutor, setTutor] = useState(null)
  const [alreadyBooked, setAlreadyBooked] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [justSent, setJustSent] = useState(false)

  const [showLessonForm, setShowLessonForm] = useState(false)
  const [lessonName, setLessonName] = useState('')
  const [lessonDescription, setLessonDescription] = useState('')
  const [lessonPrice, setLessonPrice] = useState('')
  const [savingLesson, setSavingLesson] = useState(false)

  useEffect(() => {
    loadTutor()
  }, [token, id])

  function loadTutor() {
    setLoading(true)
    Promise.all([api.getTutor(token, id), api.getBookings(token)])
      .then(([tutorData, bookingData]) => {
        setTutor(tutorData)
        setAlreadyBooked(
          bookingData.sent.some((b) => Number(b.tutor_id) === Number(tutorData.user_id))
        )
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleRequestBooking(e) {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      await api.createBooking(token, { tutor_id: tutor.user.id, message })
      setJustSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  async function handleAddLesson(e) {
    e.preventDefault()
    setError(null)
    setSavingLesson(true)
    try {
      const lesson = await api.addLesson(token, {
        name: lessonName,
        description: lessonDescription,
        price: Number(lessonPrice),
      })
      setTutor((prev) => ({ ...prev, lessons: [...prev.lessons, lesson] }))
      setLessonName('')
      setLessonDescription('')
      setLessonPrice('')
      setShowLessonForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingLesson(false)
    }
  }

  async function handleDeleteLesson(lessonId) {
    setError(null)
    try {
      await api.deleteLesson(token, lessonId)
      setTutor((prev) => ({ ...prev, lessons: prev.lessons.filter((l) => l.id !== lessonId) }))
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <p>Loading...</p>
  if (error && !tutor) return <p className="ft-error">{error}</p>
  if (!tutor) return null

  const isSelf = user && Number(tutor.user.id) === Number(user.id)

  return (
    <div className="ft">
      <Link className="ft-back-link" to="/find-tutor">
        &larr; Back to tutors
      </Link>

      <div className="ft-detail-card">
        {tutor.photo_url ? (
          <img className="ft-detail-photo" src={tutor.photo_url} alt={tutor.user.name} />
        ) : (
          <div className="ft-detail-photo-placeholder">
            {tutor.user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="ft-title">{tutor.user.name}</h1>
          {tutor.hourly_rate != null && <p className="ft-card-rate">${tutor.hourly_rate}/hr</p>}
          {tutor.bio && <p className="ft-card-bio">{tutor.bio}</p>}
          <div className="ft-tags">
            {tutor.subjects && <span className="ft-tag">&#127891; {tutor.subjects}</span>}
            {tutor.languages_spoken && (
              <span className="ft-tag">&#128483; {tutor.languages_spoken}</span>
            )}
            {tutor.availability && <span className="ft-tag">&#128337; {tutor.availability}</span>}
          </div>
        </div>
      </div>

      {error && <p className="ft-error">{error}</p>}

      <h2 className="ft-section-title">Lessons</h2>
      {tutor.lessons.length === 0 ? (
        <p className="ft-empty">No lessons listed yet.</p>
      ) : (
        <div className="ft-lessons-list">
          {tutor.lessons.map((l) => (
            <div className="ft-lesson-row" key={l.id}>
              <div>
                <p className="ft-lesson-name">{l.name}</p>
                {l.description && <p className="ft-lesson-description">{l.description}</p>}
              </div>
              <span className="ft-lesson-price">${l.price} USD</span>
              {isSelf && (
                <button
                  type="button"
                  className="ft-btn-secondary"
                  onClick={() => handleDeleteLesson(l.id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isSelf && (
        <>
          <button
            type="button"
            className="ft-profile-toggle"
            onClick={() => setShowLessonForm((v) => !v)}
          >
            {showLessonForm ? 'Cancel' : 'Add a lesson'}
          </button>

          {showLessonForm && (
            <form className="ft-form" onSubmit={handleAddLesson}>
              <div>
                <label>Name</label>
                <input
                  type="text"
                  placeholder="e.g. Trial Lesson"
                  value={lessonName}
                  onChange={(e) => setLessonName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Description</label>
                <input
                  type="text"
                  placeholder="e.g. Includes 4 lessons"
                  value={lessonDescription}
                  onChange={(e) => setLessonDescription(e.target.value)}
                />
              </div>
              <div>
                <label>Price ($)</label>
                <input
                  type="number"
                  min="0"
                  value={lessonPrice}
                  onChange={(e) => setLessonPrice(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="ft-btn-primary" disabled={savingLesson}>
                {savingLesson ? 'Saving...' : 'Add lesson'}
              </button>
            </form>
          )}
        </>
      )}

      <h2 className="ft-section-title">Request a lesson</h2>
      {isSelf ? (
        <p className="ft-card-self">This is your profile.</p>
      ) : alreadyBooked || justSent ? (
        <p className="ft-card-sent">You've already sent a booking request to this tutor.</p>
      ) : (
        <form className="ft-form" onSubmit={handleRequestBooking}>
          <div>
            <label>Message</label>
            <textarea
              placeholder="What would you like to work on?"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <button type="submit" className="ft-btn-primary" disabled={sending}>
            {sending ? 'Sending...' : 'Request booking'}
          </button>
        </form>
      )}
    </div>
  )
}
