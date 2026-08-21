import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import ImageCropper from '../components/ImageCropper'
import iconBell from '../assets/dashboard/icon-bell.png'
import iconProfile from '../assets/dashboard/icon-profile.png'
import './FindTutor.css'

/* Named bands rather than two number inputs — the design shows one dropdown,
   and a band is what someone actually shops by. */
const PRICE_BANDS = {
  'Under $10': ['', '10'],
  '$10 – $20': ['10', '20'],
  '$20 – $40': ['20', '40'],
  '$40+': ['40', ''],
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
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

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

/* 12-lobe seal generated around (12,12) so it is centred in its own viewBox and
   fills 92% of it. The previous path sat 1.9 units high and filled only 69%,
   which made the badge render small and float above the name's baseline. */
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

/* Placeholder figures. The API has no rating, student count, years of
   experience or intro video yet, so these are stand-ins to hold the layout —
   swap them for real fields when the backend grows them. */
const PLACEHOLDER_STATS = { rating: '4.9', students: '268', experience: '5y' }

function TutorPreview({ tutor, isSelf, alreadySent, onBook }) {
  if (!tutor) {
    return (
      <aside className="ft-preview">
        <p className="ft-preview-empty">Pick a tutor to see their profile.</p>
      </aside>
    )
  }

  return (
    <aside className="ft-preview">
      {/* The avatar is a sibling of the video, not a child: the video clips to
          its rounded corners with overflow:hidden, which was cutting off the
          half of the avatar that is meant to hang below it. */}
      <div className="ft-preview-media">
        <div className="ft-preview-video">
          {tutor.photo_url && <img src={tutor.photo_url} alt="" />}
          <button type="button" className="ft-preview-play" aria-label="Play introduction">
            <PlayIcon />
          </button>
        </div>
        <span className="ft-preview-avatar">
          {tutor.photo_url ? (
            <img src={tutor.photo_url} alt={tutor.user.name} />
          ) : (
            <span>{tutor.user.name.charAt(0).toUpperCase()}</span>
          )}
        </span>
      </div>

      <div className="ft-preview-head">
        <div>
          <p className="ft-preview-name">{tutor.user.name}</p>
          <p className="ft-preview-role">{tutor.subjects || 'Chinese Tutor'}</p>
        </div>

        <div className="ft-preview-stats">
          <span>
            <strong>{PLACEHOLDER_STATS.rating}</strong>
            <em className="ft-preview-stars">★★★★</em>
          </span>
          <span>
            <strong>{PLACEHOLDER_STATS.students}</strong>
            Students
          </span>
          <span>
            <strong>{PLACEHOLDER_STATS.experience}</strong>
            Experience
          </span>
        </div>
      </div>

      <button
        type="button"
        className="ft-preview-book"
        onClick={onBook}
        disabled={isSelf || alreadySent}
      >
        {isSelf ? 'This is your profile' : alreadySent ? 'Request sent' : 'Book trial lesson'}
      </button>

      <Link to={`/find-tutor/${tutor.id}`} className="ft-preview-profile">
        <PersonIcon />
        View profile
      </Link>
    </aside>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="4" y1="7" x2="14" y2="7" />
      <circle cx="17" cy="7" r="2" />
      <line x1="10" y1="17" x2="20" y2="17" />
      <circle cx="7" cy="17" r="2" />
    </svg>
  )
}

function GradCapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 2 9l10 5 10-5-10-5z" />
      <path d="M6 11.5V16c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5" />
    </svg>
  )
}

function LangIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h8" />
      <path d="M8 3v2c0 4-2.5 7-5 8" />
      <path d="M5 9c1.5 2.5 4 4.5 7 5" />
      <path d="M13 20l4-9 4 9" />
      <path d="M14.5 17h5" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

export default function FindTutor() {
  const { token, user } = useAuth()
  const navigate = useNavigate()

  const [tutors, setTutors] = useState([])
  const [myProfile, setMyProfile] = useState(null)
  const [bookings, setBookings] = useState({ sent: [], received: [] })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const [bio, setBio] = useState('')
  const [subjects, setSubjects] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [languagesSpoken, setLanguagesSpoken] = useState('')
  const [availability, setAvailability] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [photo, setPhoto] = useState(null)
  // The file currently open in the cropper, kept apart from `photo` so the
  // upload only ever receives the cropped result.
  const [cropSource, setCropSource] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  // Admin setting a photo on someone else's profile: which profile it lands on,
  // and one shared hidden input so every card does not need its own.
  const [photoTargetId, setPhotoTargetId] = useState(null)
  const photoInputRef = useRef(null)

  // Created in an effect, not in render: calling createObjectURL while
  // rendering mints a new URL on every pass and never frees any of them.
  useEffect(() => {
    if (!photo) return setPhotoPreview(null)
    const url = URL.createObjectURL(photo)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [showProfileForm, setShowProfileForm] = useState(false)

  const [search, setSearch] = useState('')
  const [priceBand, setPriceBand] = useState('')
  // Which card the preview panel is showing. Null falls back to the first
  // tutor in the filtered list, so the panel is never empty.
  const [selectedId, setSelectedId] = useState(null)
  const [learnFilter, setLearnFilter] = useState('')
  const [availFilter, setAvailFilter] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  // Kept so the booking request still carries a message field, though the
  // cards no longer collect one — the design has no textarea on them.
  const [bookingMessages] = useState({})
  const [bookingSentTo, setBookingSentTo] = useState({})

  useEffect(() => {
    loadAll()
  }, [token])

  function loadAll() {
    setLoading(true)
    Promise.all([api.getTutors(token), api.getMyTutorProfile(token), api.getBookings(token)])
      .then(([tutorList, profile, bookingData]) => {
        setTutors(tutorList)
        setMyProfile(profile)
        if (profile) {
          setBio(profile.bio || '')
          setSubjects(profile.subjects || '')
          setHourlyRate(profile.hourly_rate ?? '')
          setLanguagesSpoken(profile.languages_spoken || '')
          setAvailability(profile.availability || '')
          setVideoUrl(profile.video_url || '')
        }
        setBookings(bookingData)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setError(null)
    setSavingProfile(true)
    setProfileSaved(false)
    try {
      const profile = await api.saveTutorProfile(token, {
        bio,
        subjects,
        hourly_rate: hourlyRate === '' ? null : Number(hourlyRate),
        languages_spoken: languagesSpoken,
        availability,
        photo,
        video_url: videoUrl,
      })
      setMyProfile(profile)
      setPhoto(null)
      setProfileSaved(true)
      setShowProfileForm(false)
      setTutors((prev) => {
        const withoutMine = prev.filter((t) => Number(t.user_id) !== Number(profile.user_id))
        return [profile, ...withoutMine]
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleRequestBooking(tutorUserId) {
    setError(null)
    try {
      const booking = await api.createBooking(token, {
        tutor_id: tutorUserId,
        message: bookingMessages[tutorUserId] || '',
      })
      setBookings((prev) => ({ ...prev, sent: [booking, ...prev.sent] }))
      setBookingSentTo((prev) => ({ ...prev, [tutorUserId]: true }))
    } catch (err) {
      setError(err.message)
    }
  }

  const filteredTutors = useMemo(() => {
    const q = search.trim().toLowerCase()
    const learn = learnFilter.trim().toLowerCase()
    const avail = availFilter.trim().toLowerCase()
    const min = priceMin === '' ? null : Number(priceMin)
    const max = priceMax === '' ? null : Number(priceMax)

    return tutors.filter((t) => {
      if (q) {
        const haystack = [t.user.name, t.subjects, t.bio, t.languages_spoken]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (learn && !(t.subjects || '').toLowerCase().includes(learn)) return false
      if (avail && !(t.availability || '').toLowerCase().includes(avail)) return false
      if (min != null && (t.hourly_rate == null || Number(t.hourly_rate) < min)) return false
      if (max != null && (t.hourly_rate == null || Number(t.hourly_rate) > max)) return false
      return true
    })
  }, [tutors, search, learnFilter, availFilter, priceMin, priceMax])

  // Filter options come from the tutors themselves — a fixed list would offer
  // choices that match nobody.
  const languageOptions = useMemo(
    () => [...new Set(tutors.map((t) => t.subjects).filter(Boolean))].sort(),
    [tutors]
  )
  const availabilityOptions = useMemo(
    () => [...new Set(tutors.map((t) => t.availability).filter(Boolean))].sort(),
    [tutors]
  )

  const previewTutor =
    filteredTutors.find((t) => t.id === selectedId) || filteredTutors[0] || null

  if (loading) return <p>Loading...</p>

  return (
    <div className="ft">
      <div className="ft-header">
        <div>
          <h1 className="ft-title">Find Tutor</h1>
          <p className="ft-subtitle">These are all the available tutors.</p>
        </div>
        <div className="ft-header-controls">
          <div className="ft-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search your Teacher"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="ft-search-divider" />
            <FilterIcon />
          </div>
          <div className="ft-header-icons">
            <button type="button" className="ft-icon-btn" aria-label="Notifications">
              <img src={iconBell} alt="" />
            </button>
            <button type="button" className="ft-icon-btn" aria-label="Profile">
              <img src={iconProfile} alt="" />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="ft-error">{error}</p>}

      {/* Filters read as pills across the top rather than a side panel, which
          frees the right column for the tutor preview. */}
      <div className="ft-filterbar">
        <span className="ft-filterbar-label">Filter by:</span>

        <label className="ft-pill">
          <select value={learnFilter} onChange={(e) => setLearnFilter(e.target.value)}>
            <option value="">Chinese ( Mandarin )</option>
            {languageOptions.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <ChevronDown />
        </label>

        <label className="ft-pill">
          <select value={availFilter} onChange={(e) => setAvailFilter(e.target.value)}>
            <option value="">Availability</option>
            {availabilityOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <ChevronDown />
        </label>

        <label className="ft-pill">
          <select
            value={priceBand}
            onChange={(e) => {
              const band = e.target.value
              setPriceBand(band)
              const [lo, hi] = PRICE_BANDS[band] ?? ['', '']
              setPriceMin(lo)
              setPriceMax(hi)
            }}
          >
            <option value="">Price range</option>
            {Object.keys(PRICE_BANDS).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <ChevronDown />
        </label>
      </div>

      <div className="ft-layout">
        <div className="ft-main">
          {filteredTutors.length === 0 ? (
            <p className="ft-empty">No tutors found.</p>
          ) : (
            <div className="ft-list">
              {filteredTutors.map((t) => (
                <div
                  className={'ft-card' + (previewTutor?.id === t.id ? ' selected' : '')}
                  key={t.id}
                  /* Hovering drives the preview panel; clicking opens the
                     profile. Selecting on click would have left no way to open
                     a tutor from the list. */
                  onMouseEnter={() => setSelectedId(t.id)}
                  onFocus={() => setSelectedId(t.id)}
                  onClick={() => navigate(`/find-tutor/${t.id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/find-tutor/${t.id}`)
                    }
                  }}
                >
                  <span className="ft-card-frame">
                    {/* Placeholder — the API has no presence tracking yet */}
                    <span className="ft-card-online" aria-hidden="true" />
                    {user?.is_admin && (
                      <button
                        type="button"
                        className="ft-card-photo-edit"
                        title={`Set photo for ${t.user.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setPhotoTargetId(t.id)
                          photoInputRef.current?.click()
                        }}
                      >
                        Photo
                      </button>
                    )}
                    {t.photo_url ? (
                      <img className="ft-card-photo" src={t.photo_url} alt={t.user.name} />
                    ) : (
                      <span className="ft-card-photo-placeholder">
                        {t.user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <div className="ft-card-body">
                    <div className="ft-card-name-row">
                      <p className="ft-card-name">{t.user.name}</p>
                      <span className="ft-card-verified">
                        <VerifiedIcon />
                      </span>
                      {t.hourly_rate != null && <span className="ft-card-rate">${t.hourly_rate}/hr</span>}
                    </div>
                    {t.bio && <p className="ft-card-bio">{t.bio}</p>}
                    <div className="ft-meta">
                      {t.subjects && (
                        <span className="ft-meta-row">
                          <GradCapIcon /> {t.subjects}
                        </span>
                      )}
                      {t.languages_spoken && (
                        <span className="ft-meta-row">
                          <LangIcon /> {t.languages_spoken}
                        </span>
                      )}
                      {t.availability && (
                        <span className="ft-meta-row">
                          <ClockIcon /> Availability | ( {t.availability} )
                        </span>
                      )}
                    </div>

                    {/* Booking moved to the preview panel, per the design —
                        the cards stay purely informational. */}
                    {user && Number(t.user.id) === Number(user.id) && (
                      <span className="ft-card-self">This is your profile</span>
                    )}
                    {bookingSentTo[t.user.id] && <span className="ft-card-sent">Request sent</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="ft-section-title">{myProfile ? 'Your tutor profile' : 'Become a tutor'}</h2>
          <button type="button" className="ft-profile-toggle" onClick={() => setShowProfileForm((v) => !v)}>
            {showProfileForm ? 'Cancel' : myProfile ? 'Edit my tutor profile' : 'Become a tutor'}
          </button>
          {profileSaved && !showProfileForm && <span className="ft-saved-note">Saved</span>}

          {showProfileForm && (
            <form className="ft-form" onSubmit={handleSaveProfile}>
              <div>
                <label>Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    // Crop before it becomes the upload, so what you frame is
                    // what gets stored — not whatever object-fit happens to show.
                    const picked = e.target.files[0]
                    if (picked) setCropSource(picked)
                    e.target.value = ''
                  }}
                />
                {photo && photoPreview && (
                  <span className="ft-photo-chosen">
                    <img src={photoPreview} alt="" />
                    Ready to upload
                    <button type="button" onClick={() => setCropSource(photo)}>
                      Adjust
                    </button>
                  </span>
                )}
              </div>
              <div>
                <label>Bio</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
              </div>
              <div>
                <label>Subjects</label>
                <input type="text" value={subjects} onChange={(e) => setSubjects(e.target.value)} />
              </div>
              <div>
                <label>Languages spoken</label>
                <input
                  type="text"
                  placeholder="e.g. Chinese (Mandarin), English (Intermediate)"
                  value={languagesSpoken}
                  onChange={(e) => setLanguagesSpoken(e.target.value)}
                />
              </div>
              <div>
                <label>Availability</label>
                <input
                  type="text"
                  placeholder="e.g. 9am-12pm, 1pm-7pm"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                />
              </div>
              <div>
                <label>Intro video link</label>
                <input
                  type="url"
                  placeholder="YouTube, Vimeo or a direct .mp4 link"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                />
              </div>
              <div>
                <label>Hourly rate ($)</label>
                <input
                  type="number"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </div>
              <button type="submit" className="ft-btn-primary" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : myProfile ? 'Update profile' : 'Create tutor profile'}
              </button>
            </form>
          )}

          <h2 className="ft-section-title">Booking requests you sent</h2>
          {bookings.sent.length === 0 ? (
            <p className="ft-empty">None yet.</p>
          ) : (
            <ul className="ft-bookings-list">
              {bookings.sent.map((b) => (
                <li className="ft-booking-row" key={b.id}>
                  To {b.tutor.name}: "{b.message}" - <span className="ft-booking-status">{b.status}</span>
                </li>
              ))}
            </ul>
          )}

          <h2 className="ft-section-title">Booking requests you received</h2>
          {bookings.received.length === 0 ? (
            <p className="ft-empty">None yet.</p>
          ) : (
            <ul className="ft-bookings-list">
              {bookings.received.map((b) => (
                <li className="ft-booking-row" key={b.id}>
                  From {b.student.name}: "{b.message}" -{' '}
                  <span className="ft-booking-status">{b.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <TutorPreview
          tutor={previewTutor}
          isSelf={Boolean(previewTutor && user) && Number(previewTutor.user.id) === Number(user.id)}
          alreadySent={Boolean(previewTutor) && Boolean(bookingSentTo[previewTutor.user.id])}
          onBook={() => previewTutor && handleRequestBooking(previewTutor.user.id)}
        />
      </div>

      {/* One input serves every card's Photo button */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const picked = e.target.files[0]
          if (picked) setCropSource(picked)
          e.target.value = ''
        }}
      />

      {cropSource && (
        <ImageCropper
          file={cropSource}
          onCancel={() => {
            setCropSource(null)
            setPhotoTargetId(null)
          }}
          onCrop={async (cropped) => {
            setCropSource(null)
            // No target means it is the admin's own profile form.
            if (photoTargetId == null) return setPhoto(cropped)

            try {
              await api.setTutorPhoto(token, photoTargetId, cropped)
              const fresh = await api.getTutors(token)
              setTutors(fresh)
            } catch (err) {
              setError(err.message)
            } finally {
              setPhotoTargetId(null)
            }
          }}
        />
      )}
    </div>
  )
}
