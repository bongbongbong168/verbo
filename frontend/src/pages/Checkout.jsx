import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { CARD_APPEARANCE, MastercardMark, VisaMark } from '../components/CardBrands'
import './Checkout.css'
import SuccessCheck from '../components/SuccessCheck'
import './UpgradeCheckout.css'
import { PageSkeleton } from '../components/Skeleton'

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

  /* Backstop: if the card field never reports ready (a blocked script, a
     slow network), lift the cover anyway so the form is never hidden for
     good - Stripe shows its own message inside the field. */
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 12000)
    return () => clearTimeout(t)
  }, [])

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
    /* The skeleton holds the space until Stripe's card field has drawn
       (onReady). The form mounts at once - the field needs real layout to
       load - but hidden and out of flow underneath, so it simply appears
       where the skeleton was: no empty box and no jump in height. */
    <div className={`ck-pay-wrap${ready ? '' : ' is-loading'}`}>
      {!ready && <PaySkeleton />}
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
        onLoadError={() => {
          setReady(true)
          setError('The card form could not load. Check your connection and try again.')
        }}
        options={{ wallets: { link: 'never', applePay: 'never', googlePay: 'never' } }}
      />

      {error && <p className="uc-alert" role="alert">{error}</p>}

      <button type="submit" className="uc-cta" disabled={!stripe || !ready || busy}>
        {busy ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
    </form>
    </div>
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
  // ABA PayWay beside the card form, when the server has its keys.
  const [paywayOn, setPaywayOn] = useState(false)
  const [method, setMethod] = useState('card')
  const [searchParams] = useSearchParams()
  const returnedTran = searchParams.get('payway')
  const [paywayCheck, setPaywayCheck] = useState(returnedTran ? 'checking' : null)

  const [stripeKey, setStripeKey] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)

  const isCourse = kind === 'course'

  // Shared by card and KHQR: the success screen starts at the top.
  const paidNow = useCallback(() => {
    window.scrollTo(0, 0)
    setPaid(true)
  }, [])

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

  /* Whether payments are live does not depend on the order, so it is asked
     straight away, IN PARALLEL with loading the order, instead of after it.
     Three requests in a row was the slowest part of opening this page. */
  const [configPromise] = useState(() => {
    const p = api.paymentConfig()
    // Handled below once the order is in; this only stops an "unhandled
    // rejection" if the order itself never loads.
    p.catch(() => {})
    return p
  })

  /* Ask whether payments are live, and if so mint the intent for THIS purchase. */
  useEffect(() => {
    let live = true
    if (!item) return undefined

    configPromise
      .then((cfg) => {
        if (!live) return null
        setPaywayOn(Boolean(cfg.payway_enabled))
        if (!cfg.enabled) {
          // Card payments off: ABA PayWay alone is still a way to pay.
          if (cfg.payway_enabled) setMethod('payway')
          setPayState(cfg.payway_enabled ? 'payway-only' : 'off')
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
  }, [item, token, isCourse, configPromise])

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

  /* Back from ABA PayWay with ?payway=TRAN: ask the server, which asks ABA.
     ABA can take a moment to settle a KHQR scan, so it asks a few times
     (every 3s, about a minute) before saying it has not seen the money yet.
     Never trusts the URL itself - the server checks with ABA every time. */
  useEffect(() => {
    if (!returnedTran) return undefined
    let live = true
    let tries = 0
    let timer
    const ask = () => {
      api
        .paywayStatus(token, returnedTran)
        .then((r) => {
          if (!live) return
          if (r.status === 'paid') {
            window.scrollTo(0, 0)
            setPaywayCheck(null)
            setPaid(true)
          } else if (r.status === 'failed') {
            setPaywayCheck('failed')
          } else if (++tries < 20) {
            timer = setTimeout(ask, 3000)
          } else {
            setPaywayCheck('waiting')
          }
        })
        .catch(() => live && setPaywayCheck('waiting'))
    }
    ask()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [returnedTran, token])

  if (loading) return <PageSkeleton label="Loading your order" />

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

  /* After paying, the main way on is the conversation with this tutor (or
     the course group): the thread already exists or is opened here, the
     same idempotent call the profile's "Message tutor" uses. */
  async function openChat() {
    try {
      const conv = isCourse
        ? await api.openCourseConversation(token, item.course?.id)
        : await api.openTutorConversation(token, item.tutor?.tutor_profile?.id)
      navigate(`/messages?c=${conv.id}`)
    } catch {
      navigate('/messages')
    }
  }

  if (paid) {
    return (
      /* A real success screen: a big tick, the title under it, what was
         booked as label/value rows, the one thing still pending, then the
         way on. Centred in the page column. */
      <div className="ck ck-ok">
        <section className="ck-ok-card">
          {/* The supplied animated tick, played once (see SuccessCheck). */}
          <div className="ck-ok-tick-anim">
            <SuccessCheck />
          </div>
          <h1 className="ck-ok-title">{order.doneTitle}</h1>
          <p className="ck-ok-sub">
            {isCourse
              ? 'You’re in. It’s on your lessons page now.'
              : `${order.tutor || 'Your tutor'} will accept it, and then it’s booked.`}
          </p>

          <dl className="ck-ok-rows">
            {order.lines.filter((l) => l.value).map((l) => (
              <div key={l.label}>
                <dt>{l.label}</dt>
                <dd>{l.value}</dd>
              </div>
            ))}
          </dl>

          {/* Paying does not lock a private lesson in — saying "booked" here is
              what made the tutor's approval invisible to the student. */}
          {!isCourse && (
            <Link to="/bookings?tab=requests" className="ck-ok-note">
              <span className="ck-ok-dot" aria-hidden="true" />
              {/* One text node: in the inline-flex pill the gap also split
                  'under' from 'Requests'. */}
              <span>
                Waiting for the tutor · under <strong>Requests</strong>
              </span>
            </Link>
          )}

          <Link to={`/bookings?tab=${isCourse ? 'upcoming' : 'requests'}`} className="ck-ok-cta">
            {isCourse ? 'View my bookings' : 'View my request'}
          </Link>
          <button type="button" className="ck-ok-back" onClick={openChat}>
            {isCourse ? 'Open the course chat' : `Message ${(order.tutor || 'your tutor').split(' ')[0]}`}
          </button>
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

          {paywayCheck === 'checking' && (
            <div className="uc-state" role="status">
              <h3>Checking your ABA payment…</h3>
              <p>This takes a few seconds after you pay in the ABA app.</p>
            </div>
          )}
          {paywayCheck === 'waiting' && (
            <div className="uc-state">
              <h3>We haven’t seen your ABA payment yet</h3>
              <p>If you paid, it will show under Bookings in a minute. If not, try again below.</p>
            </div>
          )}
          {paywayCheck === 'failed' && (
            <p className="uc-alert" role="alert">ABA says that payment was declined or cancelled. No charge was made.</p>
          )}

          {/* Card or ABA. Only shown when both are available. */}
          {paywayOn && payState !== 'payway-only' && (
            <div className="ck-paytabs" role="tablist" aria-label="Payment method">
              <button type="button" role="tab" aria-selected={method === 'card'} className={method === 'card' ? 'on' : ''} onClick={() => setMethod('card')}>
                <CardIcon /> Card
              </button>
              <button type="button" role="tab" aria-selected={method === 'payway'} className={method === 'payway' ? 'on' : ''} onClick={() => setMethod('payway')}>
                <QrIcon /> ABA KHQR
              </button>
            </div>
          )}

          {method === 'payway' && paywayOn && (
            <PaywayPanel
              token={token}
              kind={isCourse ? 'course' : 'lesson'}
              id={item.id}
              amountLabel={amount}
              onPaid={paidNow}
            />
          )}

          {method === 'card' && payState === 'loading' && <PaySkeleton />}

          {method === 'card' && payState === 'ready' && clientSecret && stripePromise && (
            <>
              {/* Keyed on the secret so a new intent remounts the provider —
                  Elements cannot be handed a different secret in place. */}
              <Elements
                key={clientSecret}
                stripe={stripePromise}
                options={{ clientSecret, appearance: CARD_APPEARANCE }}
              >
                <StripePayForm
                  amountLabel={amount}
                  onPaid={() => {
                    // The success screen starts at the top, not wherever the
                    // pay button was scrolled to. Instant, never smooth.
                    window.scrollTo(0, 0)
                    setPaid(true)
                  }}
                />
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

/**
 * ABA KHQR, inline. The server asks ABA for the QR and hands back the image;
 * the student scans it with ABA or any Cambodian bank app (or taps "Open in
 * ABA" on a phone). The card then checks with the server every 3 seconds -
 * the server asks ABA, never trusting the browser - and moves on by itself
 * once the payment is approved.
 */
function PaywayPanel({ token, kind, id, amountLabel, onPaid }) {
  const [qr, setQr] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | expired | error
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  // Ask for a QR when the tab opens (and again on "New QR").
  useEffect(() => {
    let live = true
    setState('loading')
    setError(null)
    api
      .paywayCheckout(token, kind, id)
      .then((r) => {
        if (!live) return
        setQr(r)
        setState('ready')
      })
      .catch((err) => {
        if (!live) return
        setError(err.message)
        setState('error')
      })
    return () => {
      live = false
    }
  }, [token, kind, id, attempt])

  // While the QR is up, check every 3s. Stops after ~10 minutes and offers a
  // fresh QR, rather than polling a code nobody is going to scan.
  useEffect(() => {
    if (state !== 'ready' || !qr?.tran_id) return undefined
    let live = true
    let tries = 0
    let timer
    const tick = () => {
      api
        .paywayStatus(token, qr.tran_id)
        .then((r) => {
          if (!live) return
          if (r.status === 'paid') onPaid()
          else if (r.status === 'failed') {
            setError('ABA says that payment was declined or cancelled. No charge was made.')
            setState('expired')
          } else if (++tries < 200) timer = setTimeout(tick, 3000)
          else setState('expired')
        })
        .catch(() => live && (timer = setTimeout(tick, 5000)))
    }
    timer = setTimeout(tick, 3000)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [state, qr, token, onPaid])

  const isPhone = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)

  return (
    <div className="ck-khqr">
      <div className="ck-khqr-card">
        <div className="ck-khqr-head">
          <span className="ck-khqr-brand">KHQR</span>
          <span className="ck-khqr-amount">{amountLabel}</span>
        </div>

        <div className="ck-khqr-code">
          {state === 'ready' && qr?.qr_image ? (
            <img src={qr.qr_image} alt="ABA KHQR code to scan and pay" />
          ) : state === 'loading' ? (
            <span className="ck-khqr-wait" role="status">Making your QR…</span>
          ) : (
            <span className="ck-khqr-wait">QR expired</span>
          )}
        </div>
      </div>

      {state === 'ready' && (
        <>
          <p className="ck-khqr-help">
            Scan with <strong>ABA Mobile</strong> or any bank app that supports KHQR.
          </p>
          <p className="ck-khqr-status" role="status">
            <span className="ck-khqr-dot" aria-hidden="true" />
            Waiting for your payment… this page updates by itself.
          </p>
          {isPhone && qr?.deeplink && (
            <a className="uc-cta ck-khqr-open" href={qr.deeplink}>
              Open in ABA Mobile
            </a>
          )}
        </>
      )}

      {error && <p className="uc-alert" role="alert">{error}</p>}

      {(state === 'expired' || state === 'error') && (
        <button type="button" className="uc-cta" onClick={() => setAttempt((n) => n + 1)}>
          Get a new QR
        </button>
      )}
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
function CardIcon() {
  return <Svg><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></Svg>
}
function QrIcon() {
  return <Svg><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></Svg>
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
