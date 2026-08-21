import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { SCALE_OPTIONS, getAppScale, setAppScale } from '../appScale'
import './Settings.css'

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 5 5 9-11" />
    </svg>
  )
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Settings.
 *
 * Every control here changes something the app actually does — there are no
 * decorative toggles. Account details and the password hit the API; the
 * appearance controls are local preferences that already existed (the 110% UI
 * scale and the collapsed sidebar) and were previously only changeable by
 * editing CSS or clicking the rail.
 */
export default function Settings() {
  const { token, user, setUser } = useAuth()

  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)
  const [busy, setBusy] = useState(null)

  const [name, setName] = useState(user?.name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const [scale, setScale] = useState(() => getAppScale())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sb-collapsed') === '1'
  )

  useEffect(() => {
    setName(user?.name || '')
  }, [user])

  useEffect(() => {
    if (!token) return
    api
      .getUserStats(token)
      .then(setStats)
      .catch(() => setStats(null))
  }, [token])

  function say(message) {
    setFlash(message)
    setTimeout(() => setFlash(null), 2600)
  }

  /* One wrapper for every mutation, as in the edit drawers: it owns the error
     reset, the busy key and the flash so each handler states only its own work. */
  async function run(key, work, done) {
    setError(null)
    setBusy(key)
    try {
      const result = await work()
      if (done) done(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const saveName = (e) => {
    e.preventDefault()
    run(
      'name',
      () => api.updateProfile(token, { name }),
      (updated) => {
        // Keep the sidebar's greeting in step without a reload.
        if (setUser) setUser(updated)
        say('Name updated')
      }
    )
  }

  const savePassword = (e) => {
    e.preventDefault()
    run(
      'password',
      () =>
        api.updatePassword(token, {
          current_password: currentPassword,
          password,
          password_confirmation: passwordConfirm,
        }),
      () => {
        setCurrentPassword('')
        setPassword('')
        setPasswordConfirm('')
        say('Password updated — other devices were signed out')
      }
    )
  }

  const revokeSessions = () =>
    run(
      'sessions',
      () => api.revokeOtherSessions(token),
      ({ revoked }) => {
        setStats((s) => (s ? { ...s, other_sessions: 0 } : s))
        say(
          revoked > 0
            ? `Signed out of ${revoked} other ${revoked === 1 ? 'session' : 'sessions'}`
            : 'No other sessions were open'
        )
      }
    )

  function chooseScale(value) {
    setScale(setAppScale(value))
    say(`Interface scale set to ${Math.round(value * 100)}%`)
  }

  function toggleSidebar(collapsed) {
    setSidebarCollapsed(collapsed)
    localStorage.setItem('sb-collapsed', collapsed ? '1' : '0')
    // Layout reads this on mount, so tell the user what to expect rather than
    // silently doing nothing until the next page load.
    say('Saved — the sidebar changes on your next page load')
  }

  return (
    <div className="se">
      <header className="se-head">
        <h1 className="se-title">Settings</h1>
        <p className="se-sub">Your account and how Verbo looks.</p>
      </header>

      {error && <p className="se-error">{error}</p>}
      {flash && <p className="se-flash">{flash}</p>}

      <div className="se-grid">
        {/* ---- account ---- */}
        <section className="se-card">
          <h2 className="se-card-title">Account</h2>
          <p className="se-card-note">Your display name is what tutors see on a booking.</p>

          <form className="se-form" onSubmit={saveName}>
            <label className="se-field">
              <span>Display name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} />
            </label>

            <label className="se-field">
              <span>Email</span>
              <input value={user?.email || ''} readOnly disabled />
              {/* Honest about why, rather than offering a change that would need
                  a verification email this app cannot send. */}
              <em className="se-hint">
                Email cannot be changed here — there is no verification email set up yet.
              </em>
            </label>

            <button
              type="submit"
              className="se-btn"
              disabled={busy === 'name' || name.trim() === (user?.name || '')}
            >
              {busy === 'name' ? 'Saving…' : 'Save name'}
            </button>
          </form>
        </section>

        {/* ---- password ---- */}
        <section className="se-card">
          <h2 className="se-card-title">Password</h2>
          <p className="se-card-note">
            Changing this signs you out everywhere else, so anyone using the old password loses
            access.
          </p>

          <form className="se-form" onSubmit={savePassword}>
            <label className="se-field">
              <span>Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label className="se-field">
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label className="se-field">
              <span>Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <button type="submit" className="se-btn" disabled={busy === 'password'}>
              {busy === 'password' ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>

        {/* ---- appearance ---- */}
        <section className="se-card">
          <h2 className="se-card-title">Appearance</h2>
          <p className="se-card-note">Saved on this device only.</p>

          <div className="se-block">
            <p className="se-label">Interface scale</p>
            <div className="se-choices">
              {SCALE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={'se-choice' + (scale === o.value ? ' active' : '')}
                  onClick={() => chooseScale(o.value)}
                  aria-pressed={scale === o.value}
                >
                  <span className="se-choice-label">
                    {o.label}
                    {scale === o.value && <CheckIcon />}
                  </span>
                  <span className="se-choice-hint">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="se-block">
            <p className="se-label">Sidebar</p>
            <label className="se-switch">
              <input
                type="checkbox"
                checked={sidebarCollapsed}
                onChange={(e) => toggleSidebar(e.target.checked)}
              />
              <span className="se-switch-track" aria-hidden="true" />
              <span>Start collapsed</span>
            </label>
          </div>
        </section>

        {/* ---- your data + sessions ---- */}
        <section className="se-card">
          <h2 className="se-card-title">Your data</h2>
          <p className="se-card-note">Everything Verbo has saved for this account.</p>

          <dl className="se-stats">
            <div>
              <dt>Flashcards</dt>
              <dd>{stats ? stats.flashcards : '—'}</dd>
            </div>
            <div>
              <dt>Scans</dt>
              <dd>{stats ? stats.scans : '—'}</dd>
            </div>
            <div>
              <dt>Units opened</dt>
              <dd>{stats ? stats.units_opened : '—'}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{stats ? formatDate(stats.member_since) : '—'}</dd>
            </div>
          </dl>

          <div className="se-block">
            <p className="se-label">Other sessions</p>
            <p className="se-card-note">
              {stats?.other_sessions
                ? `You are signed in on ${stats.other_sessions} other ${
                    stats.other_sessions === 1 ? 'device or browser' : 'devices or browsers'
                  }.`
                : 'No other devices are signed in.'}
            </p>
            <button
              type="button"
              className="se-btn se-btn-ghost"
              onClick={revokeSessions}
              disabled={busy === 'sessions' || !stats?.other_sessions}
            >
              {busy === 'sessions' ? 'Signing out…' : 'Sign out everywhere else'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
