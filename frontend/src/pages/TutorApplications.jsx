import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { invalidate } from '../dataCache'
import PageTools from '../components/PageTools'
import './TutorApplications.css'

/**
 * The admin review queue for tutor applications.
 *
 * A list beside one open application rather than a table that navigates away:
 * reviewing is a repetitive job, and losing your place in the queue after every
 * decision is what makes a moderation screen tiring to use. Deciding keeps the
 * list on screen and moves to the next one.
 */

const TABS = [
  { key: 'awaiting', label: 'Awaiting review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

const STATUS_LABEL = {
  pending: 'Pending',
  needs_info: 'Needs info',
  approved: 'Approved',
  rejected: 'Rejected',
}

function when(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TutorApplications() {
  const { token, user } = useAuth()

  const [tab, setTab] = useState('awaiting')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState('')

  useEffect(() => { if (user?.is_admin) load() }, [tab, token, user])

  function load() {
    setLoading(true)
    Promise.all([
      api.getTutorApplications(token, tab),
      api.getTutorApplicationCounts(token).catch(() => ({})),
    ])
      .then(([list, c]) => {
        setRows(list)
        setCounts(c)
        // Keep the open one if it is still in this tab; otherwise close it
        // rather than showing a detail pane for a row that is no longer listed.
        setOpenId((id) => (list.some((r) => r.id === id) ? id : null))
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!openId) { setDetail(null); return }
    let live = true
    setDetail(null)
    api
      .getTutorApplication(token, openId)
      .then((d) => { if (live) setDetail(d) })
      .catch((err) => { if (live) setError(err.message) })
    return () => { live = false }
  }, [openId, token])

  async function decide(decision) {
    setError(null)
    setBusy(true)
    try {
      await api.decideTutorApplication(token, openId, decision, note)
      /* Approving publishes a tutor, so every cached view of the marketplace is
         now wrong — including the applicant's own profile lookup. */
      invalidate('tutors', 'tutor-profile:me')
      setNote('')
      setOpenId(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  /* The server is the real gate — every endpoint here checks `is_admin` — but
     rendering a review console for someone who can only ever get 403s from it
     is a dead end, so non-admins are sent away. */
  if (user && !user.is_admin) return <Navigate to="/dashboard" replace />

  const needsNote = (d) => d !== 'approved'

  return (
    <div className="ta">
      <div className="ta-topbar">
        <h1 className="ta-title">Tutor applications</h1>
        <div className="ta-topbar-icons">
          <PageTools />
        </div>
      </div>
      <hr className="ta-divider" />

      {error && <p className="ta-error">{error}</p>}

      <div className="ta-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={'ta-tab' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {counts[t.key] > 0 && <span className="ta-count">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      <div className="ta-body">
        <div className="ta-list">
          {loading ? (
            <p className="ta-empty">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="ta-empty">
              {tab === 'awaiting' ? 'Nothing waiting. The queue is clear.' : 'Nothing here yet.'}
            </p>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                className={'ta-row' + (openId === r.id ? ' open' : '')}
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
              >
                <span className="ta-row-top">
                  <span className="ta-name">{r.name}</span>
                  <span className={`ta-status ta-status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </span>
                <span className="ta-row-meta">
                  {[r.country, r.chinese_level, `${r.years_experience ?? 0} yr`].filter(Boolean).join(' · ')}
                </span>
                <span className="ta-row-meta">
                  Applied {when(r.submitted_at)}
                  {r.credentials_count > 0 && ` · ${r.credentials_count} document${r.credentials_count === 1 ? '' : 's'}`}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="ta-detail">
          {!openId ? (
            <p className="ta-empty">Choose an application to review.</p>
          ) : !detail ? (
            <p className="ta-empty">Loading…</p>
          ) : (
            <>
              <header className="ta-detail-head">
                <div>
                  <h2>{detail.user?.name}</h2>
                  <p className="ta-detail-sub">{detail.user?.email}</p>
                </div>
                <span className={`ta-status ta-status-${detail.status}`}>{STATUS_LABEL[detail.status]}</span>
              </header>

              <dl className="ta-facts">
                <div><dt>Country</dt><dd>{detail.country || '—'}</dd></div>
                <div><dt>Chinese level</dt><dd>{detail.chinese_level || '—'}</dd></div>
                <div><dt>Teaches</dt><dd>{(detail.teaches_levels || []).join(', ') || '—'}</dd></div>
                <div><dt>Experience</dt><dd>{detail.years_experience ?? 0} years</dd></div>
                <div><dt>Subjects</dt><dd>{detail.subjects || '—'}</dd></div>
                <div><dt>Languages</dt><dd>{detail.languages_spoken || '—'}</dd></div>
                <div><dt>Availability</dt><dd>{detail.availability || '—'}</dd></div>
                <div><dt>Indicative rate</dt><dd>{detail.hourly_rate ? `$${detail.hourly_rate}/hr` : '—'}</dd></div>
              </dl>

              <h3 className="ta-h3">About</h3>
              <p className="ta-prose">{detail.bio || '—'}</p>

              {detail.teaching_style && (
                <>
                  <h3 className="ta-h3">Teaching style</h3>
                  <p className="ta-prose">{detail.teaching_style}</p>
                </>
              )}

              {detail.video_url && (
                <p className="ta-prose">
                  <a href={detail.video_url} target="_blank" rel="noreferrer noopener">Intro video</a>
                </p>
              )}

              <h3 className="ta-h3">Evidence</h3>
              {detail.credentials?.length ? (
                <ul className="ta-files">
                  {detail.credentials.map((c) => (
                    <li key={c.id}>
                      {/* Opened through the API, not a storage URL — these live
                          on the private disk precisely so holding a link is not
                          enough. The tab carries no bearer token, so this is a
                          plain link the server still authorises by session
                          cookie-less token check on fetch; see note below. */}
                      <CredentialLink token={token} credential={c} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ta-prose ta-muted">No documents attached.</p>
              )}

              {detail.resume_entries?.length > 0 && (
                <>
                  <h3 className="ta-h3">Education and certificates</h3>
                  <ul className="ta-resume">
                    {detail.resume_entries.map((r) => (
                      <li key={r.id}>
                        <strong>{r.title}</strong>
                        {r.years && <span className="ta-muted"> · {r.years}</span>}
                        {r.detail && <div className="ta-muted">{r.detail}</div>}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="ta-decide">
                <label className="ta-note-label">
                  Note to the applicant
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Required when rejecting or asking for more information."
                  />
                </label>
                <div className="ta-actions">
                  <button type="button" className="ta-approve" disabled={busy} onClick={() => decide('approved')}>
                    Approve
                  </button>
                  <button
                    type="button"
                    className="ta-info"
                    disabled={busy || !note.trim()}
                    title={note.trim() ? undefined : 'Say what is missing first'}
                    onClick={() => decide('needs_info')}
                  >
                    Request more info
                  </button>
                  <button
                    type="button"
                    className="ta-reject"
                    disabled={busy || !note.trim()}
                    title={note.trim() ? undefined : 'Give a reason first'}
                    onClick={() => decide('rejected')}
                  >
                    Reject
                  </button>
                </div>
                {needsNote('rejected') && !note.trim() && (
                  <p className="ta-small">
                    Rejecting or asking for more information needs a note — the
                    applicant cannot act on a decision they cannot read.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A document link that works despite the route needing a bearer token.
 *
 * An `<a href>` cannot send an Authorization header, so the file is fetched as
 * a blob and handed to the browser as an object URL — the same approach
 * `MessageAttachment` and the classroom file viewer already use for private
 * uploads. The URL is revoked after opening so the blob is not pinned.
 */
function CredentialLink({ token, credential }) {
  const [busy, setBusy] = useState(false)

  async function open() {
    setBusy(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/tutor-credentials/${credential.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error('Could not open that document.')
      const url = URL.createObjectURL(await res.blob())
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      /* Swallowed: a document that will not open is not worth replacing the
         whole review pane with an error. The reviewer can try the next one. */
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="ta-file" onClick={open} disabled={busy}>
      {credential.label || credential.name}
    </button>
  )
}
