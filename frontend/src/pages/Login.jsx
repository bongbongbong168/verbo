import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import graduateIllustration from '../assets/login/graduate-illustration.png'
import verboLogo from '../assets/sidebar/logo.png'
import EyeIcon from '../components/EyeIcon'
import GoogleSignInButton, { googleConfigured } from '../components/GoogleSignInButton'
import './Login.css'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lg">
      <div className="lg-panel">
        <img className="lg-panel-logo" src={verboLogo} alt="Verbo" />
        <img className="lg-illustration" src={graduateIllustration} alt="" />
        <div className="lg-panel-text">
          <h1 className="lg-welcome">Welcome !</h1>
          <p className="lg-welcome-subtitle">Sign in to continue your journey.</p>
        </div>
      </div>

      <div className="lg-form-panel">
        <div className="lg-form-wrap">
          <h2 className="lg-heading">Sign in</h2>

          <form onSubmit={handleSubmit}>
            <label className="lg-label" htmlFor="lg-email">
              Email
            </label>
            <input
              id="lg-email"
              className="lg-input"
              type="email"
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label className="lg-label" htmlFor="lg-password">
              Password
            </label>
            <div className="lg-password-field">
              <input
                id="lg-password"
                className="lg-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="lg-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon shown={showPassword} />
              </button>
            </div>

            <span className="lg-forgot">Forgot password ?</span>

            {error && <p className="lg-error">{error}</p>}

            <button type="submit" className="lg-login-btn" disabled={submitting}>
              {submitting ? 'Logging in...' : 'Login'}
            </button>
          </form>

          {/* Google only. The Facebook and Apple buttons the design shows are
              not built, and a disabled control that never becomes enabled is
              worse than no control — same rule as Payment Methods on Profile.
              The whole section hides when Google is unconfigured, because
              "or continue with" above nothing is a promise the page cannot
              keep. Bring the other two back when they actually sign anyone in. */}
          {googleConfigured && (
            <>
              {/* The word sits in its own span so the rules either side can be
                  drawn on the <p> — see .lg-or in the stylesheet. */}
              <p className="lg-or">
                <span>or</span>
              </p>
              <GoogleSignInButton
                onError={setError}
                onSuccess={() => navigate('/dashboard')}
              />
            </>
          )}

          <p className="lg-register-link">
            Don't have an account? <Link to="/register">Register</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
