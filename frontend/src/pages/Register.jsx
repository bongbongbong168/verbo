import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import verboLogo from '../assets/sidebar/logo.svg'
import feather from '../assets/signup/feather.png'
import EyeIcon from '../components/EyeIcon'
import GoogleSignInButton, { googleConfigured } from '../components/GoogleSignInButton'
import './Register.css'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // ONE visibility state for both fields. The second field exists to be checked
  // against the first, so revealing one while the other stays masked defeats
  // the only reason to look — either eye now shows or hides the pair.
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('Enter your email address.')
      return
    }

    if (!name.trim()) {
      setError('Choose a username.')
      return
    }

    if (!password) {
      setError('Create a password.')
      return
    }

    if (password.length < 8) {
      setError('Your password needs at least 8 characters.')
      return
    }

    if (!confirmPassword) {
      setError('Type your password again to confirm it.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await register(name, email, password)
      /* Straight to the code, not to the app. Registering has just emailed
         one, and this is the moment the person still has their inbox in
         mind — landing on the dashboard instead means finding that email
         later, which is how an address goes unconfirmed forever.

         Google sign-up below goes to /dashboard instead, and correctly:
         Google has already proven the address, so there is no code to
         enter. */
      navigate('/verify-email')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="su">
      <div className="su-panel">
        <img className="su-panel-logo" src={verboLogo} alt="Verbo" />
        <img className="su-feather" src={feather} alt="" />
        <div className="su-panel-text">
          <h1 className="su-join">Join us !</h1>
          <p className="su-join-subtitle">Start your journey today.</p>
        </div>
      </div>

      <div className="su-form-panel">
        <div className="su-form-wrap">
          <h2 className="su-heading">Sign up</h2>

          <form noValidate onSubmit={handleSubmit}>
            <label className="su-label" htmlFor="su-email">
              Email
            </label>
            <input
              id="su-email"
              className="su-input"
              type="email"
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label className="su-label" htmlFor="su-username">
              Username
            </label>
            <input
              id="su-username"
              className="su-input"
              type="text"
              placeholder="Jeff"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <label className="su-label" htmlFor="su-password">
              Password
            </label>
            <div className="su-password-field">
              <input
                id="su-password"
                className="su-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                className="su-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
              >
                <EyeIcon shown={showPassword} />
              </button>
            </div>

            <label className="su-label" htmlFor="su-confirm-password">
              Re - enter password
            </label>
            <div className="su-password-field">
              <input
                id="su-confirm-password"
                className="su-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                className="su-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
              >
                <EyeIcon shown={showPassword} />
              </button>
            </div>

            {error && <p className="su-error" role="alert">{error}</p>}

            <button type="submit" className="su-submit-btn" disabled={submitting}>
              {submitting ? 'Creating account...' : 'Sign up'}
            </button>
          </form>

          {/* Google only — see the note on Login. Same endpoint as Login uses:
              Google cannot tell the browser whether this person has been here
              before, so one call both signs in and signs up. A new account
              lands on /dashboard and ProtectedRoute sends it straight to
              onboarding, exactly as an email sign-up does. */}
          {googleConfigured && (
            <>
              <p className="su-or">
                <span>or</span>
              </p>
              <GoogleSignInButton
                onError={setError}
                onSuccess={() => navigate('/dashboard')}
              />
            </>
          )}

          <p className="su-login-link">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
