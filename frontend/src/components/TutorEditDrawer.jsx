import { useEffect, useState } from 'react'
import { api } from '../api'
import EditDrawer from './EditDrawer'
import ImageCropper from './ImageCropper'
import TutorFitFields from './TutorFitFields'
import { youtubeVideoId } from '../tutorVideo'
import { confirmDelete } from '../components/ConfirmDelete'

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

/* Half-hour steps, matching SlotService::STEP_MINUTES — the times offered in
   the pick-lists below, so nothing a tutor can choose fails to line up with a
   generated slot. */
const STEP = 30

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

/* Every half hour as a pick-list value, plus 24:00 so a day can end at
   midnight. Half hours rather than Google Calendar's quarter hours because
   SlotService offers starts every 30 minutes — a 6:45 opening would sit off
   the grid every other tutor's times land on. */
const TIME_CHOICES = (() => {
  const out = []
  for (let m = 0; m <= 24 * 60; m += STEP) out.push(toHHMM(m))
  return out
})()

/* Postgres returns a `time` column as "09:00:00" while SQLite hands back the
   "09:00" it was given. Both have to select the same option. */
const hhmm = (t) => String(t).slice(0, 5)

/** The choices, plus whatever is saved if an old row sits off the half hour.
 *  Including it beats snapping: the tutor's real hours round-trip untouched,
 *  which is why the "we trimmed your hours" warning could be deleted. */
function timeChoices(current) {
  if (!current || TIME_CHOICES.includes(current)) return TIME_CHOICES
  return [...TIME_CHOICES, current].sort()
}

/** API rows -> { day: [{start, end}] }, the shape the editor edits directly. */
function groupByDay(rows) {
  const byDay = {}
  for (const row of rows) {
    const day = Number(row.day_of_week)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push({ start: hhmm(row.start_time), end: hhmm(row.end_time) })
  }
  for (const day of Object.keys(byDay)) {
    byDay[day].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  }
  return byDay
}

/** Ranges that overlap or touch become one, so "9-10" plus "9:30-11" saves as
 *  "9-11" rather than as two rows that would offer the same times twice. */
function mergeRanges(list) {
  const out = []
  for (const r of [...list].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))) {
    const last = out[out.length - 1]
    if (last && toMinutes(r.start) <= toMinutes(last.end)) {
      if (toMinutes(r.end) > toMinutes(last.end)) last.end = r.end
    } else {
      out.push({ ...r })
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

function profileDraftSignature({
  shortBio,
  bio,
  subjects,
  teachesLevels,
  specialties,
  teachingLanguages,
  availability,
  rate,
  videoUrl,
}) {
  return JSON.stringify({
    shortBio,
    bio,
    subjects,
    teachesLevels,
    specialties,
    teachingLanguages,
    availability,
    rate: String(rate ?? ''),
    videoUrl,
  })
}

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
function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  )
}

export default function TutorEditDrawer({ token, tutor, onChange, onClose }) {
  const [tab, setTab] = useState('Profile')
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)

  // --- profile tab ---
  const [shortBio, setShortBio] = useState(tutor.short_bio || '')
  const [bio, setBio] = useState(tutor.bio || '')
  const [subjects, setSubjects] = useState(tutor.subjects || '')
  const [teachesLevels, setTeachesLevels] = useState(tutor.teaches_levels || [])
  const [specialties, setSpecialties] = useState(tutor.specialties || [])
  const [teachingLanguages, setTeachingLanguages] = useState(tutor.teaching_languages || [])
  // Kept only to resend unchanged: the field left the form (see Hours tab).
  const availability = tutor.availability || ''
  const [rate] = useState(tutor.hourly_rate ?? '')
  const [videoUrl, setVideoUrl] = useState(tutor.video_url || '')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [cropSource, setCropSource] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileBaseline, setProfileBaseline] = useState(() => profileDraftSignature({
    shortBio: tutor.short_bio || '',
    bio: tutor.bio || '',
    subjects: tutor.subjects || '',
    teachesLevels: tutor.teaches_levels || [],
    specialties: tutor.specialties || [],
    teachingLanguages: tutor.teaching_languages || [],
    availability: tutor.availability || '',
    rate: tutor.hourly_rate ?? '',
    videoUrl: tutor.video_url || '',
  }))

  // --- hours tab ---
  /* The whole week as `day -> [{start, end}]`, posted in one go: the endpoint
     is a wholesale replace, so the editor must always know the complete
     picture. This is the same shape `tutor_availability` stores, which is what
     let the two chip-conversion functions be deleted rather than rewritten. */
  const [hours, setHours] = useState({})
  const [hoursDay, setHoursDay] = useState(1)
  const [zone, setZone] = useState(
    tutor.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  )
  const [hoursLoaded, setHoursLoaded] = useState(false)
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

  /* Which row the add form is currently EDITING (null = adding a new one).
     The pencil loads a row into the same form rather than opening a second
     editor, so there is one place per list to change things. */
  const [editingEntryId, setEditingEntryId] = useState(null)
  const [editingLessonId, setEditingLessonId] = useState(null)
  const [editingCourseId, setEditingCourseId] = useState(null)


  // Object URLs are revoked on replacement so a long editing session does not
  // leak one per photo picked.
  useEffect(() => {
    if (!photo) return setPhotoPreview(null)
    const url = URL.createObjectURL(photo)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const currentProfileSignature = profileDraftSignature({
    shortBio,
    bio,
    subjects,
    teachesLevels,
    specialties,
    teachingLanguages,
    availability,
    rate,
    videoUrl,
  })
  const profileDirty = Boolean(photo) || currentProfileSignature !== profileBaseline

  useEffect(() => {
    if (!profileDirty) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [profileDirty])

  function requestClose() {
    if (savingProfile) return
    if (profileDirty && !window.confirm('You have unsaved profile changes. Close without saving?')) return
    onClose()
  }

  function flash(what) {
    setSaved(what)
    setTimeout(() => setSaved(null), 2200)
  }

  async function openPhotoCropper() {
    if (photo) {
      setCropSource(photo)
      return
    }

    if (!tutor.photo_url) return

    setError(null)
    try {
      /* Reopen the already-saved image as a File so the same drag-and-zoom
         cropper works for a current photo as well as a newly selected one. */
      const response = await fetch(tutor.photo_url)
      if (!response.ok) throw new Error('Photo could not be loaded')
      const blob = await response.blob()
      setCropSource(new File([blob], 'profile-photo.jpg', {
        type: blob.type || 'image/jpeg',
      }))
    } catch {
      setError('We could not open the current photo. Choose it again to adjust it.')
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setError(null)
    if (videoUrl.trim() && !youtubeVideoId(videoUrl)) {
      setError('Enter a valid public or unlisted YouTube video link.')
      return
    }
    setSavingProfile(true)
    try {
      await api.updateTutorProfile(token, tutor.id, {
        short_bio: shortBio,
        bio,
        subjects,
        availability,
        hourly_rate: rate === '' ? '' : Number(rate),
        video_url: videoUrl.trim(),
        photo,
      })
      const updated = await api.updateTutorSpecialties(token, tutor.id, {
        teaches_levels: teachesLevels,
        specialties,
        main_specialty: specialties.includes(tutor.main_specialty)
          ? tutor.main_specialty
          : (specialties[0] || null),
        teaching_languages: teachingLanguages,
      })
      onChange(updated)
      setPhoto(null)
      setProfileBaseline(currentProfileSignature)
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
        const byDay = groupByDay(rows)
        setHours(byDay)
        // Open on a day they already teach, rather than a blank Monday.
        const firstSet = Object.keys(byDay)
          .map(Number)
          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))[0]
        if (firstSet !== undefined) setHoursDay(firstSet)
        setHoursLoaded(true)
      })
      .catch((err) => setError(err.message))
  }, [tab, hoursLoaded, token, tutor.id])

  function setRange(day, index, patch) {
    setHours((prev) => {
      const rows = [...(prev[day] || [])]
      const next = { ...rows[index], ...patch }
      /* Moving the start past the end would make an impossible range, so the
         end follows it. Cheaper than telling someone off for a combination the
         editor let them pick. */
      if (toMinutes(next.end) <= toMinutes(next.start)) {
        next.end = toHHMM(Math.min(24 * 60, toMinutes(next.start) + STEP))
      }
      rows[index] = next
      return { ...prev, [day]: rows }
    })
  }

  /* A new row starts where the last one ended, which is almost always what a
     teacher means by "and another time". A blank day gets a sensible evening
     hour rather than 00:00, which nobody wants and everybody has to change. */
  function addRange(day) {
    setHours((prev) => {
      const rows = prev[day] || []
      const last = rows[rows.length - 1]
      const start = last ? Math.min(23 * 60 + 30, toMinutes(last.end) + STEP) : 18 * 60
      return {
        ...prev,
        [day]: [...rows, { start: toHHMM(start), end: toHHMM(Math.min(24 * 60, start + 60)) }],
      }
    })
  }

  function removeRange(day, index) {
    setHours((prev) => {
      const rows = (prev[day] || []).filter((_, i) => i !== index)
      const next = { ...prev }
      if (rows.length) next[day] = rows
      else delete next[day]
      return next
    })
  }

  function clearDay(day) {
    setHours((prev) => {
      const next = { ...prev }
      delete next[day]
      return next
    })
  }

  /* Setting seven days chip by chip is tedious and most tutors keep the same
     hours all week, so one day can be stamped across the others. */
  function copyDayToAll(day) {
    setHours((prev) => {
      const source = prev[day]
      if (!source || source.length === 0) return prev
      const next = {}
      for (const w of WEEK) next[w.day] = source.map((r) => ({ ...r }))
      return next
    })
  }

  /* Still no start/end validation to do, which was the one genuinely good
     property of the chip grid and is kept: the "to" list only offers times
     later than the "from", and moving the "from" past the "to" drags the "to"
     with it, so a backwards range cannot be expressed rather than being
     something the teacher gets told off about after the fact. */
  async function handleSaveHours(e) {
    e.preventDefault()
    setError(null)
    setSavingHours(true)
    try {
      const saved = await api.saveTutorAvailability(token, tutor.id, {
        timezone: zone,
        slots: Object.entries(hours).flatMap(([day, rows]) =>
          mergeRanges(rows).map((r) => ({
            day_of_week: Number(day),
            start_time: r.start,
            end_time: r.end,
          })),
        ),
      })
      // Re-seeded from what was actually stored, so a merge is visible at once.
      setHours(groupByDay(saved))
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
      const body = { section, years, title: entryTitle, detail }
      // The same form adds and edits: a pencil press loads a row into it.
      const entry = editingEntryId
        ? await api.updateResumeEntry(token, editingEntryId, body)
        : await api.addResumeEntry(token, tutor.id, body)
      const list = tutor.resume_entries || []
      onChange({
        ...tutor,
        resume_entries: editingEntryId
          ? list.map((x) => (x.id === editingEntryId ? entry : x))
          : [...list, entry],
      })
      setYears('')
      setEntryTitle('')
      setDetail('')
      flash(editingEntryId ? 'Entry updated' : 'Entry added')
      setEditingEntryId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingEntry(false)
    }
  }

  function startEditEntry(x) {
    setEditingEntryId(x.id)
    setSection(x.section)
    setYears(x.years || '')
    setEntryTitle(x.title || '')
    setDetail(x.detail || '')
  }

  function cancelEditEntry() {
    setEditingEntryId(null)
    setYears('')
    setEntryTitle('')
    setDetail('')
  }

  async function handleDeleteEntry(id) {
    if (!(await confirmDelete({ title: "Delete this resume entry?" }))) return
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
      const body = {
        ...course,
        price: Number(course.price),
        weeks: Number(course.weeks),
        total_classes: Number(course.total_classes),
        classes_per_week: Number(course.classes_per_week),
        minutes_per_class: Number(course.minutes_per_class),
        capacity: Number(course.capacity),
        days_of_week: courseDays,
      }
      const saved = editingCourseId
        ? await api.updateCourse(token, editingCourseId, body)
        : await api.addCourse(token, tutor.id, body)
      setCourses((prev) =>
        editingCourseId ? prev.map((c) => (c.id === editingCourseId ? saved : c)) : [...prev, saved],
      )
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
      flash(editingCourseId ? 'Course updated' : 'Course added')
      setEditingCourseId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingCourse(false)
    }
  }

  // Times come back from Postgres as "19:00:00"; the pick-lists hold "19:00".
  const hm = (v) => (v ? String(v).slice(0, 5) : '')

  function startEditCourse(c) {
    setEditingCourseId(c.id)
    setCourse({
      title: c.title || '',
      level: c.level || '',
      description: c.description || '',
      outcomes: c.outcomes || '',
      price: String(c.price ?? ''),
      weeks: String(c.weeks ?? ''),
      total_classes: String(c.total_classes ?? ''),
      classes_per_week: String(c.classes_per_week ?? ''),
      minutes_per_class: String(c.minutes_per_class ?? ''),
      capacity: String(c.capacity ?? ''),
      starts_on: (c.starts_on || '').slice(0, 10),
      ends_on: (c.ends_on || '').slice(0, 10),
      start_time: hm(c.start_time),
      end_time: hm(c.end_time),
    })
    setCourseDays([...(c.days_of_week || [])].map(Number).sort((a, b) => a - b))
  }

  function cancelEditCourse() {
    setEditingCourseId(null)
    setCourse((prev) => ({ ...prev, title: '', level: '', description: '', outcomes: '', price: '', starts_on: '', ends_on: '' }))
    setCourseDays([])
  }

  async function handleDeleteCourse(id) {
    if (!(await confirmDelete({ title: "Delete this course?", text: "Students already enrolled keep their place in it." }))) return
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
      const body = {
        name: lessonName,
        description: lessonDescription,
        price: Number(lessonPrice),
        duration_minutes: Number(lessonDuration),
        is_trial: lessonIsTrial,
      }
      const lesson = editingLessonId
        ? await api.updateLesson(token, editingLessonId, body)
        : await api.addLesson(token, tutor.id, body)
      // Only one lesson can be the trial, and the server moves the flag rather
      // than refusing — mirror that here so the list cannot show two.
      const others = (tutor.lessons || [])
        .filter((l) => l.id !== lesson.id)
        .map((l) => (lesson.is_trial ? { ...l, is_trial: false } : l))
      const lessonsNext = editingLessonId
        ? (tutor.lessons || []).map((l) => (l.id === lesson.id ? lesson : others.find((o) => o.id === l.id) || l))
        : [...others, lesson]
      onChange({ ...tutor, lessons: lessonsNext })
      setLessonName('')
      setLessonDescription('')
      setLessonPrice('')
      setLessonDuration('30')
      setLessonIsTrial(false)
      flash(editingLessonId ? 'Lesson updated' : 'Lesson added')
      setEditingLessonId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingLesson(false)
    }
  }

  function startEditLesson(l) {
    setEditingLessonId(l.id)
    setLessonName(l.name || '')
    setLessonDescription(l.description || '')
    setLessonPrice(String(l.price ?? ''))
    setLessonDuration(String(l.duration_minutes || 30))
    setLessonIsTrial(Boolean(l.is_trial))
  }

  function cancelEditLesson() {
    setEditingLessonId(null)
    setLessonName('')
    setLessonDescription('')
    setLessonPrice('')
    setLessonDuration('30')
    setLessonIsTrial(false)
  }

  async function handleDeleteLesson(id) {
    if (!(await confirmDelete({ title: "Delete this lesson?", text: "Lessons already booked are not affected." }))) return
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

  /* Each row IS an opening now, so none of this has to be reconstructed from
     ticked boxes — the editor holds the same shape the table stores. */
  const dayRanges = (day) => hours[day] || []

  const rangeMinutes = (r) => toMinutes(r.end) - toMinutes(r.start)

  const minutesOpenOn = (day) => dayRanges(day).reduce((sum, r) => sum + rangeMinutes(r), 0)

  /* A lesson has to fit inside ONE opening, so the longest single one is what
     decides whether the long lessons are bookable at all. Six scattered half
     hours are still six half hours. */
  const longestBlockMinutes = Object.values(hours)
    .flat()
    .reduce((max, r) => Math.max(max, rangeMinutes(r)), 0)

  // Only warn once they have set something; an empty week is not a mismatch.
  const unbookableLessons =
    longestBlockMinutes === 0
      ? []
      : lessons.filter((l) => l.duration_minutes > longestBlockMinutes)

  const fitsIn = (r) => lessons.filter((l) => l.duration_minutes <= rangeMinutes(r))

  /* "1h 30m", not "90 minutes" — a teacher reads their week in hours, and the
     day tabs have room for four characters. */
  const readableLength = (mins) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (!h) return `${m}m`
    return m ? `${h}h ${m}m` : `${h}h`
  }

  return (
    <EditDrawer
      title="Edit profile"
      subtitle={tutor.user.name}
      tabs={TABS}
      tab={tab}
      onTabChange={setTab}
      onClose={requestClose}
      error={error}
      flash={saved}
      busy={savingProfile || savingHours || savingCourse || savingEntry || savingLesson}
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
              {(photo || tutor.photo_url) && (
                <button type="button" className="ed-btn-ghost" onClick={openPhotoCropper}>
                  {photo ? 'Adjust crop' : 'Adjust current photo'}
                </button>
              )}
              <p className="ed-hint">
                {photo
                  ? 'Ready — save to upload.'
                  : 'Adjust the crop and zoom to frame your photo better.'}
              </p>
            </div>
          </div>

          <label className="ed-field">
            <span>Short introduction</span>
            {/* ONE sentence: a single-line box, 120 characters. The server
                refuses a second sentence too. */}
            <input
              type="text"
              maxLength={120}
              value={shortBio}
              onChange={(e) => setShortBio(e.target.value)}
            />
            <small className="ed-hint">
              One sentence · {shortBio.length}/120. This appears at the top of your tutor card.
            </small>
          </label>

          <label className="ed-field">
            <span>About you</span>
            <textarea
              rows={5}
              maxLength={800}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            <small className="ed-hint">
              {bio.length}/800 characters. Students see a short preview and can read the full introduction.
            </small>
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

          <TutorFitFields
            value={{
              teaches_levels: teachesLevels,
              specialties,
              teaching_languages: teachingLanguages,
            }}
            options={{
              teaches_levels: tutor.teaches_level_options || [],
              specialties: tutor.specialty_options || [],
              teaching_languages: tutor.teaching_language_options || [],
            }}
            onChange={(patch) => {
              if (patch.teaches_levels) setTeachesLevels(patch.teaches_levels)
              if (patch.specialties) setSpecialties(patch.specialties)
              if (patch.teaching_languages) setTeachingLanguages(patch.teaching_languages)
            }}
          />

          {/* The free-text availability line is gone: it made no bookable
              time. What students see now comes from the Hours tab. */}
          {/* No Rate field: students pay each lesson's own price (Lessons tab),
              and a typed hourly rate only drifted from those prices. The
              stored value is still sent back unchanged on save. */}

          <label className="ed-field">
            <span>Introduction video (YouTube)</span>
            <input
              type="text"
              inputMode="url"
              placeholder="https://youtu.be/…"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
            <small className="ed-hint">Paste a public or unlisted YouTube video link to introduce yourself to students.</small>
          </label>

          <button type="submit" className="ed-btn-primary" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      )}

      {tab === 'Hours' && (
        <form className="ed-form" onSubmit={handleSaveHours}>
          <p className="ed-note">
            Set the times you are free, and students book inside them. The
            &ldquo;Availability&rdquo; line on the Profile tab is only a description and books
            nothing.
          </p>

          {/* The one thing a teacher can get wrong here, said in the lengths
              they already think in and never in the word "block". A lesson has
              to fit inside ONE opening, so a day of scattered half hours hosts
              a 30-minute lesson and nothing longer — and the only symptom used
              to be an empty calendar on the student's side, which reads as the
              app being broken. Computed live, so it answers while they edit. */}
          {unbookableLessons.length > 0 && (
            <p className="ed-warn">
              Your longest single opening is {readableLength(longestBlockMinutes)}, so{' '}
              {unbookableLessons
                .map((l) => `${l.name} (${readableLength(l.duration_minutes)})`)
                .join(' and ')}{' '}
              {unbookableLessons.length === 1 ? 'is' : 'are'} not bookable — nobody can see{' '}
              {unbookableLessons.length === 1 ? 'it' : 'them'}. Make one opening long enough to
              hold {unbookableLessons.length === 1 ? 'it' : 'them'} in one go.
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
              {/* One day at a time: seven days of rows at once is a wall, and
                  the badge carries how much time is open so an unset day is
                  obvious without opening it. Hours, never a count of controls —
                  "5" was a count of ticked boxes and could mean five scattered
                  half hours that fit nothing longer than 30 minutes. */}
              <div className="ed-daystrip" role="tablist" aria-label="Choose a day">
                {WEEK.map(({ day, label }) => {
                  const open = minutesOpenOn(day)
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
                      <strong>{open ? readableLength(open) : '—'}</strong>
                    </button>
                  )
                })}
              </div>

              <div className="ed-slots-head">
                <span className="ed-slots-day">
                  {WEEK.find((w) => w.day === hoursDay)?.label}
                  <em>
                    {minutesOpenOn(hoursDay)
                      ? `${readableLength(minutesOpenOn(hoursDay))} open`
                      : 'Not teaching'}
                  </em>
                </span>
                <span className="ed-slots-actions">
                  <button
                    type="button"
                    onClick={() => copyDayToAll(hoursDay)}
                    disabled={dayRanges(hoursDay).length === 0}
                  >
                    Copy to all days
                  </button>
                  <button
                    type="button"
                    onClick={() => clearDay(hoursDay)}
                    disabled={dayRanges(hoursDay).length === 0}
                  >
                    Clear
                  </button>
                </span>
              </div>

              {/* Google Calendar's shape, which is what the table already
                  stores: a start, an end, and a + for another. The length is
                  the thing you just picked rather than something to work out
                  from how many boxes are lit, and an impossible range cannot be
                  chosen because the "to" list only offers later times. */}
              {dayRanges(hoursDay).length === 0 ? (
                <p className="ed-empty">
                  Not teaching on {WEEK.find((w) => w.day === hoursDay)?.label}. Add a time to
                  open it.
                </p>
              ) : (
                <ul className="ed-ranges">
                  {dayRanges(hoursDay).map((r, i) => {
                    const fits = fitsIn(r)
                    return (
                      <li className="ed-range" key={i}>
                        <select
                          className="ed-range-time"
                          value={r.start}
                          aria-label="From"
                          onChange={(e) => setRange(hoursDay, i, { start: e.target.value })}
                        >
                          {timeChoices(r.start)
                            .filter((t) => t !== '24:00')
                            .map((t) => (
                              <option key={t} value={t}>
                                {label12(toMinutes(t))}
                              </option>
                            ))}
                        </select>

                        <span className="ed-range-to">to</span>

                        <select
                          className="ed-range-time"
                          value={r.end}
                          aria-label="To"
                          onChange={(e) => setRange(hoursDay, i, { end: e.target.value })}
                        >
                          {timeChoices(r.end)
                            .filter((t) => toMinutes(t) > toMinutes(r.start))
                            .map((t) => (
                              <option key={t} value={t}>
                                {t === '24:00' ? 'midnight' : label12(toMinutes(t))}
                              </option>
                            ))}
                        </select>

                        <span className="ed-range-len">{readableLength(rangeMinutes(r))}</span>

                        {/* What this opening can actually hold. The whole point
                            of the tab, answered per row rather than left as
                            arithmetic. */}
                        <span className={'ed-range-fits' + (fits.length ? '' : ' none')}>
                          {lessons.length === 0
                            ? ''
                            : fits.length === lessons.length
                              ? 'fits every lesson'
                              : fits.length
                                ? `fits ${fits.map((l) => l.name).join(', ')}`
                                : 'too short for any lesson'}
                        </span>

                        <button
                          type="button"
                          className="ed-range-remove"
                          aria-label="Remove this time"
                          onClick={() => removeRange(hoursDay, i)}
                        >
                          &times;
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              <button type="button" className="ed-range-add" onClick={() => addRange(hoursDay)}>
                + Add a time
              </button>
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
<div className="ed-item-actions">
                      <button
                        type="button"
                        className="ed-item-btn"
                        onClick={() => startEditEntry(x)}
                        aria-label={`Edit ${x.title}`}
                        title="Edit"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="ed-item-btn ed-item-btn-del"
                        onClick={() => handleDeleteEntry(x.id)}
                        aria-label={`Delete ${x.title}`}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}

          <form
            className={`ed-form ed-add${editingEntryId ? ' ed-editing' : ''}`}
            onSubmit={handleAddEntry}
          >
            <p className="ed-group-title">{editingEntryId ? 'Edit entry' : 'Add an entry'}</p>
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
              {savingEntry ? 'Saving…' : editingEntryId ? 'Save changes' : 'Add entry'}
            </button>
            {editingEntryId && (
              <button type="button" className="ed-btn-ghost" onClick={cancelEditEntry}>
                Cancel
              </button>
            )}
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
<div className="ed-item-actions">
                      <button
                        type="button"
                        className="ed-item-btn"
                        onClick={() => startEditCourse(c)}
                        aria-label={`Edit ${c.title}`}
                        title="Edit"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="ed-item-btn ed-item-btn-del"
                        onClick={() => handleDeleteCourse(c.id)}
                        aria-label={`Delete ${c.title}`}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form
            className={`ed-form ed-add${editingCourseId ? ' ed-editing' : ''}`}
            onSubmit={handleAddCourse}
          >
            <p className="ed-group-title">{editingCourseId ? 'Edit course' : 'Add a course'}</p>

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
              {savingCourse ? 'Saving…' : editingCourseId ? 'Save changes' : 'Add course'}
            </button>
            {editingCourseId && (
              <button type="button" className="ed-btn-ghost" onClick={cancelEditCourse}>
                Cancel
              </button>
            )}
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
<div className="ed-item-actions">
                      <button
                        type="button"
                        className="ed-item-btn"
                        onClick={() => startEditLesson(l)}
                        aria-label={`Edit ${l.name}`}
                        title="Edit"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="ed-item-btn ed-item-btn-del"
                        onClick={() => handleDeleteLesson(l.id)}
                        aria-label={`Delete ${l.name}`}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form
            className={`ed-form ed-add${editingLessonId ? ' ed-editing' : ''}`}
            onSubmit={handleAddLesson}
          >
            <p className="ed-group-title">{editingLessonId ? 'Edit lesson' : 'Add a lesson'}</p>
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
                placeholder="e.g. Meet and set your goals"
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
                <option value="60">60 minutes</option>
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
              {savingLesson ? 'Saving…' : editingLessonId ? 'Save changes' : 'Add lesson'}
            </button>
            {editingLessonId && (
              <button type="button" className="ed-btn-ghost" onClick={cancelEditLesson}>
                Cancel
              </button>
            )}
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
