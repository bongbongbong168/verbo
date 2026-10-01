import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageSkeleton } from '../components/Skeleton'

/**
 * Where the Google REDIRECT sign-in lands (in-app browsers such as Telegram,
 * which cannot run the popup). The server put a one-time code in the hash;
 * the hash never reaches a server log. It is swapped for a session once, then
 * wiped from the address bar so a copied link carries nothing.
 */
export default function GoogleCallback() {
  const { loginWithGoogleCode } = useAuth()
  const navigate = useNavigate()
  // StrictMode runs effects twice in dev, and the code only works once.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const code = new URLSearchParams(window.location.hash.slice(1)).get('code')
    window.history.replaceState(null, '', window.location.pathname)

    if (!code) {
      navigate('/login?google_error=missing', { replace: true })
      return
    }
    loginWithGoogleCode(code)
      // ProtectedRoute sends a new account on to verification or onboarding.
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => navigate('/login?google_error=expired', { replace: true }))
  }, [loginWithGoogleCode, navigate])

  return <PageSkeleton label="Signing you in" />
}
