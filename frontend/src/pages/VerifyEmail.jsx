import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import logo from '../assets/sidebar/logo.svg'
import feather from '../assets/signup/feather.png'
import './Login.css'

/**
 * "Check your email" — the step straight after signing up.
 *
 * INSIDE `ProtectedRoute` BUT OUTSIDE `Layout`, exactly like Onboarding: this
 * is a focused step in the sign-up flow, and a sidebar full of places to go
 * is the opposite of what it is for. It sits BEFORE onboarding because it is
 * about the account itself, where onboarding is about preferences.
 *
 * Wears `Login.css`. Sign-in, sign-up, onboarding and the forgotten-password
 * screens already share one shell so the whole run reads as one flow.
 *
 * NO CODE IS SENT ON MOUNT. Registration already sent one, and issuing
 * another here would invalidate it — so someone who read the first email
 * while this page loaded would find that code rejected. Resend is a button.
 */
export default function VerifyEmail() {
  const { token, user, setUser } = useAuth()
  const navigate = useNavigate()

  const [code, setCode] = useState('')
  const [note, setNote] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  /* Nothing to do here for an address already confirmed — a Google sign-up
     arrives verified, and the URL should not be re-enterable afterwards.
     Same guard Onboarding uses against an already-onboarded account. */
  if (user?.email_verified_at) {
    return <Navigate to={user.onboarded_at ? '/dashboard' : '/onboarding'} replace />
  }

  // Where this step hands off to. Onboarding next for a new account.
  const onward = () => navigate(user?.onboarded_at ? '/dashboard' : '/onboarding', { replace: true })

  async function resend() {
    setError(null)
    setNote(null)
    setBusy(true)
    try {
      const res = await api.sendVerifyCode(token)
      setNote(res.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await api.verifyEmail(token, code.trim())
      // Straight into context, so the banner in Layout never appears and
      // nothing has to refetch to notice.
      if (res.user) setUser(res.user)
      onward()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="lg">
      <div className="lg-panel">
        <img className="lg-panel-logo" src={logo} alt="Verbo" />
        <img className="lg-feather" src={feather} alt="" />
        <div className="lg-panel-text">
          <h2 className="lg-welcome">Almost in</h2>
          <p className="lg-welcome-subtitle">
            One code to confirm it is you, then Verbo is yours.
          </p>
        </div>
      </div>

      <div className="lg-form-panel">
        <div className="lg-form-wrap">
          <h1 className="lg-heading">Check your email</h1>
          <p className="lg-sent-quiet">
            We sent a six-digit code to <strong>{user?.email}</strong>. It expires in
            10 minutes.
          </p>

          <form onSubmit={submit}>
            <label className="lg-label" htmlFor="ve-code">
              Your code
            </label>
            <input
              id="ve-code"
              className="lg-input lg-code-input"
              /* `text` with a numeric inputMode, not `type=number`: a number
                 field strips leading zeros, and roughly one code in ten
                 starts with one. */
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />

            {note && <p className="lg-sent">{note}</p>}
            {error && <p className="lg-error">{error}</p>}

            <button type="submit" className="lg-login-btn" disabled={busy || code.length < 6}>
              {busy ? 'Checking...' : 'Confirm email'}
            </button>

            <p className="lg-register-link">
              Nothing arrived?{' '}
              <button type="button" className="lg-linkish" onClick={resend} disabled={busy}>
                Send another
              </button>
            </p>

            {/* A WAY PAST THIS, DELIBERATELY. Mail is the one part of this
                flow that depends on a third party, and a dead mailer must
                never mean nobody can finish signing up. Skipping leaves the
                account unverified and the banner in Layout keeps asking. */}
            <p className="lg-register-link">
              <button type="button" className="lg-linkish" onClick={onward} disabled={busy}>
                Skip for now
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
