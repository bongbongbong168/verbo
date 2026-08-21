import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useActivityHeartbeat from '../hooks/useActivityHeartbeat'
import logo from '../assets/sidebar/logo.png'
import logoMark from '../assets/sidebar/logo-mark.png'
import './Layout.css'

function NavIcon({ children }) {
  return (
    <svg
      className="sb-nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function DashboardIcon() {
  return (
    <NavIcon>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </NavIcon>
  )
}

function FlashcardIcon() {
  return (
    <NavIcon>
      <rect x="6" y="3" width="14" height="10" rx="2" />
      <rect x="4" y="7" width="14" height="10" rx="2" />
    </NavIcon>
  )
}

function ScanIcon() {
  return (
    <NavIcon>
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <line x1="4.5" y1="12" x2="19.5" y2="12" />
    </NavIcon>
  )
}

function ReadIcon() {
  return (
    <NavIcon>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v3h3" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </NavIcon>
  )
}

function PracticeIcon() {
  return (
    <NavIcon>
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.4-9.4z" />
    </NavIcon>
  )
}

function FindTutorIcon() {
  return (
    <NavIcon>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 5.8" />
      <path d="M18 14.9c1.8.9 3 2.7 3 4.6" />
    </NavIcon>
  )
}

function PodcastIcon() {
  return (
    <NavIcon>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="17.5" x2="12" y2="21" />
    </NavIcon>
  )
}

function StudyIcon() {
  return (
    <NavIcon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </NavIcon>
  )
}

function SettingsIcon() {
  return (
    <NavIcon>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9.5a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88v.09a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1.03z" />
    </NavIcon>
  )
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  )
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/flashcards', label: 'Flashcard Bank', Icon: FlashcardIcon },
  { to: '/scan', label: 'Scan', Icon: ScanIcon },
  { to: '/read', label: 'Read', Icon: ReadIcon },
  { to: '/practice', label: 'Practice', Icon: PracticeIcon },
  { to: '/find-tutor', label: 'Find Tutor', Icon: FindTutorIcon },
  { to: '/podcast', label: 'Podcast', Icon: PodcastIcon },
  { to: '/study', label: 'Study', Icon: StudyIcon },
]

export default function Layout() {
  const { user, logout, token } = useAuth()
  const navigate = useNavigate()

  // Counts time spent, for the Dashboard's activity chart. Mounted here so it
  // covers every authenticated page rather than being wired up per page.
  useActivityHeartbeat(token)

  // Persisted so the choice survives navigation and reloads — a sidebar that
  // silently re-expands on every page change would be worse than not having
  // the toggle. Read lazily so the first paint is already in the right state
  // and the rail does not flash open.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sb-collapsed') === '1'
  )

  useEffect(() => {
    localStorage.setItem('sb-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="sb-shell">
      <nav className={'sb' + (collapsed ? ' collapsed' : '')}>
        <div className="sb-head">
          {collapsed ? (
            <img className="sb-badge" src={logoMark} alt="Verbo" />
          ) : (
            <img className="sb-logo" src={logo} alt="Verbo" />
          )}
          <button
            type="button"
            className="sb-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <CollapseIcon />
          </button>
        </div>

        <p className="sb-section-label">Study Area</p>
        <ul className="sb-nav">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) => 'sb-nav-link' + (isActive ? ' active' : '')}
                // The label is the only thing naming the link, so when it is
                // hidden the tooltip has to carry it.
                title={collapsed ? label : undefined}
              >
                <Icon />
                <span className="sb-nav-label">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="sb-spacer" />

        {/* Below the spacer, not in the Study Area list — settings are not
            study content. */}
        <NavLink
          to="/settings"
          className={({ isActive }) => 'sb-nav-link sb-settings' + (isActive ? ' active' : '')}
          title={collapsed ? 'Settings' : undefined}
        >
          <SettingsIcon />
          <span className="sb-nav-label">Settings</span>
        </NavLink>

        {user && <p className="sb-user">{user.name}</p>}
        <button
          type="button"
          className="sb-logout"
          onClick={handleLogout}
          title={collapsed ? 'Log out' : undefined}
        >
          <span className="sb-logout-label">Log out</span>
        </button>

        <div className="sb-promo">
          <p className="sb-promo-title">Upgrade to PRO</p>
          <p className="sb-promo-text">Unlock premium features for free.</p>
          <button type="button" className="sb-promo-btn" disabled title="Coming soon">
            TRY NOW
          </button>
        </div>
      </nav>
      <main className="sb-main">
        <Outlet />
      </main>
    </div>
  )
}
