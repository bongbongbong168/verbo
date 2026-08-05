import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/sidebar/logo.png'
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
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="sb-shell">
      <nav className="sb">
        <img className="sb-logo" src={logo} alt="Verbo" />

        <p className="sb-section-label">Study Area</p>
        <ul className="sb-nav">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) => 'sb-nav-link' + (isActive ? ' active' : '')}
              >
                <Icon />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="sb-spacer" />

        {user && <p className="sb-user">{user.name}</p>}
        <button type="button" className="sb-logout" onClick={handleLogout}>
          Log out
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
