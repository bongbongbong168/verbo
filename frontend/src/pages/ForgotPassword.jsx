import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import EyeIcon from '../components/EyeIcon'
import logo from '../assets/sidebar/logo.svg'
import feather from '../assets/signup/feather.png'
import './Login.css'

/**
 * "I forgot my password" — ask for a code, then spend it.
 *
 * ONE PAGE, TWO STEPS, rather than a page each. The emailed code is typed
 * back into the tab that asked for it, so navigating away is exactly the
 * thing that must not happen — a second route would invite a refresh or a
 * back button between the two halves and lose the address already entered.
 *
 * Wears `Login.css` rather than a stylesheet of its own. Sign-in, sign-up and
 * onboarding already share one shell so the three read as one flow, and this
 * is a fourth screen in exactly that flow; a near-identical `fp-` stylesheet
 * beside it is how the Podcast and Read toggles drifted apart.
 */
export default function ForgotPassword() {
  const navigate = useNavigate()

  /* Settings can hand this page a code it has ALREADY sent, along with the
     address it went to — see `sendResetLink` there. Arriving that way skips
     straight to the digits rather than asking a signed-in person to retype
     the email they are signed in as. Read once into state so the fields stay
     editable and a reload falls back to the normal first step. */
  const { state } = useLocation()

  // 'ask' = which address, 'code' = the digits plus the new password.
  const [step, setStep] = useState(state?.step === 'code' ? 'code' : 'ask')
  const [email, setEmail] = useState(state?.email || '')
  const [sent, setSent] = useState(state?.notice || null)

  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)

  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function requestCode(e) {
    e?.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await api.forgotPassword(email)
      /* The server answers identically whether or not the address has an
         account, so this page must not claim the email exists — it shows
         what the server said, which is "a code is on its way IF there is an
         account". Anything more certain would leak the thing the endpoint is
         careful not to. */
      setSent(res.message)
      setStep('code')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e) {
    e.preventDefault()
    setError(null)

    /* Checked here as well as on the server so the mismatch is caught before
       a round trip spends the code — the pair is the one error a person
       makes on this page, and a single-use code burnt on a typo means going
       back to the inbox for another. */
    if (password !== confirm) {
      return setError('Those two passwords are not the same.')
    }

    setBusy(true)
    try {
      await api.resetPassword({
        email,
        code: code.trim(),
        password,
        password_confirmation: confirm,
      })
      /* Straight to sign-in rather than signing them in here. Resetting
         revokes every token the account had, so there is nothing to log in
         WITH — and typing the new password once is the thing that makes it
         stick in someone's memory. */
      navigate('/login', {
        replace: true,
        state: { notice: 'Password changed. Sign in with it now.' },
      })
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
          <h2 className="lg-welcome">Locked out?</h2>
          <p className="lg-welcome-subtitle">It happens. We will send you a way back in.</p>
        </div>
      </div>

      <div className="lg-form-panel">
        <div className="lg-form-wrap">
          <h1 className="lg-heading">
            {step === 'ask' ? 'Reset your password' : 'Enter your code'}
          </h1>

          {step === 'ask' ? (
            <form onSubmit={requestCode}>
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

              <button type="submit" className="lg-login-btn" disabled={busy}>
                {busy ? 'Sending...' : 'Send code'}
              </button>

              <p className="lg-register-link">
                Remembered it? <Link to="/login">Sign in</Link>
              </p>
            </form>
          ) : (
            <form onSubmit={submitCode}>
              {sent && <p className="lg-sent">{sent}</p>}

              <label className="lg-label" htmlFor="fp-code">
                Six-digit code
              </label>
              <input
                id="fp-code"
                className="lg-input lg-code-input"
                /* `text` with a numeric inputMode, not `type=number`: a
                   number field strips leading zeros, and half of all codes
                   here start with one. */
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />

              <label className="lg-label" htmlFor="fp-pass">
                New password
              </label>
              <div className="lg-password-field">
                <input
                  id="fp-pass"
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

              <label className="lg-label" htmlFor="fp-confirm">
                Type it again
              </label>
              <input
                id="fp-confirm"
                className="lg-input"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />

              {error && <p className="lg-error">{error}</p>}

              <button type="submit" className="lg-login-btn" disabled={busy}>
                {busy ? 'Saving...' : 'Change password'}
              </button>

              <p className="lg-register-link">
                {/* A resend rather than a back button: the address is already
                    right, and the usual reason to be stuck here is a code
                    that never arrived or has expired. */}
                No code?{' '}
                <button type="button" className="lg-linkish" onClick={requestCode} disabled={busy}>
                  Send another
                </button>
              </p>
              <p className="lg-register-link">
                <Link to="/login">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
