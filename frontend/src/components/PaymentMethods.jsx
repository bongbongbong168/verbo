import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import './PaymentMethods.css'

/* WHAT THIS COMPONENT NEVER DOES IS THE POINT OF IT: it never sends a card
   number anywhere. The number is read in the browser to work out two things —
   which brand the card is, and its last four digits — and is then dropped. The
   server has no column for one and its endpoint has no parameter for one, so
   there is nowhere for a number to land even if a client posted it.
   The form says so on screen rather than leaving it to be assumed. */

/* Brand from the number's own prefix. These ranges are the published ones, and
   they are checked longest-first because 2221-2720 (Mastercard) and 2 alone
   would otherwise disagree. Anything unrecognised is stored as a plain "card"
   rather than guessed at — a wrong logo is worse than none. */
function brandOf(digits) {
  if (/^4/.test(digits)) return 'visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'mastercard'
  if (/^3[47]/.test(digits)) return 'amex'
  if (/^(6011|64[4-9]|65)/.test(digits)) return 'discover'
  if (/^35(2[89]|[3-8]\d)/.test(digits)) return 'jcb'
  if (/^62/.test(digits)) return 'unionpay'
  return 'card'
}

const BRAND_LABEL = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  card: 'Card',
}

/* Luhn. Worth doing in the browser because it catches the overwhelmingly most
   common mistake — a mistyped digit — before anything is saved, and it costs a
   dozen lines. It is NOT a check that a card exists or has money on it; only a
   payment provider can answer that. */
function passesLuhn(digits) {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i])
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return digits.length >= 12 && sum % 10 === 0
}

/** 4242 4242 4242 4242 — grouped as you type, because a 16-digit run is unreadable. */
function groupDigits(digits, brand) {
  if (brand === 'amex') {
    return digits.replace(/^(\d{1,4})(\d{1,6})?(\d{1,5})?$/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(' '),
    )
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

function CardMark({ brand }) {
  return (
    <span className={`pmx-mark pmx-mark-${brand}`} aria-hidden="true">
      {brand === 'card' ? '•••' : BRAND_LABEL[brand].slice(0, 4)}
    </span>
  )
}

export default function PaymentMethods({ token }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [armed, setArmed] = useState(null)

  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [label, setLabel] = useState('')

  const digits = number.replace(/\D/g, '')
  const brand = brandOf(digits)

  const load = useCallback(() => {
    setLoading(true)
    api
      .getPaymentMethods(token)
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  /* Arming lapses on a timer rather than on blur: blur never fires if focus
     never landed on the button, which is what happens when the pointer moves
     away without clicking. Same reasoning as Scan's delete. */
  useEffect(() => {
    if (armed === null) return undefined
    const id = setTimeout(() => setArmed(null), 4000)
    return () => clearTimeout(id)
  }, [armed])

  async function run(work) {
    setBusy(true)
    setError(null)
    try {
      setItems(await work())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function add(e) {
    e.preventDefault()
    const m = expiry.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/)
    if (!m) {
      setError('Expiry needs to look like 04/28.')
      return
    }
    if (!passesLuhn(digits)) {
      setError('That card number does not look right — check for a typo.')
      return
    }

    const month = Number(m[1])
    // "28" means 2028. A two-digit year has no other sensible reading on a card.
    const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])

    setBusy(true)
    setError(null)
    try {
      await api.addPaymentMethod(token, {
        brand,
        last4: digits.slice(-4),
        exp_month: month,
        exp_year: year,
        label: label.trim() || null,
      })
      // Cleared immediately: the number has done its whole job by this point.
      setNumber('')
      setExpiry('')
      setLabel('')
      setAdding(false)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pmx">
      {error && <p className="pmx-error">{error}</p>}

      {loading ? (
        <p className="pmx-note">Loading your saved cards…</p>
      ) : items.length === 0 ? (
        <p className="pmx-note">
          No cards saved yet. Adding one lets you pick it at checkout instead of
          typing it in each time.
        </p>
      ) : (
        <ul className="pmx-list">
          {items.map((m) => (
            <li key={m.id} className={`pmx-row${m.is_expired ? ' expired' : ''}`}>
              <CardMark brand={m.brand} />

              <div className="pmx-who">
                <p className="pmx-name">
                  {m.label || BRAND_LABEL[m.brand] || 'Card'}
                  <span className="pmx-dots">•••• {m.last4}</span>
                </p>
                <p className="pmx-exp">
                  {m.is_expired ? 'Expired ' : 'Expires '}
                  {String(m.exp_month).padStart(2, '0')}/{String(m.exp_year).slice(-2)}
                </p>
              </div>

              {m.is_default ? (
                <span className="pmx-default">Default</span>
              ) : (
                <button
                  type="button"
                  className="pmx-link"
                  disabled={busy || m.is_expired}
                  onClick={() => run(() => api.setDefaultPaymentMethod(token, m.id))}
                >
                  Make default
                </button>
              )}

              <button
                type="button"
                className={`pmx-remove${armed === m.id ? ' armed' : ''}`}
                disabled={busy}
                onClick={() => {
                  if (armed !== m.id) {
                    setArmed(m.id)
                    return
                  }
                  setArmed(null)
                  run(() => api.deletePaymentMethod(token, m.id))
                }}
              >
                {armed === m.id ? 'Tap again to remove' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form className="pmx-form" onSubmit={add}>
          <label className="pmx-field">
            <span>Card number</span>
            <input
              value={groupDigits(digits, brand)}
              onChange={(e) => setNumber(e.target.value)}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              maxLength={23}
            />
          </label>

          <div className="pmx-pair">
            <label className="pmx-field">
              <span>Expiry</span>
              <input
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="04/28"
                maxLength={7}
              />
            </label>

            <label className="pmx-field">
              <span>Name it (optional)</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Everyday card"
                maxLength={40}
              />
            </label>
          </div>

          {/* Stated, not assumed. A person typing a card number is entitled to
              know what happens to it, and the honest answer here is short. */}
          <p className="pmx-note pmx-note-tight">
            Only the brand, the last four digits and the expiry are saved. The
            number itself never leaves this page.
          </p>

          <div className="pmx-actions">
            <button type="submit" className="pmx-save" disabled={busy || digits.length < 12}>
              {busy ? 'Saving…' : 'Save card'}
            </button>
            <button
              type="button"
              className="pmx-link"
              onClick={() => {
                setAdding(false)
                setNumber('')
                setExpiry('')
                setLabel('')
                setError(null)
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="pmx-add" onClick={() => setAdding(true)}>
          + Add a card
        </button>
      )}
    </div>
  )
}
