import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import './PayKhqr.css'

/* Shared by the lesson/course Checkout and the Pro checkout, so the two
   ways Verbo takes money look and behave as one. Prefix pk-. */

function Svg({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}
function CardIcon() {
  return <Svg><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></Svg>
}
function QrIcon() {
  return <Svg><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></Svg>
}

/**
 * Card | ABA KHQR. The selected tab is a STATIC class; the white highlight
 * glides between them as a Web Animation laid over that, cancelled by a timer
 * just after it should end - so a tab that never draws frames still shows the
 * right tab selected, never a highlight stuck halfway.
 */
export function PayTabs({ value, onChange }) {
  const pill = useRef(null)
  const prev = useRef(value)

  useLayoutEffect(() => {
    const el = pill.current
    if (!el || prev.current === value) return undefined
    const from = prev.current === 'card' ? '-100%' : '100%'
    prev.current = value
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const anim = el.animate?.(
      [{ transform: `translateX(${from})` }, { transform: 'translateX(0)' }],
      { duration: 260, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    )
    const backstop = setTimeout(() => anim?.cancel(), 340)
    return () => {
      clearTimeout(backstop)
      anim?.cancel()
    }
  }, [value])

  return (
    <div className={`pk-tabs pk-tabs-${value}`} role="tablist" aria-label="Payment method">
      <span className="pk-tabs-pill" ref={pill} aria-hidden="true" />
      <button type="button" role="tab" aria-selected={value === 'card'} className={value === 'card' ? 'on' : ''} onClick={() => onChange('card')}>
        <CardIcon />
        <span>Card</span>
      </button>
      <button type="button" role="tab" aria-selected={value === 'payway'} className={value === 'payway' ? 'on' : ''} onClick={() => onChange('payway')}>
        <QrIcon />
        <span>ABA KHQR</span>
      </button>
    </div>
  )
}

/**
 * ABA KHQR, inline. The server asks ABA for the QR and hands back the image;
 * the student scans it with ABA or any KHQR bank app (or taps "Open in ABA"
 * on a phone). Every 3 seconds the card asks the server - which asks ABA,
 * never trusting the browser - and moves on by itself once it is approved.
 *
 * `kind` is lesson | course | pro; `id` is the booking or enrolment (none
 * for pro).
 */
export function KhqrPanel({ token, kind, id, amountLabel, onPaid, note }) {
  const [qr, setQr] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | expired | error
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const onPaidRef = useRef(onPaid)
  onPaidRef.current = onPaid

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

  // Check every 3s while the QR is up; after ~10 minutes offer a fresh one.
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
          if (r.status === 'paid') onPaidRef.current?.()
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
  }, [state, qr, token])

  const isPhone = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)

  return (
    <div className="pk-khqr">
      <div className="pk-card">
        <div className="pk-card-head">
          <span className="pk-card-brand">KHQR</span>
          <span className="pk-card-amount">{amountLabel}</span>
        </div>
        <div className="pk-card-code">
          {state === 'ready' && qr?.qr_image ? (
            /* key = the transaction, so a new QR replays the reveal. */
            <img key={qr.tran_id} className="pk-code-img" src={qr.qr_image} alt="ABA KHQR code to scan and pay" />
          ) : state === 'loading' ? (
            <span className="pk-code-skeleton" role="status" aria-label="Making your QR" />
          ) : (
            <span className="pk-code-gone">QR expired</span>
          )}
        </div>
      </div>

      {state === 'ready' && (
        <>
          <p className="pk-help">
            Scan with <strong>ABA Mobile</strong> or any bank app that supports KHQR.
          </p>
          <p className="pk-status" role="status">
            <span className="pk-dot" aria-hidden="true" />
            <span>Waiting for your payment…</span>
          </p>
          {isPhone && qr?.deeplink && (
            <a className="uc-cta pk-full" href={qr.deeplink}>
              Open in ABA Mobile
            </a>
          )}
        </>
      )}

      {note && state === 'ready' && <p className="pk-note">{note}</p>}
      {error && <p className="uc-alert pk-full" role="alert">{error}</p>}

      {(state === 'expired' || state === 'error') && (
        <button type="button" className="uc-cta pk-full" onClick={() => setAttempt((n) => n + 1)}>
          Get a new QR
        </button>
      )}
    </div>
  )
}
