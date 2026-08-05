import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'

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
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  async function register(name, email, password) {
    const data = await api.register(name, email, password)
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(data.user)
  }

  async function login(email, password) {
    const data = await api.login(email, password)
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(data.user)
  }

  async function logout() {
    if (token) await api.logout(token).catch(() => {})
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
