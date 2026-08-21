import { useEffect, useState } from 'react'
import { api } from '../api'
import EditDrawer from './EditDrawer'
import ImageCropper from './ImageCropper'

const TABS = ['Profile', 'Resume', 'Lessons']
const SECTIONS = ['Education', 'Certifications']

/**
 * One "Edit profile" button opens this: the whole of a tutor's editable data,
 * split into tabs.
 *
 * Each tab saves against its own endpoint at its own moment rather than the
 * drawer having a single Save — the three things have genuinely different
 * shapes (the profile is one upsert, lessons and resume entries are
 * collections with add/delete), and a batched save could not report a partial
 * failure honestly. `onChange` hands the updated profile back so the page
 * behind the drawer stays in step without a refetch.
 */
export default function TutorEditDrawer({ token, tutor, onChange, onClose }) {
  const [tab, setTab] = useState('Profile')
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)

  // --- profile tab ---
  const [bio, setBio] = useState(tutor.bio || '')
  const [subjects, setSubjects] = useState(tutor.subjects || '')
  const [languages, setLanguages] = useState(tutor.languages_spoken || '')
  const [availability, setAvailability] = useState(tutor.availability || '')
  const [rate, setRate] = useState(tutor.hourly_rate ?? '')
  const [videoUrl, setVideoUrl] = useState(tutor.video_url || '')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [cropSource, setCropSource] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

  // --- resume tab ---
  const [section, setSection] = useState('Education')
  const [years, setYears] = useState('')
  const [entryTitle, setEntryTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [savingEntry, setSavingEntry] = useState(false)

  // --- lessons tab ---
  const [lessonName, setLessonName] = useState('')
  const [lessonDescription, setLessonDescription] = useState('')
  const [lessonPrice, setLessonPrice] = useState('')
  const [savingLesson, setSavingLesson] = useState(false)

  // Object URLs are revoked on replacement so a long editing session does not
  // leak one per photo picked.
  useEffect(() => {
    if (!photo) return setPhotoPreview(null)
    const url = URL.createObjectURL(photo)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  function flash(what) {
    setSaved(what)
    setTimeout(() => setSaved(null), 2200)
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setError(null)
    setSavingProfile(true)
    try {
      const updated = await api.updateTutorProfile(token, tutor.id, {
        bio,
        subjects,
        languages_spoken: languages,
        availability,
        hourly_rate: rate === '' ? '' : Number(rate),
        video_url: videoUrl.trim(),
        photo,
      })
      onChange(updated)
      setPhoto(null)
      flash('Profile saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleAddEntry(e) {
    e.preventDefault()
    setError(null)
    setSavingEntry(true)
    try {
      const entry = await api.addResumeEntry(token, tutor.id, {
        section,
        years,
        title: entryTitle,
        detail,
      })
      onChange({
        ...tutor,
        resume_entries: [...(tutor.resume_entries || []), entry],
      })
      setYears('')
      setEntryTitle('')
      setDetail('')
      flash('Entry added')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingEntry(false)
    }
  }

  async function handleDeleteEntry(id) {
    setError(null)
    try {
      await api.deleteResumeEntry(token, id)
      onChange({
        ...tutor,
        resume_entries: (tutor.resume_entries || []).filter((x) => x.id !== id),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddLesson(e) {
    e.preventDefault()
    setError(null)
    setSavingLesson(true)
    try {
      const lesson = await api.addLesson(token, tutor.id, {
        name: lessonName,
        description: lessonDescription,
        price: Number(lessonPrice),
      })
      onChange({ ...tutor, lessons: [...(tutor.lessons || []), lesson] })
      setLessonName('')
      setLessonDescription('')
      setLessonPrice('')
      flash('Lesson added')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingLesson(false)
    }
  }

  async function handleDeleteLesson(id) {
    setError(null)
    try {
      await api.deleteLesson(token, id)
      onChange({
        ...tutor,
        lessons: (tutor.lessons || []).filter((l) => l.id !== id),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const entries = tutor.resume_entries || []
  const lessons = tutor.lessons || []

  return (
    <EditDrawer
      title="Edit profile"
      subtitle={tutor.user.name}
      tabs={TABS}
      tab={tab}
      onTabChange={setTab}
      onClose={onClose}
      error={error}
      flash={saved}
    >
      {tab === 'Profile' && (
        <form className="ed-form" onSubmit={handleSaveProfile}>
          <div className="ed-photo-row">
            <span className="ed-photo">
              {photoPreview || tutor.photo_url ? (
                <img src={photoPreview || tutor.photo_url} alt="" />
              ) : (
                <span>{tutor.user.name.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <div className="ed-photo-actions">
              <label className="ed-btn-ghost">
                {photo ? 'Choose another' : 'Change photo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files[0] && setCropSource(e.target.files[0])}
                />
              </label>
              {photo && (
                <button type="button" className="ed-btn-ghost" onClick={() => setCropSource(photo)}>
                  Adjust crop
                </button>
              )}
              <p className="ed-hint">
                {photo ? 'Ready — save to upload.' : 'Square-ish images work best.'}
              </p>
            </div>
          </div>

          <label className="ed-field">
            <span>Bio</span>
            <textarea rows={5} value={bio} onChange={(e) => setBio(e.target.value)} />
          </label>

          <label className="ed-field">
            <span>Subjects</span>
            <input
              type="text"
              placeholder="e.g. Mandarin Chinese Teacher"
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
            />
          </label>

          <label className="ed-field">
            <span>Languages spoken</span>
            <input
              type="text"
              placeholder="Comma separated, e.g. Chinese, English"
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
            />
          </label>

          <div className="ed-row">
            <label className="ed-field">
              <span>Availability</span>
              <input
                type="text"
                placeholder="e.g. 9am-12pm, 1pm-7pm"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
              />
            </label>
            <label className="ed-field ed-narrow">
              <span>Rate ($/hr)</span>
              <input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
            </label>
          </div>

          <label className="ed-field">
            <span>Intro video link</span>
            <input
              type="url"
              placeholder="YouTube, Vimeo or a direct .mp4 link"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          </label>

          <button type="submit" className="ed-btn-primary" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      )}

      {tab === 'Resume' && (
        <>
          {SECTIONS.map((s) => {
            const rows = entries.filter((x) => x.section === s)
            return (
              <div className="ed-group" key={s}>
                <p className="ed-group-title">{s}</p>
                {rows.length === 0 ? (
                  <p className="ed-empty">Nothing here yet.</p>
                ) : (
                  <ul className="ed-list">
                    {rows.map((x) => (
                      <li className="ed-item" key={x.id}>
                        <div>
                          <p className="ed-item-title">{x.title}</p>
                          <p className="ed-item-meta">
                            {[x.years, x.detail].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="ed-remove"
                          onClick={() => handleDeleteEntry(x.id)}
                          aria-label={`Delete ${x.title}`}
                        >
                          &times;
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}

          <form className="ed-form ed-add" onSubmit={handleAddEntry}>
            <p className="ed-group-title">Add an entry</p>
            <div className="ed-row">
              <label className="ed-field">
                <span>Section</span>
                <select value={section} onChange={(e) => setSection(e.target.value)}>
                  {SECTIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="ed-field ed-narrow">
                <span>Years</span>
                <input
                  type="text"
                  placeholder="2016 — 2017"
                  value={years}
                  onChange={(e) => setYears(e.target.value)}
                />
              </label>
            </div>
            <label className="ed-field">
              <span>Title</span>
              <input
                type="text"
                placeholder="e.g. Peking University"
                value={entryTitle}
                onChange={(e) => setEntryTitle(e.target.value)}
                required
              />
            </label>
            <label className="ed-field">
              <span>Detail</span>
              <input
                type="text"
                placeholder="e.g. Bachelors Degree"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
              />
            </label>
            <button type="submit" className="ed-btn-primary" disabled={savingEntry}>
              {savingEntry ? 'Adding…' : 'Add entry'}
            </button>
          </form>
        </>
      )}

      {tab === 'Lessons' && (
        <>
          <div className="ed-group">
            <p className="ed-group-title">Current lessons</p>
            {lessons.length === 0 ? (
              <p className="ed-empty">No lessons listed yet.</p>
            ) : (
              <ul className="ed-list">
                {lessons.map((l) => (
                  <li className="ed-item" key={l.id}>
                    <div>
                      <p className="ed-item-title">{l.name}</p>
                      <p className="ed-item-meta">
                        {[l.description, `$${l.price} USD`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ed-remove"
                      onClick={() => handleDeleteLesson(l.id)}
                      aria-label={`Delete ${l.name}`}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="ed-form ed-add" onSubmit={handleAddLesson}>
            <p className="ed-group-title">Add a lesson</p>
            <label className="ed-field">
              <span>Name</span>
              <input
                type="text"
                placeholder="e.g. Trial Lesson"
                value={lessonName}
                onChange={(e) => setLessonName(e.target.value)}
                required
              />
            </label>
            <label className="ed-field">
              <span>Description</span>
              <input
                type="text"
                placeholder="e.g. Includes 4 lessons"
                value={lessonDescription}
                onChange={(e) => setLessonDescription(e.target.value)}
              />
            </label>
            <label className="ed-field ed-narrow">
              <span>Price ($)</span>
              <input
                type="number"
                min="0"
                value={lessonPrice}
                onChange={(e) => setLessonPrice(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="ed-btn-primary" disabled={savingLesson}>
              {savingLesson ? 'Adding…' : 'Add lesson'}
            </button>
          </form>
        </>
      )}
      {cropSource && (
        <ImageCropper
          file={cropSource}
          aspect={1}
          onCancel={() => setCropSource(null)}
          onCrop={(cropped) => {
            setPhoto(cropped)
            setCropSource(null)
          }}
        />
      )}
    </EditDrawer>
  )
}
