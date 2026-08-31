import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import "./FilePreview.css";

/* What the browser can actually render. Anything else is offered as a download
   rather than shown in a viewer that would just sit blank — a preview pane
   that cannot preview is worse than saying so. */
function kindOf(mime, name) {
  const m = (mime || "").toLowerCase();
  const ext = (name || "").split(".").pop().toLowerCase();

  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) {
    return "image";
  }
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("text/") || ["txt", "csv", "md", "json", "log"].includes(ext)) {
    return "text";
  }
  if (m.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg"].includes(ext)) return "audio";
  if (m.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) return "video";
  return "other";
}

function bytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Opens a classroom attachment or a student's submitted work for READING.
 *
 * Before this, every file chip went straight to `downloadPrivateFile`, so a
 * teacher marking six submissions had to save six files to disk and open them
 * out of the app to see any of them. Marking is a read-first job.
 *
 * The file is fetched as a blob because the route is bearer-authenticated —
 * an `<img src>` or `<iframe src>` pointing at it would arrive unauthenticated
 * and 401. Same approach as `MessageAttachment`.
 *
 * Download is still offered on every file, and it is the ONLY option for types
 * a browser cannot render (.docx and friends).
 */
export default function FilePreview({ url, name, mime, size, onClose }) {
  const { token } = useAuth();
  const [objectUrl, setObjectUrl] = useState(null);
  const [text, setText] = useState(null);
  const [error, setError] = useState(null);

  const kind = kindOf(mime, name);

  useEffect(() => {
    let live = true;
    let created = null;

    api
      .viewPrivateFile(token, url)
      .then(async ({ blob, objectUrl: made }) => {
        if (!live) {
          URL.revokeObjectURL(made);
          return;
        }
        created = made;
        setObjectUrl(made);
        if (kind === "text") setText(await blob.text());
      })
      .catch((err) => live && setError(err.message));

    return () => {
      live = false;
      // Without this the blob is pinned in memory for the life of the tab.
      if (created) URL.revokeObjectURL(created);
    };
  }, [token, url, kind]);

  // Escape closes, the way every other overlay in the app behaves.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function download() {
    api.downloadPrivateFile(token, url, name).catch(() => {});
  }

  return (
    <div
      className="fp-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={name}
      // Clicking the backdrop closes; clicking the panel must not.
      onClick={onClose}
    >
      <div className="fp" onClick={(e) => e.stopPropagation()}>
        <div className="fp-head">
          <div className="fp-title">
            <span className="fp-name">{name}</span>
            <span className="fp-meta">
              {[mime, bytes(size)].filter(Boolean).join(" · ")}
            </span>
          </div>
          <button type="button" className="fp-btn" onClick={download}>
            Download
          </button>
          <button type="button" className="fp-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="fp-body">
          {error ? (
            <p className="fp-note">{error}</p>
          ) : !objectUrl ? (
            <p className="fp-note">Opening…</p>
          ) : kind === "image" ? (
            <img className="fp-img" src={objectUrl} alt={name} />
          ) : kind === "pdf" ? (
            <iframe className="fp-frame" src={objectUrl} title={name} />
          ) : kind === "text" ? (
            <pre className="fp-text">{text}</pre>
          ) : kind === "audio" ? (
            <audio className="fp-audio" src={objectUrl} controls />
          ) : kind === "video" ? (
            <video className="fp-video" src={objectUrl} controls />
          ) : (
            <p className="fp-note">
              This kind of file cannot be shown in the browser. Download it to
              open it in the app it belongs to.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
