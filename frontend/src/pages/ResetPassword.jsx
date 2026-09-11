import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import EyeIcon from '../components/EyeIcon'
import logo from '../assets/sidebar/logo.svg'
import feather from '../assets/signup/feather.png'
import './Login.css'

/**
 * "I forgot my password" — step two, the page the emailed link opens.
 *
 * The token is in the path and the email in the query, both put there by
 * `AuthServiceProvider`. The email rides along deliberately: the endpoint
 * needs it to look the token up, and asking someone to retype the address
 * they just entered, on a page they reached by clicking a link, is a step
 * that can only go wrong.
 *
 * Wears `Login.css`, like ForgotPassword — see the note there.
 */
export default function ResetPassword() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const email = params.get('email') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)

    /* Checked here as well as on the server so the mismatch is caught before
       a round trip spends the token — the pair is the one error a person
       makes on this page, and burning a single-use link on it would mean
       going back to the inbox for another. */
    if (password !== confirm) {
      return setError('Those two passwords are not the same.')
    }

    setSubmitting(true)
    try {
      await api.resetPassword({
        token,
        email,
        password,
        password_confirmation: confirm,
      })
      /* Straight to sign-in rather than signing them in here. Resetting
         revokes every token the account had, so there is nothing to log in
         WITH — and typing the new password once is the thing that makes it
         stick in someone's memory. */
      navigate('/login', { replace: true, state: { notice: 'Password changed. Sign in with it now.' } })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="lg">
      <div className="lg-panel">
        <img className="lg-panel-logo" src={logo} alt="Verbo" />
        <img className="lg-feather" src={feather} alt="" />
        <div className="lg-panel-text">
          <h2 className="lg-welcome">Almost there</h2>
          <p className="lg-welcome-subtitle">Pick something you will remember this time.</p>
        </div>
      </div>

      <div className="lg-form-panel">
        <div className="lg-form-wrap">
          <h1 className="lg-heading">Set a new password</h1>

          {email ? (
            <p className="lg-sent-quiet">for {email}</p>
          ) : (
            /* A link that lost its query string cannot be completed, and
               saying so beats a 422 after they have typed twice. */
            <p className="lg-error">
              This link is missing its email address. Ask for a new one from{' '}
              <Link to="/forgot-password">the reset page</Link>.
            </p>
          )}

          <form onSubmit={submit}>
            <label className="lg-label" htmlFor="rp-pass">
              New password
            </label>
            <div className="lg-password-field">
              <input
                id="rp-pass"
                className="lg-input"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                className="lg-password-toggle"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                <EyeIcon shown={show} />
              </button>
            </div>

            <label className="lg-label" htmlFor="rp-confirm">
              Type it again
            </label>
            <input
              id="rp-confirm"
              className="lg-input"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

            {error && <p className="lg-error">{error}</p>}

            <button type="submit" className="lg-login-btn" disabled={submitting || !email}>
              {submitting ? 'Saving...' : 'Change password'}
            </button>

            <p className="lg-register-link">
              <Link to="/login">Back to sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
