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
  const urlRef = useRef(null)

  useEffect(() => {
    let live = true
    api
      .fetchAttachment(token, messageId)
      .then((objectUrl) => {
        if (!live) {
          // Arrived after unmount — release it rather than leaking the blob.
          URL.revokeObjectURL(objectUrl)
          return
        }
        urlRef.current = objectUrl
        setUrl(objectUrl)
      })
      .catch(() => live && setFailed(true))

    return () => {
      live = false
      // Object URLs pin the blob in memory until revoked.
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [token, messageId])

  if (failed) {
    return <p className="ms-attach ms-attach-failed">Could not load {attachment.name}</p>
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
