import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import './ProfileMenu.css'

function PersonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  )
}

function ExitIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" />
      <path d="M19 12H10m9 0-3-3m3 3-3 3" />
    </svg>
  )
}

/**
 * The account button in the page header, and the popover it opens.
 *
 * Clicking it deliberately does NOT navigate. This control sits on every page,
 * so making it jump straight to the profile would pull the user out of whatever
 * they were doing every single time they reached for Settings or Log out. The
 * quick actions stay quick; the full profile has its own page behind "View
 * profile".
 */
export default function ProfileMenu() {
  const { user, logout, token } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [overview, setOverview] = useState(null)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)

  /* Fetched on first open, not on mount: this renders on every page, and the
     subtitle is not worth a request on a page load nobody asked for. Kept
     afterwards so reopening is instant. */
  useEffect(() => {
    if (!open || overview) return
    let live = true
    api
      .getUserOverview(token)
      .then((data) => live && setOverview(data))
      // A failed subtitle must not break the menu — the actions still work.
      .catch(() => {})
    return () => {
      live = false
    }
  }, [open, overview, token])

  // Click-away and Escape. Both are on document so a click anywhere outside
  // closes it, including on another page's controls.
  useEffect(() => {
    if (!open) return

    function onPointerDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      setOpen(false)
      // Focus goes back where it came from, or it lands on <body>.
      buttonRef.current?.focus()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function handleLogout() {
    setOpen(false)
    await logout()
    navigate('/login')
  }

  const initial = (user?.name || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="pm" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`pm-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
      >
        {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : initial}
      </button>

      {open && (
        <div className="pm-pop" role="menu">
          <div className="pm-head">
            {user?.avatar_url ? (
              <img className="pm-avatar" src={user.avatar_url} alt="" />
            ) : (
              <span className="pm-avatar">{initial}</span>
            )}
            <span className="pm-who">
              <span className="pm-name">{user?.name}</span>
              {/* The level is derived from what they last studied. Until they
                  have opened a unit there is nothing true to say, so this falls
                  back to the address that identifies the account. */}
              <span className="pm-sub">
                {overview?.level ? overview.level.title : user?.email}
              </span>
            </span>
          </div>

          <div className="pm-sep" />

          <Link className="pm-item" to="/profile" role="menuitem" onClick={() => setOpen(false)}>
            <PersonIcon />
            View profile
          </Link>
          <Link className="pm-item" to="/settings" role="menuitem" onClick={() => setOpen(false)}>
            <GearIcon />
            Settings
          </Link>
          <button type="button" className="pm-item pm-danger" role="menuitem" onClick={handleLogout}>
            <ExitIcon />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
