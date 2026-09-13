import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

/** "1.4 MB" / "812 KB" — a byte count means nothing to a reader. */
function readableSize(bytes) {
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

/* ONE BLOB PER MESSAGE, FOR THE LIFE OF THE TAB.
   Object URLs were created per mount and revoked on unmount, so the same
   picture was downloaded again every time its thread was reopened — and a
   response that arrived after the component had gone was thrown away, which
   on a slow connection is the common case rather than the rare one. The map
   is bounded by how many distinct attachments one session opens, and the
   browser reclaims all of them when the tab closes. */
const CACHE = new Map();

/**
 * One message attachment.
 *
 * The file lives on the private disk behind an authorised route, so it cannot
 * go straight into an `<img src>` — there is no way to attach a bearer token to
 * that request. It is fetched as a blob and handed over as an object URL, which
 * is also what makes the download link work without exposing a public path.
 */
export default function MessageAttachment({ messageId, attachment, token, mine }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  /* Bumping this re-runs the effect, which is how "Try again" works without a
     second code path for the same fetch. */
  const [tries, setTries] = useState(0)
  const urlRef = useRef(null)

  useEffect(() => {
    /* Already fetched once this session — reuse it. The thread re-renders on a
       timer now, and a picture that were re-downloaded on every pass would
       spend the shared request budget on bytes the browser already holds. It
       also means coming back to a thread paints its pictures immediately
       instead of flashing the placeholder again. */
    const cached = CACHE.get(messageId)
    if (cached) {
      urlRef.current = cached
      setUrl(cached)
      return undefined
    }

    let live = true
    setFailed(false)
    api
      .fetchAttachment(token, messageId)
      .then((objectUrl) => {
        /* Kept even if this instance has gone: the blob is the cache's now, and
           the next mount of the same message will want it. Revoking here is
           what would make a slow arrival useless. */
        CACHE.set(messageId, objectUrl)
        if (!live) return
        urlRef.current = objectUrl
        setUrl(objectUrl)
      })
      .catch(() => live && setFailed(true))

    return () => {
      live = false
    }
  }, [token, messageId, tries])

  if (failed) {
    /* A dead end was the old behaviour: one line of red text and no way
       forward, for a failure that is usually a stalled request rather than a
       missing file. The button costs nothing and fixes the common case. */
    return (
      <p className="ms-attach ms-attach-failed">
        Could not load {attachment.name}.{" "}
        <button type="button" className="ms-attach-retry" onClick={() => setTries((n) => n + 1)}>
          Try again
        </button>
      </p>
    );
  }

  if (attachment.is_image) {
    return (
      <a
        className="ms-attach-image"
        href={url || undefined}
        download={attachment.name}
        title={attachment.name}
      >
        {url ? <img src={url} alt={attachment.name} /> : <span className="ms-attach-loading" />}
      </a>
    )
  }

  return (
    <a
      className={`ms-attach${mine ? ' mine' : ''}`}
      href={url || undefined}
      download={attachment.name}
    >
      <FileIcon />
      <span className="ms-attach-meta">
        <strong>{attachment.name}</strong>
        <em>{url ? readableSize(attachment.size) : 'Loading…'}</em>
      </span>
    </a>
  )
}
