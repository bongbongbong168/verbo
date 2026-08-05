import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import iconBell from '../assets/dashboard/icon-bell.png'
import iconProfile from '../assets/dashboard/icon-profile.png'
import './FindTutor.css'

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
  const [photo, setPhoto] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [showProfileForm, setShowProfileForm] = useState(false)

  const [search, setSearch] = useState('')
  const [learnFilter, setLearnFilter] = useState('')
  const [availFilter, setAvailFilter] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [bookingMessages, setBookingMessages] = useState({})
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

      <div className="ft-layout">
        <div className="ft-main">
          {filteredTutors.length === 0 ? (
            <p className="ft-empty">No tutors found.</p>
          ) : (
            <div className="ft-list">
              {filteredTutors.map((t) => (
                <div className="ft-card" key={t.id}>
                  <Link to={`/find-tutor/${t.id}`}>
                    {t.photo_url ? (
                      <img className="ft-card-photo" src={t.photo_url} alt={t.user.name} />
                    ) : (
                      <div className="ft-card-photo-placeholder">
                        {t.user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </Link>
                  <div className="ft-card-body">
                    <div className="ft-card-name-row">
                      <Link className="ft-card-name-link" to={`/find-tutor/${t.id}`}>
                        <p className="ft-card-name">{t.user.name}</p>
                      </Link>
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

                    {user && Number(t.user.id) === Number(user.id) ? (
                      <span className="ft-card-self">This is your profile</span>
                    ) : bookingSentTo[t.user.id] ? (
                      <span className="ft-card-sent">Request sent</span>
                    ) : (
                      <div className="ft-card-actions">
                        <textarea
                          placeholder="Message to tutor (optional)"
                          rows={2}
                          value={bookingMessages[t.user.id] || ''}
                          onChange={(e) =>
                            setBookingMessages((prev) => ({ ...prev, [t.user.id]: e.target.value }))
                          }
                        />
                        <br />
                        <button
                          type="button"
                          className="ft-btn-secondary"
                          onClick={() => handleRequestBooking(t.user.id)}
                        >
                          Request booking
                        </button>
                      </div>
                    )}
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
                <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
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

        <aside className="ft-filter-panel">
          <div className="ft-filter-grid">
            <label className="ft-filter-box">
              <span className="ft-filter-label">I want to learn</span>
              <input
                type="text"
                placeholder="Chinese ( Mandarin )"
                value={learnFilter}
                onChange={(e) => setLearnFilter(e.target.value)}
              />
            </label>
            <label className="ft-filter-box">
              <span className="ft-filter-label">Availability</span>
              <input
                type="text"
                placeholder="12pm - 4pm"
                value={availFilter}
                onChange={(e) => setAvailFilter(e.target.value)}
              />
            </label>
            <div className="ft-filter-box">
              <span className="ft-filter-label">Price range</span>
              <div className="ft-filter-price">
                <input
                  type="number"
                  min="0"
                  placeholder="4$"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                />
                <span>-</span>
                <input
                  type="number"
                  min="0"
                  placeholder="10$"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                />
              </div>
            </div>
            <label className="ft-filter-box ft-filter-disabled" title="Coming soon">
              <span className="ft-filter-label">Country</span>
              <input type="text" placeholder="Native Chinese" disabled />
            </label>
          </div>
          <label className="ft-filter-box ft-filter-disabled" title="Coming soon">
            <span className="ft-filter-label">Specialties</span>
            <input type="text" placeholder="HSK Focused" disabled />
          </label>
          <label className="ft-filter-box ft-filter-disabled" title="Coming soon">
            <span className="ft-filter-label">Teaching Styles</span>
            <input type="text" placeholder="Patient , Engaging" disabled />
          </label>
        </aside>
      </div>
    </div>
  )
}
