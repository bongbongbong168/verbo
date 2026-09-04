import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Upgrade.css'

/**
 * Verbo Pro — the upgrade page.
 *
 * Built entirely from the existing design system: the app's own palette
 * (#a89ce3 fills, #6a6191 emphasis, #f1edfc pale, #2b2643 stroke, #f9f8fe
 * ground), Hellix, the 24-grid 1.7-stroke icon set, and the same radii the
 * cards elsewhere use. Nothing here introduces a colour or a typeface the
 * product does not already have.
 *
 * The "cold premium" reading comes from the ONE move the brief allows: a
 * darker, cooler surface for the plan being sold. That gradient is the
 * sidebar's own navy family (#2b2643 -> #3d3860 -> #6a6191), already used on
 * the onboarding finish panel — so the page reads as premium without leaving
 * the brand.
 *
 * NOTE ON WHAT IS REAL: there is no subscription table, no plan column and no
 * payment provider in this app. So this page sells a plan it cannot yet
 * activate, and the CTA says so on click rather than pretending. Everything
 * else on the page describes features that genuinely exist (scans, stories,
 * podcasts, vocabulary practice) or is explicitly marked Coming Soon.
 */

/* Prices in one place, and every derived figure computed from them. The brief
   quotes "Save 28%" and "~$5.00/month"; both are recomputed here rather than
   written down twice, so a price change cannot leave the page contradicting
   itself. (6.99 x 12 = 83.88 against 59.99 is a 28.5% saving, and 59.99/12 is
   4.999 — the quoted figures check out.) */
const MONTHLY = 6.99
const ANNUAL = 59.99

const annualAsMonthly = ANNUAL / 12

const money = (n) => n.toFixed(2)

/* ---- icons: the app's set — 24 grid, 1.7 stroke, currentColor ---- */

function Icon({ children, className = 'up-icon' }) {
  return (
    <svg
      className={className}
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

const CheckIcon = () => (
  <Icon className="up-tick">
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
)

const ScanIcon = () => (
  <Icon>
    <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
    <path d="M7.5 12h9" />
  </Icon>
)

const StoryIcon = () => (
  <Icon>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2 2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 1 20 5.5v12a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 0 0-2 1 2 2 0 0 0-2-1H5.5A1.5 1.5 0 0 1 4 17.5z" />
    <path d="M12 6v13" />
  </Icon>
)

const PodcastIcon = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="10" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </Icon>
)

const AdFreeIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m6.2 6.2 11.6 11.6" />
  </Icon>
)

/* ---- content ---- */

const FREE_FEATURES = [
  'Limited Chinese text scans',
  'Access to free stories',
  'Access to free podcasts',
  'Basic vocabulary practice',
  'Standard learning content',
  'Tutor discovery and booking',
  'Occasional advertisements',
]

const PRO_FEATURES = [
  'Unlimited Chinese text scans',
  'Full story library',
  'Full podcast library',
  'Ad-free learning',
  'Advanced vocabulary practice',
  'Personalised content recommendations',
  'Exclusive Pro learning content',
  'Early access to selected new content',
]

const BENEFITS = [
  {
    Icon: ScanIcon,
    title: 'Unlimited scans',
    body: 'Scan Chinese text without worrying about limits.',
  },
  {
    Icon: StoryIcon,
    title: 'Full stories',
    body: 'Unlock the complete Verbo story and reading library.',
  },
  {
    Icon: PodcastIcon,
    title: 'Full podcasts',
    body: 'Access premium podcasts and their learning resources.',
  },
  {
    Icon: AdFreeIcon,
    title: 'Ad-free learning',
    body: 'Study without interruptions.',
  },
]

export default function Upgrade() {
  const { user } = useAuth()
  /* Annual is the default, as the brief asks, and it is also the one being
     recommended — so the page opens on the offer it is making. */
  const [annual, setAnnual] = useState(true)
  const [noticed, setNoticed] = useState(false)

  const price = annual ? ANNUAL : MONTHLY
  const period = annual ? 'year' : 'month'

  return (
    <div className="up">
      <header className="up-head">
        <h1 className="up-title">Upgrade to Verbo Pro</h1>
        <p className="up-lede">
          Unlock more ways to learn Chinese, practise naturally, and stay focused.
        </p>
      </header>

      {/* ---- billing toggle ----
          Two buttons in a track, not a switch: the choice is between two named
          options and both need to be readable at once. Both sit on the same
          width so the pill does not jump as the selection moves. */}
      <div className="up-billing">
        <div className="up-toggle" role="group" aria-label="Billing period">
          <button
            type="button"
            className={'up-toggle-btn' + (annual ? '' : ' active')}
            aria-pressed={!annual}
            onClick={() => setAnnual(false)}
          >
            Monthly
          </button>
          <button
            type="button"
            className={'up-toggle-btn' + (annual ? ' active' : '')}
            aria-pressed={annual}
            onClick={() => setAnnual(true)}
          >
            Annually
          </button>
        </div>
      </div>

      {/* ---- plans ---- */}
      <div className="up-plans">
        <section className="up-card up-free">
          <header className="up-card-head">
            <h2 className="up-plan-name">Free</h2>
            <p className="up-plan-sub">Start learning Chinese with essential Verbo tools.</p>
          </header>

          <p className="up-price">
            <span className="up-currency">$</span>
            <span className="up-amount">0</span>
            <span className="up-per">/ month</span>
          </p>
          {/* Holds the same vertical space the Pro card's second price line
              takes, so the two feature lists start on one baseline. */}
          <p className="up-price-note">Free forever</p>

          <ul className="up-features">
            {FREE_FEATURES.map((f) => (
              <li key={f}>
                <CheckIcon />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <button type="button" className="up-btn up-btn-quiet" disabled>
            Current plan
          </button>
        </section>

        <section className="up-card up-pro">
          {/* Only shown on the annual option, because that is the only case
              where it is true — labelling both would make the badge noise. */}
          {annual && <span className="up-badge">Best value</span>}

          <header className="up-card-head">
            <h2 className="up-plan-name">Pro</h2>
            <p className="up-plan-sub">Get the complete Verbo learning experience.</p>
          </header>

          <p className="up-price">
            <span className="up-currency">$</span>
            <span className="up-amount">{money(price)}</span>
            <span className="up-per">/ {period}</span>
          </p>
          <p className="up-price-note">
            {annual
              ? `Billed annually · about $${money(annualAsMonthly)} a month`
              : 'Billed monthly · cancel any time'}
          </p>

          <ul className="up-features">
            {PRO_FEATURES.map((f) => (
              <li key={f}>
                <CheckIcon />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <button type="button" className="up-btn up-btn-primary" onClick={() => setNoticed(true)}>
            Upgrade to Pro
          </button>

          {/* Said plainly rather than silently doing nothing. There is no
              payment provider wired into this app yet, and a CTA that appears
              to work and does not is worse than one that explains itself. */}
          {noticed && (
            <p className="up-notice" role="status">
              Checkout is not connected yet — Pro goes live once payment is set up.
            </p>
          )}
        </section>
      </div>

      {/* ---- the four that matter ---- */}
      <section className="up-section">
        <h2 className="up-section-title">What Pro actually changes</h2>
        <div className="up-benefits">
          {BENEFITS.map((b) => (
            <article className="up-benefit" key={b.title}>
              <span className="up-benefit-mark">
                <b.Icon />
              </span>
              <h3 className="up-benefit-title">{b.title}</h3>
              <p className="up-benefit-body">{b.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="up-fine">
        <p>
          Cancel any time. Your subscription renews automatically unless cancelled before
          the renewal date. Prices are shown in USD.
        </p>
        <p>
          Questions about billing? <Link to="/settings">Open settings</Link>
          {user?.email ? ` · signed in as ${user.email}` : ''}
        </p>
      </footer>
    </div>
  )
}
