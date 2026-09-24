import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { CARD_APPEARANCE, MastercardMark, VisaMark } from '../components/CardBrands'
import './Checkout.css'
import './UpgradeCheckout.css'

/* Card payments only. The card form is rendered by the payment provider in
   iframes, so card numbers go straight from the browser to the provider and
   never touch Verbo's server. This page does NOT confirm anything on success;
   the webhook does, because a student who pays and closes the tab must still
   get their lesson.

   Laid out like the Pro checkout (`uc-` classes from UpgradeCheckout.css) so
   every place Verbo takes money looks like one product. */

const whenFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function describeDays(days = []) {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d])
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

function LockIcon() {
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
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

/**
 * The live card form.
 *
 * Its own component because `useStripe`/`useElements` only work beneath
 * `<Elements>`, and that provider needs the client secret before it can mount.
 *
 * `redirect: 'if_required'` keeps the student on this page for ordinary cards
 * and hands them off only when the bank demands 3-D Secure, which is exactly
 * when a redirect is worth the interruption.
 */
function StripePayForm({ amountLabel, onPaid }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!stripe || !elements) return

    setError(null)
    setBusy(true)

    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href },
    })

    if (err) {
      setError(
        err.type === 'card_error'
          ? `${err.message} No charge was made.`
          : err.message || 'That payment could not be completed.',
      )
      setBusy(false)
      return
    }

    /* `succeeded` means Stripe has the money. Fulfilment is the webhook's job
       and may land a moment later, so this does NOT confirm anything itself —
       it just stops asking the student to pay again. `processing` covers slower
       methods that settle asynchronously; the webhook handles those too. */
    if (paymentIntent && ['succeeded', 'processing'].includes(paymentIntent.status)) {
      onPaid()
      return
    }

    setError('That payment did not complete. Please try again.')
    setBusy(false)
  }

  return (
    <form className="uc-form" onSubmit={submit}>
      <div className="uc-cards">
        <span>Card</span>
        <span className="uc-brands" aria-label="Visa and Mastercard accepted">
          <VisaMark />
          <MastercardMark />
        </span>
      </div>
      <PaymentElement
        onReady={() => setReady(true)}
        options={{ wallets: { link: 'never', applePay: 'never', googlePay: 'never' } }}
      />

      {error && <p className="uc-alert" role="alert">{error}</p>}

      <button type="submit" className="uc-cta" disabled={!stripe || !ready || busy}>
        {busy ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
    </form>
  )
}

/**
 * Screens 4-6 for both flows: summary, payment, confirmation.
 *
 * A private booking and a group enrolment differ entirely up to this point —
 * one picks a time, the other accepts a schedule — but from "what am I paying
 * for" onwards they are the same three steps, so they share one page rather
 * than two that drift apart.
 */
export default function Checkout() {
  const { kind, id } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 'loading' until we know; 'off' when card payments are not set up.
  const [payState, setPayState] = useState('loading')
  const [paid, setPaid] = useState(false)

  const [stripeKey, setStripeKey] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)

  const isCourse = kind === 'course'

  /* loadStripe fires a network request, so it is memoised on the key rather
     than called on every render. Null until the server says payments are live,
     which is what keeps a keyless install from loading Stripe at all. */
  const stripePromise = useMemo(
    () =>
      stripeKey
        ? loadStripe(stripeKey, {
            developerTools: { assistant: { enabled: false } },
          })
        : null,
    [stripeKey],
  )

  /* Ask whether payments are live, and if so mint the intent for THIS purchase. */
  useEffect(() => {
    let live = true
    if (!item) return undefined

    api
      .paymentConfig()
      .then((cfg) => {
        if (!live) return null
        if (!cfg.enabled) {
          setPayState('off')
          return null
        }
        setStripeKey(cfg.publishable_key)
        return api.paymentIntent(token, isCourse ? 'course' : 'lesson', item.id)
      })
      .then((intent) => {
        if (live && intent?.client_secret) {
          setClientSecret(intent.client_secret)
          setPayState('ready')
        }
      })
      .catch((err) => {
        if (!live) return
        setError(err.message)
        setPayState('error')
      })

    return () => {
      live = false
    }
  }, [item, token, isCourse])

  useEffect(() => {
    let live = true
    const load = isCourse
      ? api.getMyEnrollments(token).then((rows) => rows.find((r) => String(r.id) === String(id)))
      : api.getBookings(token).then((d) => d.sent.find((b) => String(b.id) === String(id)))

    load
      .then((found) => {
        if (!live) return
        if (!found) setError('That order could not be found.')
        else setItem(found)
      })
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [token, id, isCourse])

  if (loading) return <p className="ck-note">Loading your order…</p>

  if (!item) {
    return (
      <div className="ck">
        <p className="ck-error">{error || 'Order not found.'}</p>
        <Link to="/find-tutor" className="ck-ghost">
          Back to Find Tutor
        </Link>
      </div>
    )
  }

  /* One shape for both, so the summary and the receipt below are written once. */
  const order = isCourse
    ? {
        title: item.course?.title,
        tutor: item.course?.tutor_profile?.user?.name,
        photo: item.course?.tutor_profile?.photo_url,
        price: item.course?.price,
        lines: [
          { label: 'Course', value: item.course?.title },
          { label: 'Teacher', value: item.course?.tutor_profile?.user?.name },
          {
            label: 'Runs',
            value: `${dateFmt.format(new Date(item.course?.starts_on))} – ${dateFmt.format(
              new Date(item.course?.ends_on),
            )}`,
          },
          {
            label: 'Schedule',
            value: `${describeDays(item.course?.days_of_week)}, ${String(item.course?.start_time).slice(0, 5)}`,
          },
          {
            label: 'Classes',
            value: `${item.course?.total_classes} over ${item.course?.weeks} weeks`,
          },
        ],
        doneTitle: 'Enrolment confirmed',
        doneWhen: `${describeDays(item.course?.days_of_week)} · from ${dateFmt.format(new Date(item.course?.starts_on))}`,
      }
    : {
        title: item.lesson?.name || 'Lesson',
        tutor: item.tutor?.name,
        // The tutor's marketing photo first, then their account picture.
        photo: item.tutor?.tutor_profile?.photo_url || item.tutor?.avatar_url,
        price: item.lesson?.price ?? 0,
        lines: [
          { label: 'Tutor', value: item.tutor?.name },
          { label: 'Lesson', value: item.lesson?.name || 'Lesson' },
          {
            label: 'Date',
            value: item.starts_at ? whenFmt.format(new Date(item.starts_at)) : '—',
          },
          {
            label: 'Time',
            value: item.starts_at
              ? `${timeFmt.format(new Date(item.starts_at))} · ${item.duration_minutes} min`
              : '—',
          },
        ],
        doneTitle: 'Request sent',
        doneWhen: item.starts_at
          ? `${whenFmt.format(new Date(item.starts_at))} · ${timeFmt.format(new Date(item.starts_at))}`
          : '',
      }

  if (paid) {
    return (
      <div className="ck">
        <section className="ck-card ck-done">
          <span className="ck-done-mark">
            <CheckIcon />
          </span>
          <h1 className="ck-done-title">{order.doneTitle}</h1>
          {/* Paying does not lock a private lesson in — saying "booked" here is
              what made the tutor's approval invisible to the student. */}
          {!isCourse && (
            <p className="ck-done-pending">
              Your tutor has to accept it before the lesson is confirmed. It will sit under
              <strong> Requests</strong> until they do.
            </p>
          )}
          <p className="ck-done-sub">
            {order.title}
            {order.tutor ? ` with ${order.tutor}` : ''}
          </p>
          <p className="ck-done-when">{order.doneWhen}</p>

          <div className="ck-done-actions">
            <Link to="/bookings" className="ck-cta">
              View my lessons
            </Link>
            <Link to="/find-tutor" className="ck-ghost">
              Back to Find Tutor
            </Link>
          </div>
        </section>
      </div>
    )
  }

  const tutorName = order.tutor || 'Your tutor'
  const amount = `$${Number(order.price).toFixed(2)}`
  /* The tutor and the lesson are already in the card's header, so the rows
     beneath it are the facts that remain — when, and for how long. */
  const details = order.lines.filter((l) => !['Tutor', 'Teacher', 'Lesson', 'Course'].includes(l.label))

  return (
    <div className="uc">
      <header className="uc-head">
        <button type="button" className="uc-back uc-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeftIcon /> Back
        </button>
        <h1 className="uc-title">Checkout</h1>
      </header>

      <div className="uc-grid">
        {/* ---- what you are paying for ---- */}
        <aside className="uc-card uc-summary">
          <div className="uc-plan">
            <span className="uc-plan-mark uc-plan-photo">
              {order.photo ? (
                <img src={order.photo} alt="" />
              ) : (
                <span>{tutorName.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <div>
              <h2 className="uc-plan-name">{order.title}</h2>
              <p className="uc-plan-sub">
                with {tutorName}
              </p>
            </div>
          </div>

          <ul className="uc-benefits">
            {details.map((l) => (
              <li key={l.label}>
                <span className="uc-benefit-mark">{DETAIL_ICONS[l.label] || <CalendarIcon />}</span>
                <span>
                  <strong>{l.value || '—'}</strong>
                  {l.label}
                </span>
              </li>
            ))}
          </ul>

          <dl className="uc-order">
            <div>
              <dt>{order.title}</dt>
              <dd>{amount}</dd>
            </div>
            <div className="uc-order-total">
              <dt>Total</dt>
              <dd>{amount}</dd>
            </div>
            {!isCourse && (
              <p className="uc-order-note">
                {tutorName} confirms the lesson after you pay. If they decline, it isn’t booked.
              </p>
            )}
          </dl>
        </aside>

        {/* ---- payment ---- */}
        <section className="uc-card uc-pay" aria-labelledby="ck-pay-title">
          <h2 id="ck-pay-title" className="uc-pay-title">
            Payment details
          </h2>

          {payState === 'loading' && <PaySkeleton />}

          {payState === 'ready' && clientSecret && stripePromise && (
            <>
              {/* Keyed on the secret so a new intent remounts the provider —
                  Elements cannot be handed a different secret in place. */}
              <Elements
                key={clientSecret}
                stripe={stripePromise}
                options={{ clientSecret, appearance: CARD_APPEARANCE }}
              >
                <StripePayForm amountLabel={amount} onPaid={() => setPaid(true)} />
              </Elements>
              <p className="uc-fine uc-fine-gap">
                <LockIcon /> Card details go straight to the payment provider and never reach Verbo.
              </p>
            </>
          )}

          {payState === 'off' && (
            <div className="uc-state">
              <h3>Card payments aren’t set up yet</h3>
              <p>This lesson can’t be paid for right now. Please try again later.</p>
              <Link to="/bookings" className="uc-cta uc-cta-link">
                View my lessons
              </Link>
            </div>
          )}

          {payState === 'error' && (
            <div className="uc-state">
              <h3>Payment couldn’t start</h3>
              <p>{error || 'Check your connection and try again.'}</p>
              <button type="button" className="uc-cta" onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function PaySkeleton() {
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

/* ---- icons: the app's set — 24 grid, 1.7 stroke, currentColor ---- */

function Svg({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}
function ArrowLeftIcon() {
  return <Svg><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>
}
function CalendarIcon() {
  return <Svg><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>
}
function ClockIcon() {
  return <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5.3l3.2 1.9" /></Svg>
}
function RepeatIcon() {
  return <Svg><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" /></Svg>
}
function StackIcon() {
  return <Svg><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></Svg>
}

const DETAIL_ICONS = {
  Date: <CalendarIcon />,
  Time: <ClockIcon />,
  Runs: <CalendarIcon />,
  Schedule: <RepeatIcon />,
  Classes: <StackIcon />,
}
