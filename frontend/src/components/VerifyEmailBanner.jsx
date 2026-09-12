import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import './VerifyEmailBanner.css'

/**
 * "Confirm your email" — the nag for an account that has not entered its code.
 *
 * A BANNER, NOT A GATE, and that is deliberate. Blocking the app until a code
 * is entered would mean one mail outage locks out every new sign-up at once,
 * and this app runs no queue to retry a failed send with — the failure would
 * be total and silent. The flag records a fact worth having; it does not hold
 * the product hostage to a third party.
 *
 * Mounted in `Layout`, so it follows the reader across every page rather than
 * being something they can walk away from by clicking a link.
 */
export default function VerifyEmailBanner() {
  const { token, user, setUser } = useAuth()

  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [note, setNote] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  /* Dismissal lives in component state, and Layout never unmounts — so it
     lasts the session and returns on the next load. Anything longer would
     let someone permanently hide the one prompt that fixes the problem. */
  const [hidden, setHidden] = useState(false)

  // Nothing to nag about for a verified account, one signed out, or one whose
  // /me call has not landed yet.
  if (!user || user.email_verified_at || hidden) return null

  async function sendCode() {
    setError(null)
    setNote(null)
    setBusy(true)
    try {
      const res = await api.sendVerifyCode(token)
      setNote(res.message)
      setOpen(true)
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
      // The updated user replaces the one in context, so this banner
      // disappears without a refetch or a reload.
      if (res.user) setUser(res.user)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="ve" role="status">
      <div className="ve-inner">
        <span className="ve-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
            <path d="M3 6.5 12 13l9-6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <div className="ve-text">
          <strong className="ve-title">Confirm your email</strong>{' '}
          <span className="ve-body">
            {/* One clause, not two. The longer version — "Entering it keeps
                your account recoverable if you forget your password" — wrapped
                the bar onto a second and sometimes third line above every
                page, which is what made it the loudest thing on a screen it
                is not the subject of. The reason still has to be stated;
                it just does not need a subordinate clause. */}
            We sent a code to {user.email} — confirm it to keep your account
            recoverable.
          </span>
        </div>

        {!open ? (
          <div className="ve-actions">
            <button type="button" className="ve-btn" onClick={() => setOpen(true)}>
              Enter code
            </button>
            <button type="button" className="ve-btn-quiet" onClick={sendCode} disabled={busy}>
              {busy ? 'Sending…' : 'Resend'}
            </button>
          </div>
        ) : (
          <form className="ve-form" onSubmit={submit}>
            <label className="ve-sr" htmlFor="ve-code">
              Six-digit code
            </label>
            <input
              id="ve-code"
              className="ve-code"
              /* `text` with a numeric inputMode, not `type=number`: a number
                 field strips leading zeros, and half of all codes start with
                 one. */
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
            <button type="submit" className="ve-btn" disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Confirm'}
            </button>
            <button type="button" className="ve-btn-quiet" onClick={sendCode} disabled={busy}>
              Resend
            </button>
          </form>
        )}

        <button
          type="button"
          className="ve-close"
          onClick={() => setHidden(true)}
          aria-label="Hide this until next time"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {(note || error) && (
        <p className={error ? 've-msg ve-msg-bad' : 've-msg'}>{error || note}</p>
      )}
    </div>
  )
}
