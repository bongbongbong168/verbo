import { useEffect, useRef, useState } from 'react'
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

export default function Scan() {
  const { token } = useAuth()
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [scans, setScans] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [saved, setSaved] = useState({})
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadHistory()
  }, [token])

  function loadHistory() {
    setHistoryLoading(true)
    api
      .getScans(token)
      .then(setScans)
      .catch((err) => setError(err.message))
      .finally(() => setHistoryLoading(false))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file) return

    setError(null)
    setLoading(true)
    setResult(null)
    setSaved({})

    try {
      const data = await api.scan(token, file)
      setResult(data)
      setScans((prev) => [
        { id: data.id, original_filename: data.original_filename, raw_text: data.raw_text, created_at: data.created_at },
        ...prev,
      ])
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleOpenScan(id) {
    setError(null)
    setSaved({})
    try {
      const data = await api.getScan(token, id)
      setResult(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveWord(word) {
    try {
      await api.addFlashcard(token, {
        word: word.word,
        pinyin: word.pinyin,
        translation: word.translation,
        source_module: 'scan',
      })
      setSaved((prev) => ({ ...prev, [word.word]: true }))
    } catch (err) {
      setError(err.message)
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

          {file && <p className="sc-file-chosen">Selected: {file.name}</p>}

          <form onSubmit={handleSubmit} className="sc-upload-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files[0])}
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

      {result && (
        <div className="sc-result-card">
          <h2 className="sc-result-title">Recognized text</h2>
          <p className="sc-result-text">{result.raw_text || '(no text detected)'}</p>

          <h2 className="sc-result-title">Words</h2>
          {result.words.length === 0 ? (
            <p className="sc-empty">No words recognized.</p>
          ) : (
            <ul className="sc-words-list">
              {result.words.map((w, idx) => (
                <li key={idx} className="sc-word-row">
                  <span className="sc-word-hanzi">{w.word}</span>
                  {w.pinyin && <span className="sc-word-pinyin">{w.pinyin}</span>}
                  {w.translation && <span className="sc-word-translation">{w.translation}</span>}
                  <button
                    type="button"
                    className="sc-word-save"
                    onClick={() => handleSaveWord(w)}
                    disabled={saved[w.word]}
                  >
                    {saved[w.word] ? 'Saved' : 'Save'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                    <button type="button" className="sc-row-name" onClick={() => handleOpenScan(s.id)}>
                      <span
                        className="sc-row-icon"
                        style={{ background: ROW_COLORS[idx % ROW_COLORS.length] }}
                      >
                        <img src={fileIcon} alt="" />
                      </span>
                      {s.original_filename || `Scan #${s.id}`}
                    </button>
                  </td>
                  <td>N/A</td>
                  <td>N/A</td>
                  <td>{new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td>
                    <button type="button" className="sc-row-menu" aria-label="More options">
                      <MenuDotsIcon />
                    </button>
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
