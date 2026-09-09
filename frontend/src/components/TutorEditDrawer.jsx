import { useEffect, useState } from 'react'
import { api } from '../api'
import EditDrawer from './EditDrawer'
import ImageCropper from './ImageCropper'

const TABS = ['Profile', 'Hours', 'Resume', 'Lessons', 'Courses']

/* 0 = Sunday, matching Carbon::dayOfWeek and the day_of_week column. Listed
   Monday-first because that is how a teaching week reads. */
const WEEK = [
  { day: 1, label: 'Monday' },
  { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' },
  { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' },
  { day: 6, label: 'Saturday' },
  { day: 0, label: 'Sunday' },
]

/* Half-hour steps, matching SlotService::STEP_MINUTES. A tutor toggles the
   slots they are free in rather than typing times, so nothing they enter can
   fail to line up with a generated slot. */
const STEP = 30

const PART_BANDS = [
  { key: 'night', label: 'Early', from: 0, to: 6 * 60 },
  { key: 'morning', label: 'Morning', from: 6 * 60, to: 12 * 60 },
  { key: 'afternoon', label: 'Afternoon', from: 12 * 60, to: 17 * 60 },
  { key: 'evening', label: 'Evening', from: 17 * 60, to: 24 * 60 },
]

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

const pad2 = (n) => String(n).padStart(2, '0')

const toHHMM = (min) => pad2(Math.floor(min / 60)) + ':' + pad2(min % 60)

const label12 = (min) => {
  const h = Math.floor(min / 60)
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return h12 + ':' + pad2(min % 60) + ' ' + suffix
}

/**
 * Stored ranges -> the set of chip starts they cover.
 *
 * A range includes every step that still *fits* inside it: 09:00-11:00 covers
 * 09:00, 09:30, 10:00 and 10:30, since 10:30 ends exactly at 11:00. Anything
 * off the half-hour is snapped inward and reported, because silently moving a
 * tutor's saved hours would be worse than telling them.
 */
function rangesToChips(rows) {
  const byDay = {}
  let snapped = false

  for (const row of rows) {
    const day = Number(row.day_of_week)
    const rawStart = toMinutes(row.start_time)
    const rawEnd = toMinutes(row.end_time)
    const start = Math.ceil(rawStart / STEP) * STEP
    const end = Math.floor(rawEnd / STEP) * STEP
    if (start !== rawStart || end !== rawEnd) snapped = true

    byDay[day] = byDay[day] || new Set()
    for (let t = start; t + STEP <= end; t += STEP) byDay[day].add(t)
  }

  return { byDay, snapped }
}

/** Chip starts -> the fewest contiguous ranges that cover them. */
function chipsToRanges(byDay) {
  const out = []
  for (const [day, set] of Object.entries(byDay)) {
    const times = [...set].sort((a, b) => a - b)
    let i = 0
    while (i < times.length) {
      let j = i
      while (j + 1 < times.length && times[j + 1] === times[j] + STEP) j++
      out.push({
        day_of_week: Number(day),
        start_time: toHHMM(times[i]),
        end_time: toHHMM(times[j] + STEP),
      })
      i = j + 1
    }
  }
  return out
}

/* The browser's own zone list where available, so a tutor anywhere can find
   theirs; a short fallback for browsers without Intl.supportedValuesOf. */
const ZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [
      'Asia/Shanghai',
      'Asia/Phnom_Penh',
      'Asia/Tokyo',
      'Europe/London',
      'America/New_York',
      'UTC',
    ]
  }
})()
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

  // --- hours tab ---
  /* The whole week is held locally as a day -> Set of chip starts, and posted
     in one go: the endpoint is a wholesale replace, so the editor must always
     know the complete picture. */
  const [chips, setChips] = useState({})
  const [hoursDay, setHoursDay] = useState(1)
  const [zone, setZone] = useState(
    tutor.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  )
  const [hoursLoaded, setHoursLoaded] = useState(false)
  const [hoursSnapped, setHoursSnapped] = useState(false)
  const [savingHours, setSavingHours] = useState(false)

  // --- courses tab ---
  /* Loaded lazily like the weekly hours: courses are not in the profile payload
     and most edit sessions never open this tab. */
  const [courses, setCourses] = useState([])
  const [coursesLoaded, setCoursesLoaded] = useState(false)
  const [savingCourse, setSavingCourse] = useState(false)
  const [course, setCourse] = useState({
    title: '',
    level: '',
    description: '',
    outcomes: '',
    price: '',
    weeks: '8',
    total_classes: '16',
    classes_per_week: '2',
    minutes_per_class: '60',
    capacity: '10',
    starts_on: '',
    ends_on: '',
    start_time: '19:00',
    end_time: '20:00',
  })
  const [courseDays, setCourseDays] = useState([])

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
  // Fixed steps, matching the server's `in:` rule — a 7-minute lesson would
  // never line up with a generated slot.
  const [lessonDuration, setLessonDuration] = useState('30')
  const [lessonIsTrial, setLessonIsTrial] = useState(false)
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

  // Loaded lazily: most edit sessions never open this tab, and the profile
  // payload does not carry the weekly rows.
  useEffect(() => {
    if (tab !== 'Hours' || hoursLoaded) return
    api
      .getTutorAvailability(token, tutor.id)
      .then((rows) => {
        const { byDay, snapped } = rangesToChips(rows)
        setChips(byDay)
        setHoursSnapped(snapped)
        // Open on a day they already teach, rather than a blank Monday.
        const firstSet = Object.keys(byDay)
          .map(Number)
          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))[0]
        if (firstSet !== undefined) setHoursDay(firstSet)
        setHoursLoaded(true)
      })
      .catch((err) => setError(err.message))
  }, [tab, hoursLoaded, token, tutor.id])

  function toggleChip(day, minutes) {
    setChips((prev) => {
      const next = { ...prev }
      const set = new Set(next[day] || [])
      if (set.has(minutes)) set.delete(minutes)
      else set.add(minutes)
      if (set.size) next[day] = set
      else delete next[day]
      return next
    })
  }

  function clearDay(day) {
    setChips((prev) => {
      const next = { ...prev }
      delete next[day]
      return next
    })
  }

  /* Setting seven days chip by chip is tedious and most tutors keep the same
     hours all week, so one day can be stamped across the others. */
  function copyDayToAll(day) {
    setChips((prev) => {
      const source = prev[day]
      if (!source || source.size === 0) return prev
      const next = {}
      for (const w of WEEK) next[w.day] = new Set(source)
      return next
    })
  }

  /* No start/end validation left to do: chips are fixed half-hour steps, so a
     range that ends before it starts is now unrepresentable rather than
     something the tutor has to be told about. */
  async function handleSaveHours(e) {
    e.preventDefault()
    setError(null)
    setSavingHours(true)
    try {
      const saved = await api.saveTutorAvailability(token, tutor.id, {
        timezone: zone,
        slots: chipsToRanges(chips),
      })
      setChips(rangesToChips(saved).byDay)
      setHoursSnapped(false)
      onChange({ ...tutor, timezone: zone })
      flash('Hours saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingHours(false)
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

  useEffect(() => {
    if (tab !== 'Courses' || coursesLoaded) return
    api
      .getTutorCourses(token, tutor.id)
      .then((rows) => {
        setCourses(rows)
        setCoursesLoaded(true)
      })
      .catch((err) => setError(err.message))
  }, [tab, coursesLoaded, token, tutor.id])

  function setCourseField(key, value) {
    setCourse((prev) => ({ ...prev, [key]: value }))
  }

  function toggleCourseDay(day) {
    setCourseDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    )
  }

  async function handleAddCourse(e) {
    e.preventDefault()
    setError(null)

    /* Caught here as well as server-side so the message names the problem
       rather than arriving as "days_of_week must have at least 1 items". */
    if (courseDays.length === 0) {
      setError('Pick at least one day of the week for this course to run.')
      return
    }
    if (course.end_time <= course.start_time) {
      setError('The class end time must be after its start time.')
      return
    }
    if (course.ends_on < course.starts_on) {
      setError('The course cannot finish before it starts.')
      return
    }

    setSavingCourse(true)
    try {
      const created = await api.addCourse(token, tutor.id, {
        ...course,
        price: Number(course.price),
        weeks: Number(course.weeks),
        total_classes: Number(course.total_classes),
        classes_per_week: Number(course.classes_per_week),
        minutes_per_class: Number(course.minutes_per_class),
        capacity: Number(course.capacity),
        days_of_week: courseDays,
      })
      setCourses((prev) => [...prev, created])
      setCourse((prev) => ({
        ...prev,
        title: '',
        level: '',
        description: '',
        outcomes: '',
        price: '',
        starts_on: '',
        ends_on: '',
      }))
      setCourseDays([])
      flash('Course added')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingCourse(false)
    }
  }

  async function handleDeleteCourse(id) {
    setError(null)
    try {
      await api.deleteCourse(token, id)
      setCourses((prev) => prev.filter((c) => c.id !== id))
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
        duration_minutes: Number(lessonDuration),
        is_trial: lessonIsTrial,
      })
      // Only one lesson can be the trial, and the server moves the flag rather
      // than refusing — mirror that here so the list cannot show two.
      const existing = (tutor.lessons || []).map((l) =>
        lesson.is_trial ? { ...l, is_trial: false } : l,
      )
      onChange({ ...tutor, lessons: [...existing, lesson] })
      setLessonName('')
      setLessonDescription('')
      setLessonPrice('')
      setLessonDuration('30')
      setLessonIsTrial(false)
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

  /* The longest UNBROKEN block in the week, which is the only length that
     matters: a booking has to sit inside one range, so six scattered chips are
     still just six 30-minute openings. `chipsToRanges` already collapses runs,
     so this asks it rather than re-deriving the same thing a second way. */
  const longestBlockMinutes = chipsToRanges(chips).reduce(
    (max, r) => Math.max(max, toMinutes(r.end_time) - toMinutes(r.start_time)),
    0,
  )

  // Only warn once they have set something; an empty week is not a mismatch.
  const unbookableLessons =
    longestBlockMinutes === 0
      ? []
      : lessons.filter((l) => l.duration_minutes > longestBlockMinutes)

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

      {tab === 'Hours' && (
        <form className="ed-form" onSubmit={handleSaveHours}>
          <p className="ed-note">
            Tap the times you are free to teach. Students can only book inside them. The
            &ldquo;Availability&rdquo; line on the Profile tab is just descriptive text and books
            nothing.
          </p>

          {hoursSnapped && (
            <p className="ed-warn">
              Some saved hours did not line up with the half-hour grid and have been trimmed to the
              nearest slot. Check the days below before saving.
            </p>
          )}

          {/* The trap this closes: a lesson can only be booked inside ONE
              unbroken block, so four separate half-hour chips host a 30-minute
              lesson and nothing longer. A tutor who ticks single chips makes
              their own 60-minute lesson unbookable, and the only symptom is an
              empty calendar on the student's side — which reads as the app
              being broken rather than as hours that are too short. Live off the
              chips rather than the saved rows, so it answers while they edit. */}
          {unbookableLessons.length > 0 && (
            <p className="ed-warn">
              Your longest unbroken block is {longestBlockMinutes} minutes, so{' '}
              {unbookableLessons.map((l) => `${l.name} (${l.duration_minutes} min)`).join(', ')}{' '}
              {unbookableLessons.length === 1 ? 'cannot be booked' : 'cannot be booked'} at all —
              students see no times for {unbookableLessons.length === 1 ? 'it' : 'them'}. Tick
              consecutive chips to open a longer block.
            </p>
          )}

          <label className="ed-field">
            <span>Your timezone</span>
            <select value={zone} onChange={(e) => setZone(e.target.value)}>
              {/* The tutor's own zone is what the times below mean. A recurring
                  9am has to stay 9am for them across a daylight-saving change,
                  which is why it is stored per tutor rather than as UTC. */}
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>

          {!hoursLoaded ? (
            <p className="ed-empty">Loading your hours…</p>
          ) : (
            <>
              {/* A day strip rather than seven stacked grids: 48 chips per day
                  times seven would not fit a drawer, and the count badge means
                  an unset day is still obvious without opening it. */}
              <div className="ed-daystrip" role="tablist" aria-label="Choose a day">
                {WEEK.map(({ day, label }) => {
                  const count = chips[day]?.size || 0
                  return (
                    <button
                      key={day}
                      type="button"
                      role="tab"
                      aria-selected={day === hoursDay}
                      className={`ed-daytab${day === hoursDay ? ' active' : ''}`}
                      onClick={() => setHoursDay(day)}
                    >
                      <em>{label.slice(0, 3)}</em>
                      <strong>{count || '—'}</strong>
                    </button>
                  )
                })}
              </div>

              <div className="ed-slots-head">
                <span className="ed-slots-day">
                  {WEEK.find((w) => w.day === hoursDay)?.label}
                  <em>
                    {chips[hoursDay]?.size
                      ? `${chips[hoursDay].size} slot${chips[hoursDay].size === 1 ? '' : 's'}`
                      : 'Not teaching'}
                  </em>
                </span>
                <span className="ed-slots-actions">
                  <button
                    type="button"
                    onClick={() => copyDayToAll(hoursDay)}
                    disabled={!chips[hoursDay]?.size}
                  >
                    Copy to all days
                  </button>
                  <button
                    type="button"
                    onClick={() => clearDay(hoursDay)}
                    disabled={!chips[hoursDay]?.size}
                  >
                    Clear
                  </button>
                </span>
              </div>

              {PART_BANDS.map((band) => {
                const times = []
                for (let t = band.from; t < band.to; t += STEP) times.push(t)
                return (
                  <div className="ed-band" key={band.key}>
                    <p className="ed-band-title">{band.label}</p>
                    <div className="ed-chips">
                      {times.map((t) => {
                        const on = chips[hoursDay]?.has(t)
                        return (
                          <button
                            key={t}
                            type="button"
                            className={`ed-chip${on ? ' on' : ''}`}
                            aria-pressed={on ? 'true' : 'false'}
                            onClick={() => toggleChip(hoursDay, t)}
                          >
                            {label12(t)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          <button type="submit" className="ed-btn-primary" disabled={savingHours || !hoursLoaded}>
            {savingHours ? 'Saving…' : 'Save hours'}
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

      {tab === 'Courses' && (
        <>
          <p className="ed-note">
            A group course is sold whole: you fix the schedule and students accept it, so there is
            no calendar for them to pick from. Price is for the entire run, not per class.
          </p>

          <div className="ed-group">
            <p className="ed-group-title">Current courses</p>
            {!coursesLoaded ? (
              <p className="ed-empty">Loading courses…</p>
            ) : courses.length === 0 ? (
              <p className="ed-empty">No group courses yet.</p>
            ) : (
              <ul className="ed-list">
                {courses.map((c) => (
                  <li className="ed-item" key={c.id}>
                    <div>
                      <p className="ed-item-title">{c.title}</p>
                      <p className="ed-item-meta">
                        {`$${c.price} · ${c.weeks} weeks · ${c.total_classes} classes · ${
                          c.seats_taken ?? c.live_enrollments_count ?? 0
                        }/${c.capacity} enrolled`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ed-remove"
                      onClick={() => handleDeleteCourse(c.id)}
                      aria-label={`Delete ${c.title}`}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="ed-form ed-add" onSubmit={handleAddCourse}>
            <p className="ed-group-title">Add a course</p>

            <label className="ed-field">
              <span>Title</span>
              <input
                type="text"
                placeholder="e.g. HSK 3 Speaking Course"
                value={course.title}
                onChange={(e) => setCourseField('title', e.target.value)}
                required
              />
            </label>

            <div className="ed-row">
              <label className="ed-field">
                <span>Level</span>
                <input
                  type="text"
                  placeholder="e.g. Intermediate · HSK 3"
                  value={course.level}
                  onChange={(e) => setCourseField('level', e.target.value)}
                />
              </label>
              <label className="ed-field ed-narrow">
                <span>Price ($ total)</span>
                <input
                  type="number"
                  min="0"
                  value={course.price}
                  onChange={(e) => setCourseField('price', e.target.value)}
                  required
                />
              </label>
            </div>

            <label className="ed-field">
              <span>Description</span>
              <textarea
                rows={2}
                value={course.description}
                onChange={(e) => setCourseField('description', e.target.value)}
              />
            </label>

            <label className="ed-field">
              <span>What you&rsquo;ll learn — one per line</span>
              <textarea
                rows={4}
                placeholder={'Everyday conversation\nHSK 3 vocabulary\nListening practice'}
                value={course.outcomes}
                onChange={(e) => setCourseField('outcomes', e.target.value)}
              />
            </label>

            <div className="ed-row">
              <label className="ed-field">
                <span>Weeks</span>
                <input
                  type="number"
                  min="1"
                  value={course.weeks}
                  onChange={(e) => setCourseField('weeks', e.target.value)}
                  required
                />
              </label>
              <label className="ed-field">
                <span>Total classes</span>
                <input
                  type="number"
                  min="1"
                  value={course.total_classes}
                  onChange={(e) => setCourseField('total_classes', e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="ed-row">
              <label className="ed-field">
                <span>Classes / week</span>
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={course.classes_per_week}
                  onChange={(e) => setCourseField('classes_per_week', e.target.value)}
                  required
                />
              </label>
              <label className="ed-field">
                <span>Minutes / class</span>
                <input
                  type="number"
                  min="10"
                  value={course.minutes_per_class}
                  onChange={(e) => setCourseField('minutes_per_class', e.target.value)}
                  required
                />
              </label>
              <label className="ed-field ed-narrow">
                <span>Seats</span>
                <input
                  type="number"
                  min="1"
                  value={course.capacity}
                  onChange={(e) => setCourseField('capacity', e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="ed-field">
              <span>Runs on</span>
              {/* Same weekday order and 0=Sunday numbering as the Hours tab. */}
              <div className="ed-daypick">
                {WEEK.map(({ day, label }) => (
                  <button
                    key={day}
                    type="button"
                    className={`ed-daychip${courseDays.includes(day) ? ' on' : ''}`}
                    aria-pressed={courseDays.includes(day) ? 'true' : 'false'}
                    onClick={() => toggleCourseDay(day)}
                  >
                    {label.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <div className="ed-row">
              <label className="ed-field">
                <span>Class starts</span>
                <input
                  type="time"
                  step="900"
                  value={course.start_time}
                  onChange={(e) => setCourseField('start_time', e.target.value)}
                  required
                />
              </label>
              <label className="ed-field">
                <span>Class ends</span>
                <input
                  type="time"
                  step="900"
                  value={course.end_time}
                  onChange={(e) => setCourseField('end_time', e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="ed-row">
              <label className="ed-field">
                <span>First class</span>
                <input
                  type="date"
                  value={course.starts_on}
                  onChange={(e) => setCourseField('starts_on', e.target.value)}
                  required
                />
              </label>
              <label className="ed-field">
                <span>Last class</span>
                <input
                  type="date"
                  value={course.ends_on}
                  onChange={(e) => setCourseField('ends_on', e.target.value)}
                  required
                />
              </label>
            </div>

            <button type="submit" className="ed-btn-primary" disabled={savingCourse}>
              {savingCourse ? 'Adding…' : 'Add course'}
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
            <label className="ed-field ed-narrow">
              <span>Length</span>
              <select value={lessonDuration} onChange={(e) => setLessonDuration(e.target.value)}>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">120 minutes</option>
              </select>
            </label>
            <label className="ed-check">
              <input
                type="checkbox"
                checked={lessonIsTrial}
                onChange={(e) => setLessonIsTrial(e.target.checked)}
              />
              <span>
                This is the trial lesson
                <em>
                  Students can book it once. Marking this moves the flag off any other lesson.
                </em>
              </span>
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
