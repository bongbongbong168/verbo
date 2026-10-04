import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { invalidate } from '../dataCache'
import './AddTeacher.css'

/**
 * Admin only: "Add teacher". Makes an EXISTING Verbo account an approved
 * tutor, then opens their profile so the admin can fill it in with Edit
 * profile. It never creates a login - the person signs up first. Prefix at-.
 */
export default function AddTeacher({ token }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => !wrap.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const { id } = await api.adminAddTutor(token, email.trim())
      invalidate('tutors')
      navigate(`/find-tutor/${id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="at" ref={wrap}>
      <button type="button" className="at-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Add teacher</span>
      </button>

      {open && (
        <form className="at-pop" onSubmit={submit}>
          <p className="at-title">Add a teacher</p>
          <p className="at-hint">
            Enter the email of their Verbo account. They become an approved tutor, and you can fill in
            their profile next.
          </p>
          <input
            type="email"
            className="at-input"
            placeholder="teacher@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
          {error && <p className="at-error" role="alert">{error}</p>}
          <div className="at-actions">
            <button type="button" className="at-cancel" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="at-add" disabled={busy || !email.trim()}>
              {busy ? 'Adding…' : 'Add teacher'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
