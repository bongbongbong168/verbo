import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import PremiumBadge from '../components/PremiumBadge'
import ProCrown from '../components/ProCrown'
import './UpgradeCheckout.css'

const MAX_TRIES = 8

/**
 * After paying: polls the subscription until it is active.
 *
 * Wears the checkout page's own look (`uc-`): same header, same card, same
 * crown and dark CTA - it is the next step of that page, and was an unstyled
 * text block before.
 */
export default function SubscriptionSuccess() {
  const { token, setUser } = useAuth()
  const [status, setStatus] = useState(null)
  const [tries, setTries] = useState(0)
  const sessionId = useSearchParams()[0].get('session_id')

  useEffect(() => {
    let live = true
    let timer
    /* With the session id Stripe sends back, the server checks the payment
       with Stripe directly; without one, just read the status. */
    ;(sessionId ? api.confirmSubscription(token, sessionId) : api.getSubscriptionStatus(token))
      .then((next) => {
        if (!live) return
        setStatus(next)
        // Pro now shows everywhere (Profile badge, locks) without a reload.
        if (next.is_pro) setUser?.((u) => (u ? { ...u, is_pro: true } : u))
        if (!['active', 'trialing'].includes(next.status) && tries < MAX_TRIES) {
          timer = setTimeout(() => setTries((n) => n + 1), 2500)
        }
      })
      .catch(() => {
        if (tries < MAX_TRIES) timer = setTimeout(() => setTries((n) => n + 1), 2500)
      })
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [token, tries, sessionId])

  const confirmed = ['active', 'trialing'].includes(status?.status)
  const slow = !confirmed && tries >= MAX_TRIES

  return (
    <div className="uc">
      <header className="uc-head">
        <h1 className="uc-title">{confirmed ? 'Welcome to Verbo Pro' : 'Confirming your payment'}</h1>
      </header>

      <section className="uc-card uc-done" aria-live="polite">
        <div className="uc-plan">
          <ProCrown className="uc-plan-crown" />
          <div>
            <h2 className="uc-plan-name">
              Verbo Pro <PremiumBadge inline />
            </h2>
            <p className="uc-plan-sub">Monthly subscription</p>
          </div>
        </div>

        <p className={'uc-done-state' + (confirmed ? ' is-ok' : '')}>
          <span className="uc-done-dot" aria-hidden="true" />
          {confirmed
            ? 'Your Pro access is ready.'
            : slow
              ? 'This is taking longer than usual. Try again, or head back to the plans.'
              : 'This usually takes a few moments. You can stay on this page.'}
        </p>

        {confirmed ? (
          <Link className="uc-cta" to="/dashboard">
            Continue learning
          </Link>
        ) : (
          <div className="uc-done-actions">
            <button type="button" className="uc-cta" onClick={() => setTries(0)} disabled={!slow}>
              {slow ? 'Try again' : 'Checking…'}
            </button>
            <Link className="uc-done-back" to="/upgrade">
              Back to plans
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
