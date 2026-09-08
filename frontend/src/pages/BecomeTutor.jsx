import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { invalidate } from '../dataCache'
import ImageCropper from '../components/ImageCropper'
import PageTools from '../components/PageTools'
import './BecomeTutor.css'

/**
 * Apply to teach on Verbo — and, after submitting, the status of that
 * application.
 *
 * ONE page for both, not two. "Have I been approved?" and "what did I tell
 * them?" are the same question asked at different moments, and the answer to
 * the second is what someone asked for more information has to edit. Splitting
 * them would mean a status page that links to a form that has to re-fetch the
 * same record.
 *
 * The form is deliberately not a wizard. Five steps hide from an applicant how
 * much is being asked before they commit to the first field, and everything
 * here fits one scrollable column.
 */

/* What each state means, said in the applicant's terms rather than the
   database's. `pending` deliberately promises no date — inventing "within 48
   hours" would be a commitment nothing in the app can keep. */
const STATE = {
  pending: {
    tone: 'wait',
    title: 'Application submitted',
    body: 'Our team will review your application. You will be notified when a decision is made.',
  },
  needs_info: {
    tone: 'ask',
    title: 'More information needed',
    body: 'We need a little more before we can finish reviewing your application. Update your answers below and submit again.',
  },
  approved: {
    tone: 'ok',
    title: "You're a Verbo tutor",
    body: 'Your profile is live in Find Tutor and students can book you.',
  },
  rejected: {
    tone: 'no',
    title: 'Application not approved',
    body: 'You can update your answers and apply again.',
  },
}

function Field({ label, hint, children, required }) {
  return (
    <label className="bt-field">
      <span className="bt-label">
        {label}
        {required && <i className="bt-req" aria-hidden="true">*</i>}
      </span>
      {children}
      {hint && <small className="bt-hint">{hint}</small>}
    </label>
  )
}

export default function BecomeTutor() {
  const { token, user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [options, setOptions] = useState({ chinese_levels: [], teaches_levels: [] })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [credentials, setCredentials] = useState([])
  const [uploading, setUploading] = useState(false)

  // The form. Seeded from an existing application so a resubmission edits
  // rather than retypes.
  const [form, setForm] = useState({
    country: '', chinese_level: '', teaches_levels: [], years_experience: '',
    subjects: '', languages_spoken: '', bio: '', teaching_style: '',
    availability: '', hourly_rate: '', video_url: '',
  })
  /* The cropped photo waiting on submit, and the file currently open in the
     cropper — kept apart so the upload only ever receives the cropped result,
     the same split every other photo picker in the app makes. */
  const [photo, setPhoto] = useState(null)
  const [cropSource, setCropSource] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  useEffect(() => { load() }, [token])

  // In an effect, not in render: createObjectURL during a render mints a new
  // URL on every pass and frees none of them.
  useEffect(() => {
    if (!photo) return setPhotoPreview(null)
    const url = URL.createObjectURL(photo)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  function load() {
    setLoading(true)
    api
      .getMyTutorProfile(token)
      .then((mine) => {
        setOptions(mine.options)
        setProfile(mine.profile)
        setCredentials(mine.profile?.credentials || [])
        if (mine.profile) {
          const p = mine.profile
          setForm({
            country: p.country || '', chinese_level: p.chinese_level || '',
            teaches_levels: p.teaches_levels || [],
            years_experience: p.years_experience ?? '',
            subjects: p.subjects || '', languages_spoken: p.languages_spoken || '',
            bio: p.bio || '', teaching_style: p.teaching_style || '',
            availability: p.availability || '', hourly_rate: p.hourly_rate ?? '',
            video_url: p.video_url || '',
          })
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function toggleLevel(level) {
    setForm((f) => ({
      ...f,
      teaches_levels: f.teaches_levels.includes(level)
        ? f.teaches_levels.filter((l) => l !== level)
        : [...f.teaches_levels, level],
    }))
  }

  async function addCredential(file) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const saved = await api.uploadTutorCredential(token, file)
      setCredentials((c) => [saved, ...c])
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function removeCredential(id) {
    try {
      await api.deleteTutorCredential(token, id)
      setCredentials((c) => c.filter((x) => x.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await api.applyAsTutor(token, { ...form, photo })
      /* Both cached views of "am I a tutor" are now wrong — Find Tutor reads
         the profile and the list itself changes on approval. */
      invalidate('tutor-profile:me', 'tutors')
      setPhoto(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="bt"><p className="bt-loading">Loading…</p></div>

  const status = profile?.status || null
  const state = status ? STATE[status] : null
  // An approved tutor edits through the drawer on their own profile, not here:
  // resubmitting would put a live tutor back in the queue.
  const locked = status === 'approved'

  return (
    <div className="bt">
      <div className="bt-topbar">
        <h1 className="bt-title">Become a tutor</h1>
        <div className="bt-topbar-icons">
          <PageTools />
        </div>
      </div>
      <hr className="bt-divider" />

      {error && <p className="bt-error">{error}</p>}

      {state && (
        <section className={`bt-state bt-state-${state.tone}`}>
          <h2>{state.title}</h2>
          <p>{state.body}</p>
          {/* The reviewer's own words. A rejection without a reason is a closed
              door, and "more information needed" without saying what is worse
              than silence. */}
          {profile.review_note && (
            <blockquote className="bt-note">{profile.review_note}</blockquote>
          )}
          {locked && (
            <Link className="bt-state-link" to={`/find-tutor/${profile.id}`}>
              View your public profile
            </Link>
          )}
        </section>
      )}

      {locked ? (
        <p className="bt-locked">
          Your details are edited from your profile page, so that publishing
          changes never puts you back in the review queue.
        </p>
      ) : (
        <form className="bt-form" onSubmit={submit}>
          <fieldset className="bt-group">
            <legend>About you</legend>
            <div className="bt-row">
              <Field label="Country" required>
                <input value={form.country} onChange={set('country')} maxLength={80} />
              </Field>
              <Field label="Your Chinese level" required>
                <select value={form.chinese_level} onChange={set('chinese_level')}>
                  <option value="">Choose…</option>
                  {options.chinese_levels.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Languages you speak" required hint="Students filter on this — list every language you can teach in.">
              <input value={form.languages_spoken} onChange={set('languages_spoken')} placeholder="Chinese, English" />
            </Field>
            {/* Not a `Field`: that wrapper is a <label>, and the picker below
                is one too — nesting them is invalid and breaks the click. */}
            <div className="bt-photo-field">
              <span className="bt-label">Profile photo</span>
              <div className="bt-photo-row">
                {/* 13:15, the shape of the Find Tutor card this photo lands on,
                    so the frame you crop to is the frame students see. */}
                <span className="bt-photo">
                  {photoPreview || profile?.photo_url ? (
                    <img src={photoPreview || profile.photo_url} alt="" />
                  ) : (
                    <span>{(user?.name || '?').charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <div className="bt-photo-actions">
                  <label className="bt-btn-ghost">
                    {photo ? 'Choose another' : profile?.photo_url ? 'Replace photo' : 'Choose photo'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const picked = e.target.files[0]
                        if (picked) setCropSource(picked)
                        // Cleared so picking the SAME file again still fires change.
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {photo && (
                    <button type="button" className="bt-btn-ghost" onClick={() => setCropSource(photo)}>
                      Adjust crop
                    </button>
                  )}
                  <p className="bt-photo-hint">
                    {photo
                      ? 'Ready — it uploads when you submit.'
                      : 'Shown on your public profile once approved.'}
                  </p>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="bt-group">
            <legend>Teaching</legend>
            <Field label="Who you teach" required>
              <div className="bt-chips">
                {options.teaches_levels.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={'bt-chip' + (form.teaches_levels.includes(l) ? ' on' : '')}
                    aria-pressed={form.teaches_levels.includes(l)}
                    onClick={() => toggleLevel(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            <div className="bt-row">
              <Field label="Subjects and skills" required>
                <input value={form.subjects} onChange={set('subjects')} placeholder="Speaking, Grammar, Business Chinese" />
              </Field>
              <Field label="Years of experience" required>
                <input type="number" min="0" max="70" value={form.years_experience} onChange={set('years_experience')} />
              </Field>
            </div>
            <Field label="About you" required hint="At least a couple of sentences — this is what students read first.">
              <textarea rows={4} value={form.bio} onChange={set('bio')} />
            </Field>
            <Field label="Your teaching style" hint="Optional.">
              <textarea rows={3} value={form.teaching_style} onChange={set('teaching_style')} />
            </Field>
          </fieldset>

          <fieldset className="bt-group">
            <legend>Availability and rate</legend>
            <div className="bt-row">
              <Field label="When you are usually free" hint="A rough description. You set real bookable hours after approval.">
                <input value={form.availability} onChange={set('availability')} placeholder="Weekday evenings, weekends" />
              </Field>
              <Field label="Indicative rate per hour" hint="In dollars. Your real prices come from your lesson list.">
                <input type="number" min="0" value={form.hourly_rate} onChange={set('hourly_rate')} />
              </Field>
            </div>
            <Field label="Intro video" hint="Optional, but applications with one are much easier to judge.">
              <input value={form.video_url} onChange={set('video_url')} placeholder="https://…" />
            </Field>
          </fieldset>

          <fieldset className="bt-group">
            <legend>Evidence</legend>
            <p className="bt-group-note">
              Certificates, degrees or references. Only the review team sees
              these — they are never shown on your public profile.
            </p>
            {/* Uploads go up immediately rather than riding on submit: the
                application can be saved and resubmitted many times, and
                re-uploading the same certificate each round would be busywork. */}
            <label className="bt-btn-ghost">
              {uploading ? 'Uploading…' : 'Add a document'}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx"
                disabled={uploading}
                onChange={(e) => { addCredential(e.target.files[0]); e.target.value = '' }}
              />
            </label>
            {credentials.length > 0 && (
              <ul className="bt-files">
                {credentials.map((c) => (
                  <li key={c.id}>
                    <span className="bt-file-name">{c.label || c.name}</span>
                    <button type="button" onClick={() => removeCredential(c.id)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <button className="bt-submit" type="submit" disabled={saving}>
            {saving ? 'Submitting…' : status ? 'Submit again' : 'Submit application'}
          </button>
          <p className="bt-small">
            Your profile stays private until a reviewer approves it.
          </p>
        </form>
      )}

      {/* Every photo in the app is cropped before it is uploaded, and this is
          the same column the edit drawer writes later — a picker here that
          skipped the cropper would frame one tutor differently from the rest.
          The default aspect is the 130x150 Find Tutor card. */}
      {cropSource && (
        <ImageCropper
          file={cropSource}
          onCancel={() => setCropSource(null)}
          onCrop={(cropped) => {
            setPhoto(cropped)
            setCropSource(null)
          }}
        />
      )}
    </div>
  )
}
