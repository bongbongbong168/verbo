import { useState } from 'react'
import { api } from '../api'
import './ScanReview.css'

/**
 * The lines the OCR reader was not sure of, for the learner to check.
 *
 * Only rendered while `scan.uncertain_lines` holds something. Each unsure line
 * is an editable box marked "Unsure", so recognised-but-doubtful text never
 * looks like confirmed text. Saving writes the whole text back with those
 * lines swapped for the learner's version and clears the flags; "They look
 * right" confirms without changes. Either way no AI is called.
 *
 * A failed save keeps every edit in its box and says so.
 */
export default function ScanReview({ scan, token, onSaved }) {
  const lines = scan.uncertain_lines || []
  const [edits, setEdits] = useState(() => lines.map((l) => l))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!lines.length) return null

  async function save(useEdits) {
    setBusy(true)
    setError(null)
    // Swap each unsure line (first match, line by line) for the edit.
    const out = (scan.raw_text || '').split('\n')
    lines.forEach((line, i) => {
      const at = out.indexOf(line)
      if (at !== -1 && useEdits) out[at] = edits[i].trim()
    })
    try {
      const data = await api.updateScanText(token, scan.id, out.join('\n'))
      onSaved(data)
    } catch (err) {
      setError(err.message || 'Could not save. Your changes are still here - try again.')
    } finally {
      setBusy(false)
    }
  }

  const changed = edits.some((e, i) => e.trim() !== lines[i])

  return (
    <section className="srv" aria-labelledby="srv-title">
      <div className="srv-head">
        <h3 id="srv-title" className="srv-title">
          Check {lines.length === 1 ? '1 line' : `${lines.length} lines`}
        </h3>
        <p className="srv-sub">
          The reader was not sure about {lines.length === 1 ? 'this line' : 'these lines'}. Fix anything it got wrong.
        </p>
      </div>

      <ul className="srv-list">
        {lines.map((line, i) => (
          <li key={i} className="srv-row">
            <span className="srv-chip">Unsure</span>
            <input
              className="srv-input"
              value={edits[i]}
              onChange={(e) => setEdits((cur) => cur.map((v, k) => (k === i ? e.target.value : v)))}
              aria-label={`Unsure line ${i + 1}`}
              lang="zh"
            />
          </li>
        ))}
      </ul>

      {error && <p className="srv-error" role="alert">{error}</p>}

      <div className="srv-actions">
        <button type="button" className="srv-ghost" onClick={() => save(false)} disabled={busy}>
          They look right
        </button>
        <button type="button" className="srv-go" onClick={() => save(true)} disabled={busy || !changed}>
          {busy ? 'Saving…' : 'Save corrections'}
        </button>
      </div>
    </section>
  )
}
