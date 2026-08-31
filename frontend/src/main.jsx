import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { applyAppScale } from './appScale'
import './fonts.css'
/* After fonts.css so it wins on equal specificity. Everything inside is scoped
   to `max-width: 767px` — the desktop layout is untouched by it. */
import './mobile.css'

// Before render, so the app never paints at the wrong size and then jump.
applyAppScale()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
