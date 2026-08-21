import { Link } from 'react-router-dom'
import './SectionToggle.css'

// One component for the Podcast/Reads switch. It used to be duplicated markup
// in Read.jsx, ReadArticle.jsx and Podcast.jsx against two near-identical
// stylesheets (.rd-toggle and .pc-toggle), which is exactly how the two pages
// drifted apart — the fill, the gap and the indicator all differed depending
// on which page you were standing on.

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="17.5" x2="12" y2="21" />
    </svg>
  )
}

function BooksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M12 3 2.5 7.5 12 12l9.5-4.5L12 3z" />
      <path d="M2.5 12 12 16.5 21.5 12" fill="none" />
      <path d="M2.5 16.5 12 21l9.5-4.5" fill="none" />
    </svg>
  )
}

const SECTIONS = [
  { key: 'podcast', to: '/podcast', label: 'Podcast', Icon: MicIcon },
  { key: 'read', to: '/read', label: 'Reads', Icon: BooksIcon },
]

export default function SectionToggle({ active }) {
  return (
    <div className="tg">
      {SECTIONS.map(({ key, to, label, Icon }) => {
        const isActive = key === active
        const inner = (
          <>
            <Icon />
            <span className="tg-label">{label}</span>
          </>
        )

        // The current section is not a link — there is nowhere to go.
        return isActive ? (
          <span key={key} className="tg-item active" aria-current="page">
            {inner}
          </span>
        ) : (
          <Link key={key} to={to} className="tg-item">
            {inner}
          </Link>
        )
      })}
    </div>
  )
}
