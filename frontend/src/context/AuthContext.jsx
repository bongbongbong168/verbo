import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'
import { clearCache } from '../dataCache'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    api
      .me(token)
      .then(setUser)
      .catch((err) => {
        // Only a genuine auth failure should end the session. Rate limiting
        // (429), server faults (5xx) and network blips must not log the user out.
        if (err.status === 401) {
          setToken(null)
          localStorage.removeItem('token')
          clearCache()
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  /* Establishing a session, in one place. However you got here — register,
     password, Google — "signed in" must mean exactly one thing, or the ways in
     drift and one of them ends up half-establishing a session.

     `clearCache()` is the load-bearing line and is NOT optional: the response
     cache behind `useApiData` is keyed by resource, not by account, so a second
     person signing in on this browser would paint the previous person's
     dashboard from cache before their own data arrived. Any new way to become a
     different user must come through here. */
  function startSession(data) {
    clearCache()
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(data.user)
  }

  async function register(name, email, password) {
    startSession(await api.register(name, email, password))
  }

  async function login(email, password) {
    startSession(await api.login(email, password))
  }

  /** Sign in with a Google ID token. */
  async function loginWithGoogle(credential) {
    startSession(await api.googleSignIn(credential))
  }

  async function logout() {
    if (token) await api.logout(token).catch(() => {})
    clearCache()
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  // setUser is exposed so Settings can push a renamed user back without a
  // refetch — the sidebar reads the same object.
  return (
    <AuthContext.Provider
      value={{ token, user, setUser, loading, register, login, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
