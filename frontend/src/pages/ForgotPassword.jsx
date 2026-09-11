import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import logo from '../assets/sidebar/logo.svg'
import feather from '../assets/signup/feather.png'
import './Login.css'

/**
 * "I forgot my password" — step one, asking for the link.
 *
 * Wears `Login.css` rather than a stylesheet of its own. Sign-in, sign-up and
 * onboarding already share one shell so the three read as one flow, and this
 * is a fourth screen in exactly that flow; a near-identical `fp-` stylesheet
 * beside it is how the Podcast and Read toggles drifted apart.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await api.forgotPassword(email)
      /* The server answers identically whether or not the address has an
         account, so this page must not claim the email exists — it reports
         what was actually done, which is "a link is on its way IF there is
         an account". Anything more certain would leak the thing the endpoint
         is careful not to. */
      setSent(res.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lg">
      <div className="lg-panel">
        <img className="lg-panel-logo" src={logo} alt="Verbo" />
        <img className="lg-feather" src={feather} alt="" />
        <div className="lg-panel-text">
          <h2 className="lg-welcome">Locked out?</h2>
          <p className="lg-welcome-subtitle">It happens. We will send you a way back in.</p>
        </div>
      </div>

      <div className="lg-form-panel">
        <div className="lg-form-wrap">
          <h1 className="lg-heading">Reset your password</h1>

          {sent ? (
            <>
              <p className="lg-sent">{sent}</p>
              <p className="lg-register-link">
                <Link to="/login">Back to sign in</Link>
              </p>
            </>
          ) : (
            <form onSubmit={submit}>
              <label className="lg-label" htmlFor="fp-email">
                The email you signed up with
              </label>
              <input
                id="fp-email"
                className="lg-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />

              {error && <p className="lg-error">{error}</p>}

              <button type="submit" className="lg-login-btn" disabled={submitting}>
                {submitting ? 'Sending...' : 'Send reset link'}
              </button>

              <p className="lg-register-link">
                Remembered it? <Link to="/login">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
