import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import './Checkout.css'

/* The page has TWO payment modes, chosen by whether the server has Stripe keys.

   Live: Stripe's Payment Element mounts here and card details go straight to
   Stripe from the browser — they never touch Verbo's server. This page does NOT
   confirm anything on success; Stripe's webhook does, because a student who
   pays and closes the tab must still get their lesson.

   Demo: no keys configured, so the button calls the old settle endpoint and
   says plainly on screen that nothing is charged. Kept rather than deleted so
   a fresh checkout with no Stripe account still works end to end. */
const METHODS = [
  { key: 'card', label: 'Credit / Debit Card', note: 'Visa, Mastercard, Amex' },
  { key: 'wallet', label: 'Verbo Wallet', note: 'Not available yet', disabled: true },
]

/* Matches the app's own palette so Stripe's iframe does not arrive looking like
   a different website pasted into the card. */
const STRIPE_APPEARANCE = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#a89ce3',
    colorText: '#1c1730',
    colorTextSecondary: '#726c88',
    colorDanger: '#b02a2a',
    fontFamily: 'Hellix, system-ui, sans-serif',
    borderRadius: '10px',
    spacingUnit: '4px',
  },
}

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
      setError(err.message || 'That payment could not be completed.')
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
    <form onSubmit={submit}>
      <PaymentElement onReady={() => setReady(true)} />

      {error && <p className="ck-error">{error}</p>}

      <button type="submit" className="ck-cta ck-pay-btn" disabled={!stripe || !ready || busy}>
        {busy ? 'Processing…' : `Pay ${amountLabel} →`}
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
  const [method, setMethod] = useState('card')
  const [paying, setPaying] = useState(false)
  const [paid, setPaid] = useState(false)

  const [stripeKey, setStripeKey] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)

  const isCourse = kind === 'course'

  /* loadStripe fires a network request, so it is memoised on the key rather
     than called on every render. Null until the server says payments are live,
     which is what keeps a keyless install from loading Stripe at all. */
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey])

  /* Ask whether payments are live, and if so mint the intent for THIS purchase.
     Both are swallowed on failure: the page falls back to the demo button
     rather than stranding the student on a checkout that cannot render. */
  useEffect(() => {
    let live = true
    if (!item) return undefined

    api
      .paymentConfig()
      .then((cfg) => {
        if (!live || !cfg.enabled) return null
        setStripeKey(cfg.publishable_key)
        return api.paymentIntent(token, isCourse ? 'course' : 'lesson', item.id)
      })
      .then((intent) => {
        if (live && intent?.client_secret) setClientSecret(intent.client_secret)
      })
      .catch((err) => live && setError(err.message))

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

  async function pay() {
    setError(null)
    setPaying(true)
    try {
      /* The seam: today this just records payment. When Stripe lands, its
         webhook calls the same endpoint and this button opens the card sheet.

         A private lesson is NOT confirmed here — paying turns it into a request
         the tutor still has to accept. A course is, because a course has no
         approval step: the tutor published the schedule and seats are seats. */
      if (isCourse) await api.confirmEnrollment(token, item.id)
      else await api.payBooking(token, item.id)
      setPaid(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setPaying(false)
    }
  }

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

  return (
    <div className="ck">
      {/* ONE CENTRED COLUMN, and Back belongs inside it. The layout is capped
          at 980px, so on a wide screen it was pinned to the page's left gutter
          with the whole remainder empty to its right — two cards adrift in a
          room. Centring only `.ck-layout` would have left Back behind at the
          old edge, which is why this is a wrapper rather than a margin. */}
      <div className="ck-col">
        <button type="button" className="ck-back" onClick={() => navigate(-1)}>
          ← Back
        </button>

        <div className="ck-layout">
        {/* Screen 4: what you are paying for. */}
        <section className="ck-card">
          <h1 className="ck-h1">Booking summary</h1>
          <dl className="ck-summary">
            {order.lines.map((l) => (
              <div key={l.label}>
                <dt>{l.label}</dt>
                <dd>{l.value || '—'}</dd>
              </div>
            ))}
            <div className="ck-total">
              <dt>Total</dt>
              <dd>${order.price}</dd>
            </div>
          </dl>
        </section>

        {/* Screen 5: payment. */}
        <section className="ck-card ck-pay">
          <h2 className="ck-h2">Payment</h2>
          <p className="ck-amount">${Number(order.price).toFixed(2)}</p>

          {/* The hand-rolled method list belongs to the demo path only. With
              Stripe live, the Payment Element offers whatever the account has
              actually enabled, and a second list beside it would claim choices
              that may not exist. */}
          {!clientSecret && (
            <div className="ck-methods">
              {METHODS.map((m) => (
                <label
                  key={m.key}
                  className={`ck-method${method === m.key ? ' active' : ''}${m.disabled ? ' off' : ''}`}
                >
                  <input
                    type="radio"
                    name="method"
                    value={m.key}
                    checked={method === m.key}
                    disabled={m.disabled}
                    onChange={() => setMethod(m.key)}
                  />
                  <span>
                    {m.label}
                    <em>{m.note}</em>
                  </span>
                </label>
              ))}
            </div>
          )}

          {clientSecret && stripePromise ? (
            <>
              {/* THE PROCESSOR IS NEVER NAMED ON SCREEN. The sentence still
                  has to be true and still has to say the thing that matters —
                  that Verbo's own server never sees a card number — so it
                  names the guarantee rather than the vendor. The code below
                  is unchanged; this is wording, not plumbing. */}
              <p className="ck-secure">
                <LockIcon />
                Card details go straight to the payment provider and never reach
                Verbo.
              </p>

              {error && <p className="ck-error">{error}</p>}

              {/* Keyed on the secret so a new intent remounts the provider —
                  Elements cannot be handed a different secret in place. */}
              <Elements
                key={clientSecret}
                stripe={stripePromise}
                options={{ clientSecret, appearance: STRIPE_APPEARANCE }}
              >
                <StripePayForm
                  amountLabel={`$${Number(order.price).toFixed(2)}`}
                  onPaid={() => setPaid(true)}
                />
              </Elements>
            </>
          ) : (
            <>
              {/* Stated plainly rather than mocked up as a card form: collecting
                  fake card numbers would be worse than admitting there is no
                  processor wired in yet. */}
              <p className="ck-mock">
                <LockIcon />
                Demo checkout — no card details are collected and nothing is
                charged. Add payment keys to the backend&rsquo;s .env to take
                real payments.
              </p>

              {error && <p className="ck-error">{error}</p>}

              <button type="button" className="ck-cta ck-pay-btn" onClick={pay} disabled={paying}>
                {paying ? 'Processing…' : `Pay $${order.price} →`}
              </button>
            </>
          )}
        </section>
        </div>
      </div>
    </div>
  )
}
