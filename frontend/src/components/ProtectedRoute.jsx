import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import verboLogo from '../assets/sidebar/logo.png'
import './ProtectedRoute.css'

export default function ProtectedRoute({ children }) {
  const { token, user, loading } = useAuth()
  const { pathname } = useLocation()

  /* Held here until GET /user answers, which is the one request nothing can be
     rendered ahead of — we do not yet know whether this person is signed in.
     On the deployed API that call can stall for seconds, so it is worth being
     a branded panel rather than the bare `<p>Loading...</p>` this replaced. */
  if (loading) {
    return (
      <div className="pr-boot">
        <img className="pr-boot-logo" src={verboLogo} alt="Verbo" />
        <p className="pr-boot-note">Signing you in…</p>
      </div>
    )
  }
  if (!token) return <Navigate to="/login" replace />

  /* A brand-new account has not answered the onboarding questions yet, so it
     goes there first. Existing accounts were stamped with `onboarded_at` when
     the column was added, so nobody already using Verbo is interrupted.

     The `user &&` guard matters: a failed /me that was not a 401 leaves the
     token in place with no user, and redirecting on that would trap someone in
     onboarding over a network blip. The pathname check is what stops the
     redirect firing on /onboarding itself and looping. */
  if (user && !user.onboarded_at && pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return children
}
