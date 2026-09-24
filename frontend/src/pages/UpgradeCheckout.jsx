import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from '@stripe/react-stripe-js/checkout'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import PremiumBadge from '../components/PremiumBadge'
import './UpgradeCheckout.css'

/* Verbo Pro checkout at /upgrade/checkout (prefix `uc-`).
 *
 * The payment fields are rendered by the payment provider inside iframes, so
 * card numbers never touch Verbo's code; everything around them is ours.
 *
 * What this page deliberately does NOT do:
 * - choose a price. The server creates the session from its configured
 *   recurring Pro price; the only thing sent is `ui: 'elements'`.
 * - grant Pro. Paying redirects to /upgrade/success, which waits for the
 *   webhook-written status before saying anything is unlocked. */

const BENEFITS = [
  { title: 'Premium articles', body: 'The full story and reading library.', Icon: BookIcon },
  { title: 'Premium podcasts', body: 'Every episode with its transcript.', Icon: HeadphonesIcon },
  { title: 'More translations', body: 'Expanded full-text translation.', Icon: TranslateIcon },
  { title: '100 scans a month', body: 'Photograph Chinese text as you go.', Icon: ScanIcon },
  { title: 'Gemini practice', body: 'A bigger practice-assistant allowance.', Icon: SparkIcon },
]

/* Matches the app's inputs: Hellix, hairline lavender borders, 12px radius,
   lavender focus ring. Fonts fall back to the system face inside the frames. */
const APPEARANCE = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#6a6191',
    colorText: '#1c1730',
    colorTextSecondary: '#726c88',
    colorTextPlaceholder: '#a09bb3',
    colorDanger: '#b02a2a',
    colorBackground: '#ffffff',
    fontFamily: 'Hellix, system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSizeBase: '15px',
    borderRadius: '12px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid #e7e3f6', boxShadow: 'none', padding: '12px 14px' },
    '.Input:focus': { border: '1px solid #a89ce3', boxShadow: '0 0 0 3px rgba(168, 156, 227, 0.28)' },
    '.Input--invalid': { border: '1px solid #b02a2a', boxShadow: 'none' },
    '.Label': { fontWeight: '600', color: '#1c1730', marginBottom: '6px' },
    '.Tab': { border: '1px solid #e7e3f6', boxShadow: 'none' },
    '.Tab--selected': { border: '1px solid #a89ce3', boxShadow: '0 0 0 3px rgba(168, 156, 227, 0.22)' },
  },
}

/** Plain words for a declined card; the bank's own reason where we know it. */
function declinedMessage(declineCode) {
  const reasons = {
    insufficient_funds: 'Your card has insufficient funds.',
    expired_card: 'Your card has expired.',
    incorrect_cvc: 'The security code is incorrect.',
    lost_card: 'This card has been reported lost.',
    stolen_card: 'This card has been reported stolen.',
  }
  return `${reasons[declineCode] || 'Your bank declined this payment.'} No charge was made — try another card or contact your bank.`
}

function PayForm({ fallbackPrice }) {
  const navigate = useNavigate()
  const state = useCheckoutElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (state.type === 'loading') return <FormSkeleton />
  if (state.type === 'error') {
    return <p className="uc-alert" role="alert">The payment form could not load. {state.error.message}</p>
  }

  const { checkout } = state
  // The session is the authority on what will be charged.
  const total = checkout.total?.total?.amount || fallbackPrice

  async function subscribe(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await checkout.confirm()
      if (result.type === 'error') {
        setError(
          result.error.code === 'paymentFailed'
            ? declinedMessage(result.error.paymentFailed?.declineCode)
            : result.error.message || 'Please check your payment details.',
        )
        return
      }
      // Normally the provider redirects to the return URL itself; this covers
      // the case where it resolves in place.
      navigate(`/upgrade/success?session_id=${encodeURIComponent(checkout.id)}`)
    } catch {
      setError('We couldn’t reach the payment service. Check your connection and try again — you have not been charged.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="uc-form" onSubmit={subscribe} noValidate>
      {/* Card only (set on the server). Visa and Mastercard are the brands shown. */}
      <div className="uc-cards">
        <span>Card</span>
        <span className="uc-brands" aria-label="Visa and Mastercard accepted">
          <VisaMark />
          <MastercardMark />
        </span>
      </div>
      <PaymentElement options={{ wallets: { link: 'never', applePay: 'never', googlePay: 'never' } }} />

      {error && <p className="uc-alert" role="alert">{error}</p>}

      <button type="submit" className="uc-cta" disabled={busy}>
        {busy ? 'Confirming…' : `Subscribe monthly · ${total}`}
      </button>
      <p className="uc-fine">
        <LockIcon /> Payments are encrypted. Renews every month until you cancel — cancel any time from
        your Upgrade page.
      </p>
    </form>
  )
}

function FormSkeleton() {
  // Static on purpose: no shimmer, same rule as the rest of the app.
  return (
    <div className="uc-skeleton" aria-label="Loading payment form">
      <span />
      <span />
      <span className="uc-skeleton-row">
        <span />
        <span />
      </span>
      <span className="uc-skeleton-cta" />
    </div>
  )
}

export default function UpgradeCheckout() {
  const { token } = useAuth()
  const [phase, setPhase] = useState('loading') // loading | ready | already | unavailable | error
  const [message, setMessage] = useState('')
  const [publishableKey, setPublishableKey] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  const [price, setPrice] = useState(null)

  const start = useCallback(async () => {
    setPhase('loading')
    setMessage('')
    try {
      const [cfg, status] = await Promise.all([api.paymentConfig(), api.getSubscriptionStatus(token)])
      if (status?.is_pro) return setPhase('already')
      if (!cfg?.enabled || !cfg.publishable_key || !status?.price) return setPhase('unavailable')
      setPrice(status.price)
      const session = await api.createSubscriptionCheckout(token, 'elements')
      setPublishableKey(cfg.publishable_key)
      setClientSecret(session.client_secret)
      setPrice(session.price || status.price)
      setPhase('ready')
    } catch (err) {
      if (err?.status === 409) return setPhase('already')
      if (err?.status === 422) return setPhase('unavailable')
      setMessage(
        err?.status ? err.message : 'We couldn’t connect. Check your internet connection and try again.',
      )
      setPhase('error')
    }
  }, [token])

  useEffect(() => {
    if (token) start()
  }, [token, start])

  // loadStripe makes a network request, so it is created once per key.
  const providerPromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey, { developerTools: { assistant: { enabled: false } } }) : null),
    [publishableKey],
  )

  const monthly = price?.monthly_display?.replace(/\s*\/\s*month$/, '') || '—'

  return (
    <div className="uc">
      <header className="uc-head">
        <Link to="/upgrade" className="uc-back">
          <ArrowLeftIcon /> Back to plans
        </Link>
        <h1 className="uc-title">Checkout</h1>
      </header>

      <div className="uc-grid">
        {/* ---- order summary ---- */}
        <aside className="uc-card uc-summary">
          <div className="uc-plan">
            <span className="uc-plan-mark">
              <CrownIcon />
            </span>
            <div>
              <h2 className="uc-plan-name">
                Verbo Pro <PremiumBadge inline />
              </h2>
              <p className="uc-plan-sub">Monthly subscription</p>
            </div>
          </div>

          <ul className="uc-benefits">
            {BENEFITS.map(({ title, body, Icon }) => (
              <li key={title}>
                <span className="uc-benefit-mark">
                  <Icon />
                </span>
                <span>
                  <strong>{title}</strong>
                  {body}
                </span>
              </li>
            ))}
          </ul>

          <dl className="uc-order">
            <div>
              <dt>Verbo Pro · monthly</dt>
              <dd>{monthly}</dd>
            </div>
            <div className="uc-order-total">
              <dt>Due today</dt>
              <dd>{monthly}</dd>
            </div>
            <p className="uc-order-note">Then {monthly} every month. Cancel any time.</p>
          </dl>
        </aside>

        {/* ---- payment ---- */}
        <section className="uc-card uc-pay" aria-labelledby="uc-pay-title">
          <h2 id="uc-pay-title" className="uc-pay-title">
            Payment details
          </h2>

          {phase === 'loading' && <FormSkeleton />}

          {phase === 'ready' && (
            <CheckoutElementsProvider
              stripe={providerPromise}
              options={{ clientSecret, elementsOptions: { appearance: APPEARANCE } }}
            >
              <PayForm fallbackPrice={monthly} />
            </CheckoutElementsProvider>
          )}

          {phase === 'already' && (
            <div className="uc-state">
              <h3>You already have Verbo Pro</h3>
              <p>Your subscription is active, so there’s nothing to pay.</p>
              <Link to="/upgrade" className="uc-cta uc-cta-link">
                Manage subscription
              </Link>
            </div>
          )}

          {phase === 'unavailable' && (
            <div className="uc-state">
              <h3>Checkout isn’t available right now</h3>
              <p>Pro subscriptions can’t be started at the moment. Please try again later.</p>
              <Link to="/upgrade" className="uc-cta uc-cta-link">
                Back to plans
              </Link>
            </div>
          )}

          {phase === 'error' && (
            <div className="uc-state">
              <h3>Something went wrong</h3>
              <p>{message}</p>
              <button type="button" className="uc-cta" onClick={start}>
                Try again
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* ---- icons: the app's set — 24 grid, 1.7 stroke, currentColor ---- */

function Svg({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}
/* Card-brand marks, drawn rather than fetched. */
function VisaMark() {
  return (
    <svg className="uc-brand" viewBox="0 0 48 30" role="img" aria-label="Visa">
      <rect width="48" height="30" rx="5" fill="#fff" stroke="#e7e3f6" />
      <text x="24" y="20" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="12.5" fontStyle="italic" fontWeight="700" fill="#1a1f71">VISA</text>
    </svg>
  )
}
function MastercardMark() {
  return (
    <svg className="uc-brand" viewBox="0 0 48 30" role="img" aria-label="Mastercard">
      <rect width="48" height="30" rx="5" fill="#fff" stroke="#e7e3f6" />
      <circle cx="20" cy="15" r="8" fill="#eb001b" />
      <circle cx="28" cy="15" r="8" fill="#f79e1b" />
      <path d="M24 8.1a8 8 0 0 1 0 13.8 8 8 0 0 1 0-13.8z" fill="#ff5f00" />
    </svg>
  )
}
function ArrowLeftIcon() {
  return <Svg><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>
}
function LockIcon() {
  return <Svg><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
}
function CrownIcon() {
  return <Svg><path d="M4 8l4 3.5L12 5l4 6.5L20 8l-1.6 10H5.6z" /></Svg>
}
function BookIcon() {
  return <Svg><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></Svg>
}
function HeadphonesIcon() {
  return <Svg><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></Svg>
}
function TranslateIcon() {
  return <Svg><path d="M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c-.5 3-2.5 6-6 8" /><path d="M13 21l4-9 4 9M14.5 18h5" /></Svg>
}
function ScanIcon() {
  return <Svg><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" /></Svg>
}
function SparkIcon() {
  return <Svg><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></Svg>
}
