import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './GoogleSignInButton.css'

/* `?hl=en` pins the button's language. Passing `locale` to renderButton is
   documented but did not take here — it came up in Khmer, the system language,
   on an otherwise entirely English page. The library reads its language from
   the script URL, so this is the setting that actually wins. */
const GIS_SRC = 'https://accounts.google.com/gsi/client?hl=en'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

/** Is Google sign-in even available in this build? */
export const googleConfigured = Boolean(CLIENT_ID)

/** Google clamps the button's width to this; asking for more is silently ignored. */
const MAX_WIDTH = 400

/**
 * Loads Google Identity Services once per page, however many callers ask.
 *
 * Kept as a module-level promise rather than per-component state: Login and
 * Register both render this button, and without it a user moving between them
 * would append a second copy of the script.
 */
let gisPromise = null

function loadGis() {
  if (gisPromise) return gisPromise

  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google)

    // Reuse the tag if one is already in flight from an earlier mount.
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`)
    const script = existing || document.createElement('script')

    script.addEventListener('load', () => resolve(window.google))
    script.addEventListener('error', () => reject(new Error('Could not reach Google.')))

    if (!existing) {
      script.src = GIS_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })

  return gisPromise
}

/**
 * A full-width "Continue with Google" button, logo left.
 *
 * This is Google's own rendered button, not a restyled copy — Google will only
 * hand over an ID token from a button IT renders, so the real control and the
 * visible one have to be the same element. Everything the reference asks for
 * (full width, soft fill, rounded, logo on the left) is either a renderButton
 * option or a CSS property, so nothing here is faked or overlaid.
 *
 * GIS emits inline DOM rather than an iframe, which is what makes the fill and
 * the radius adjustable at all. That is not a documented API, so the stylesheet
 * touches only colour, radius and type — never structure — and the button stays
 * usable if Google changes what it emits.
 */
export default function GoogleSignInButton({ onError, onSuccess }) {
  const { loginWithGoogle } = useAuth()
  const holder = useRef(null)
  const [failed, setFailed] = useState(false)
  /* Google opens its account chooser in a POPUP, and when the browser refuses
     to open one, GIS writes "Failed to open popup window ... Maybe blocked by
     the browser?" to the console and calls NOTHING. No callback, no error, no
     rejected promise — so the page had no way to know and the user got silence
     on click, which is exactly what "it doesn't work" looked like.

     Safari blocks pop-ups by default, so this is the normal experience there
     rather than an edge case. */
  const [popupBlocked, setPopupBlocked] = useState(false)
  /** Disconnects the ResizeObserver; set once GIS has actually loaded. */
  const cleanup = useRef(null)
  /* The handler is held in a ref because GIS keeps the callback it was
     initialised with FOREVER — registered once against the library, not
     re-registered per render — so a callback closing over the first render
     would keep calling that render's `loginWithGoogle`. Same stale-closure
     trap the Alt+1 listeners hit. */
  const handle = useRef(null)

  handle.current = async (response) => {
    // A credential arrived, so the window plainly opened.
    setPopupBlocked(false)
    try {
      await loginWithGoogle(response.credential)
      /* The page decides where to go, exactly as its own submit handler does.
         Neither Login nor Register redirects on a token appearing — they
         navigate explicitly after signing in — so without this the session
         would be established and the user left staring at the form they had
         just completed. */
      onSuccess?.()
    } catch (err) {
      onError?.(err.message || 'Google sign-in failed.')
    }
  }

  /* Watch `window.open` for a blocked pop-up.
   *
   * GIS opens its account chooser with `window.open` FROM THIS PAGE, and a
   * browser that refuses returns null. That return value is the exact signal —
   * measured, not inferred: patched in and clicked, the two calls GIS makes
   * (`/o/oauth2/v2/auth` and `/gsi/select`) both came back null under a
   * blocker.
   *
   * A click listener cannot do this job. GIS overlays its button with a
   * CROSS-ORIGIN iframe, so the click never reaches any handler of ours — the
   * first attempt at this listened on the holder and was silent.
   *
   * Patching a global is invasive, so it is kept honest: the original is
   * restored on unmount, every call is passed through untouched, and only
   * accounts.google.com URLs are judged, so an unrelated pop-up elsewhere can
   * never be reported as a broken sign-in.
   */
  useEffect(() => {
    if (!googleConfigured) return undefined

    const nativeOpen = window.open
    window.open = function patched(...args) {
      const opened = nativeOpen.apply(window, args)
      if (!opened && String(args[0] || '').includes('accounts.google.com')) {
        setPopupBlocked(true)
      }
      return opened
    }

    return () => {
      window.open = nativeOpen
    }
  }, [])

  useEffect(() => {
    if (!googleConfigured) return undefined

    let live = true

    /* Google needs the width as a NUMBER at render time — it will not accept a
       percentage and does not reflow on its own. So the button is drawn to
       whatever the form column actually measures, and redrawn if that changes. */
    const draw = (google) => {
      if (!live || !holder.current) return

      const available = Math.round(holder.current.getBoundingClientRect().width)
      if (!available) return

      holder.current.innerHTML = ''
      google.accounts.id.renderButton(holder.current, {
        type: 'standard',
        // `outline` is the only theme with a light ground to repaint; the
        // filled themes bake in Google's blue and black.
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        // The reference puts the mark at the left edge rather than centred
        // with the label.
        logo_alignment: 'left',
        width: Math.min(available, MAX_WIDTH),
      })
    }

    loadGis()
      .then((google) => {
        if (!live) return

        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => handle.current?.(response),
        })

        draw(google)

        /* Redraw on resize so the button keeps matching the form, which is
           capped at 380 on desktop but narrower on a phone. Observing the
           holder rather than the window catches a layout change that is not a
           viewport change — and the holder's width comes from the form, never
           from its own children, so redrawing cannot feed back into a loop. */
        const ro = new ResizeObserver(() => draw(google))
        if (holder.current) ro.observe(holder.current)
        cleanup.current = () => ro.disconnect()
      })
      .catch(() => {
        if (!live) return
        setFailed(true)
        // Reset so a later mount can try again — a blocked network on one page
        // load should not disable the button for the rest of the session.
        gisPromise = null
      })

    return () => {
      live = false
      cleanup.current?.()
    }
  }, [])

  if (!googleConfigured) return null

  if (failed) {
    return (
      <p className="gs-failed">
        Google sign-in is unavailable right now. Use your email and password.
      </p>
    )
  }

  return (
    <>
      {/* Capture phase, on the wrapper: GIS owns everything inside `holder`
          and replaces it on every redraw, so a listener bound to its children
          would be thrown away. Capture also means this runs before GIS's own
          handler, so the watch starts even if that handler throws. */}
      <div className="gs-holder" ref={holder} />
      {popupBlocked && (
        <p className="gs-blocked" role="status">
          Your browser blocked the Google sign-in window. Allow pop-ups for this
          site and try again, or sign in with your email and password.
        </p>
      )}
    </>
  )
}
