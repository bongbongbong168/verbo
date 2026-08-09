import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import swooshSmall from '../assets/scan/swoosh-small.png'
import swooshLarge from '../assets/scan/swoosh-large.png'
import fileIcon from '../assets/scan/file-icon.png'
import sortIcon from '../assets/scan/sort-icon.png'
import notebookPencil from '../assets/scan/notebook-pencil.png'
import iconBell from '../assets/dashboard/icon-bell.png'
import iconProfile from '../assets/dashboard/icon-profile.png'
import './Scan.css'

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="4" y1="7" x2="14" y2="7" />
      <circle cx="17" cy="7" r="2" />
      <line x1="10" y1="17" x2="20" y2="17" />
      <circle cx="7" cy="17" r="2" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l4 4h-3v7h-2V7H8l4-4z" fill="currentColor" stroke="none" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

function ScanLinesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="9" x2="16" y2="9" />
      <line x1="8" y1="15" x2="20" y2="15" />
    </svg>
  )
}

function MenuDotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  )
}

const ROW_COLORS = ['#2b2643', '#2b2643', '#7d76a1', '#2b2643']

// Mirrors `max:10240` (KB) in ScanController::store. Checked here as well as on
// the server so an oversized photo fails instantly instead of after the upload.
const MAX_UPLOAD_MB = 10

function formatBytes(bytes) {
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export default function Scan() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [scans, setScans] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [menuFor, setMenuFor] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadHistory()
  }, [token])

  // Dismiss the row menu on any click outside it (the toggle button lives
  // inside .sc-row-actions, so it keeps handling its own open/close).
  useEffect(() => {
    if (menuFor === null) return

    function onDocClick(e) {
      if (!e.target.closest('.sc-row-actions')) {
        setMenuFor(null)
        setConfirmingDelete(null)
      }
    }

    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [menuFor])

  function loadHistory() {
    setHistoryLoading(true)
    api
      .getScans(token)
      .then(setScans)
      .catch((err) => setError(err.message))
      .finally(() => setHistoryLoading(false))
  }

  function handleFileChange(e) {
    const picked = e.target.files[0]
    if (!picked) return

    if (picked.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(
        `That photo is ${formatBytes(picked.size)}. The limit is ${MAX_UPLOAD_MB} MB — try a smaller one.`
      )
      setFile(null)
      e.target.value = ''
      return
    }

    setError(null)
    setFile(picked)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file) return

    setError(null)
    setLoading(true)

    try {
      const data = await api.scan(token, file)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      // A finished scan opens on its own document page, so results live in
      // exactly one place whether they are fresh or reopened from history.
      navigate(`/scan/${data.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteScan(scanId) {
    if (confirmingDelete !== scanId) {
      setConfirmingDelete(scanId)
      return
    }

    setError(null)
    try {
      await api.deleteScan(token, scanId)
      setScans((prev) => prev.filter((s) => s.id !== scanId))
    } catch (err) {
      setError(err.message)
    } finally {
      setMenuFor(null)
      setConfirmingDelete(null)
    }
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredScans = scans.filter((s) =>
    (s.original_filename || '').toLowerCase().includes(search.toLowerCase())
  )

  const sortedScans = [...filteredScans].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') {
      cmp = (a.original_filename || '').localeCompare(b.original_filename || '')
    } else {
      cmp = new Date(a.created_at) - new Date(b.created_at)
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const visibleScans = showAll ? sortedScans : sortedScans.slice(0, 5)

  return (
    <div className="sc">
      <div className="sc-header-row">
        <div className="sc-header-text">
          <h1 className="sc-heading">Scan Anything</h1>
          <p className="sc-subtitle">
            These are all the document you scan.{' '}
            <a href="#sc-documents" className="sc-link">
              View here
            </a>
          </p>
        </div>

        <div className="sc-header-controls">
          <div className="sc-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search your files"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="sc-search-divider" />
            <FilterIcon />
          </div>
          <div className="sc-topbar-icons">
            <button type="button" className="sc-icon-btn" aria-label="Notifications">
              <img src={iconBell} alt="" />
            </button>
            <button type="button" className="sc-icon-btn" aria-label="Profile">
              <img src={iconProfile} alt="" />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="sc-error">{error}</p>}

      <div className="sc-upload-card">
        <div className="sc-upload-bg-clip">
          <img className="sc-swoosh-large" src={swooshLarge} alt="" />
          <img className="sc-swoosh-small" src={swooshSmall} alt="" />
        </div>
        <img className="sc-notebook" src={notebookPencil} alt="" />
        <div className="sc-upload-content">
          <h2 className="sc-upload-title">Upload a Photo</h2>
          <p className="sc-upload-subtitle">
            You can either import your photo or scan with your phone
          </p>
          <p className="sc-upload-limit">JPG, PNG or WEBP &middot; up to {MAX_UPLOAD_MB} MB</p>

          {file && (
            <p className="sc-file-chosen">
              Selected: {file.name} <span>({formatBytes(file.size)})</span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="sc-upload-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="sc-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon />
              Upload
            </button>
            <button type="submit" className="sc-btn" disabled={!file || loading}>
              <ScanLinesIcon />
              {loading ? 'Scanning...' : 'Scan'}
            </button>
          </form>
        </div>
      </div>

      <div className="sc-documents-header" id="sc-documents">
        <div>
          <h2 className="sc-documents-title">Documents</h2>
          <p className="sc-subtitle">These are all the document you scan.</p>
        </div>
        {sortedScans.length > 5 && (
          <button type="button" className="sc-link sc-view-all" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show Less' : 'View All'}
          </button>
        )}
      </div>

      {historyLoading ? (
        <p className="sc-empty">Loading...</p>
      ) : sortedScans.length === 0 ? (
        <p className="sc-empty">No scans yet.</p>
      ) : (
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="sc-th-btn" onClick={() => toggleSort('name')}>
                    Name <img src={sortIcon} alt="" />
                  </button>
                </th>
                <th>Shared Users</th>
                <th>File Size</th>
                <th>
                  <button type="button" className="sc-th-btn" onClick={() => toggleSort('date')}>
                    Last Modified <img src={sortIcon} alt="" />
                  </button>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleScans.map((s, idx) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/scan/${s.id}`} className="sc-row-name">
                      <span
                        className="sc-row-icon"
                        style={{ background: ROW_COLORS[idx % ROW_COLORS.length] }}
                      >
                        <img src={fileIcon} alt="" />
                      </span>
                      {s.original_filename || `Scan #${s.id}`}
                    </Link>
                  </td>
                  <td>N/A</td>
                  <td>
                    {s.size_bytes ? (
                      formatBytes(s.size_bytes)
                    ) : (
                      // The image is deleted once OCR finishes, so scans made
                      // before size was recorded can never have it filled in.
                      <span className="sc-unknown" title="Not recorded — this scan predates file-size tracking">
                        &mdash;
                      </span>
                    )}
                  </td>
                  <td>{new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td>
                    <div className="sc-row-actions">
                      <button
                        type="button"
                        className="sc-row-menu"
                        aria-label={`Options for ${s.original_filename || `Scan #${s.id}`}`}
                        aria-expanded={menuFor === s.id}
                        onClick={() => {
                          setMenuFor((cur) => (cur === s.id ? null : s.id))
                          setConfirmingDelete(null)
                        }}
                      >
                        <MenuDotsIcon />
                      </button>

                      {menuFor === s.id && (
                        <div className="sc-menu">
                          <Link to={`/scan/${s.id}`} className="sc-menu-item">
                            Open
                          </Link>
                          <button
                            type="button"
                            className="sc-menu-item sc-menu-danger"
                            onClick={() => handleDeleteScan(s.id)}
                          >
                            {confirmingDelete === s.id ? 'Confirm delete' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
