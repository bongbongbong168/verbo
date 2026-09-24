import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import {
  fetchIfStale,
  fetchThrough,
  hasCache,
  invalidate,
  readCache,
  writeCache,
} from "../dataCache";
import Skeleton from "../components/Skeleton";
import swooshSmall from "../assets/scan/swoosh-small.png";
import swooshLarge from "../assets/scan/swoosh-large.png";
import fileIcon from "../assets/scan/file-icon.png";
import sortIcon from "../assets/scan/sort-icon.png";
import notebookPencil from "../assets/scan/notebook-pencil.png";
import PageTools from "../components/PageTools";
import { AllowanceIndicator, UsageLimitState, formatUsageReset } from "../components/UsageAllowance";
import "./Scan.css";
import MenuDotsIcon from "../components/MenuDotsIcon";

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <line x1="4" y1="7" x2="14" y2="7" />
      <circle cx="17" cy="7" r="2" />
      <line x1="10" y1="17" x2="20" y2="17" />
      <circle cx="7" cy="17" r="2" />
    </svg>
  );
}

function CloudUploadIcon() {
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
      <path d="M7 17.5a4 4 0 0 1 .4-8A5.5 5.5 0 0 1 18 10.2a3.7 3.7 0 0 1-.7 7.3" />
      <path d="M12 21v-8" />
      <path d="m8.8 16.2 3.2-3.2 3.2 3.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// "PNG" / "JPG" — the badge on each queued row, taken from the real filename
// rather than the mime type so it matches what the user sees in their folder.
function fileKind(file) {
  const ext = (file.name.split(".").pop() || "").toUpperCase();
  return ext && ext.length <= 4 ? ext : "IMG";
}

let queueId = 0;

function ScanLinesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="4" y1="9" x2="16" y2="9" />
      <line x1="8" y1="15" x2="20" y2="15" />
    </svg>
  );
}

function EmptyScansIcon() {
  return (
    <svg viewBox="0 0 180 128" fill="none" aria-hidden="true">
      <ellipse cx="90" cy="115" rx="54" ry="5" fill="#e4ddf7" />
      <path d="M28 48c0-7 6-13 13-13h31l11 12h56c7 0 13 6 13 13v35c0 8-6 14-14 14H42c-8 0-14-6-14-14V48Z" fill="#f1edfc" stroke="#7d76a1" strokeWidth="2" />
      <path d="M28 61h124v34c0 8-6 14-14 14H42c-8 0-14-6-14-14V61Z" fill="#fff" stroke="#7d76a1" strokeWidth="2" />
      <circle cx="76" cy="84" r="4" fill="#6a6191" />
      <circle cx="105" cy="84" r="4" fill="#6a6191" />
      <path d="M80 97h21" stroke="#6a6191" strokeWidth="3" strokeLinecap="round" />
      <path d="M137 27v16M129 35h16" stroke="#a89ce3" strokeWidth="3" strokeLinecap="round" />
      <circle cx="151" cy="20" r="5" fill="#d8cef7" />
    </svg>
  )
}

const ROW_COLORS = ["#2b2643", "#2b2643", "#7d76a1", "#2b2643"];

// Mirrors `max:10240` (KB) in ScanController::store. Checked here as well as on
// the server so an oversized photo fails instantly instead of after the upload.
const MAX_UPLOAD_MB = 10;

function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function Scan() {
  const { token } = useAuth();
  const navigate = useNavigate();
  // Each entry: { id, file, status: 'ready' | 'uploading' | 'scanning' | 'done' | 'failed', progress, scanId, error }
  const [queue, setQueue] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  // Seeded during the first render, so a revisit never flashes a loading state.
  const [scans, setScans] = useState(() => readCache("scans") || []);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // False from the first render when the history is already cached, or a
  // revisit would flash the skeleton over a table we can already draw.
  const [historyLoading, setHistoryLoading] = useState(() => !hasCache("scans"));
  const [search, setSearch] = useState("");
  const [menuFor, setMenuFor] = useState(null);
  // Which scan's share panel is open, plus the link and a transient "Copied!".
  const [shareFor, setShareFor] = useState(null);
  const [shareLink, setShareLink] = useState("");
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [scanUsage, setScanUsage] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadHistory();
    api.getUsageAllowances(token)
      .then((data) => setScanUsage(data.usage?.scans || null))
      .catch(() => {});
  }, [token]);

  // Dismiss the row menu on any click outside it (the toggle button lives
  // inside .sc-row-actions, so it keeps handling its own open/close).
  useEffect(() => {
    if (menuFor === null) return;

    function onDocClick(e) {
      if (!e.target.closest(".sc-row-actions")) {
        setMenuFor(null);
        setConfirmingDelete(null);
      }
    }

    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [menuFor]);

  /* `force` is passed after a scan completes: a new document has definitely
     just been created, so the freshness window must not hide it. */
  function loadHistory({ force = false } = {}) {
    if (!hasCache("scans")) setHistoryLoading(true);
    const request = force
      ? fetchThrough("scans", () => api.getScans(token), { force: true })
      : fetchIfStale("scans", () => api.getScans(token));
    request
      .then(setScans)
      // Only a failure that leaves the table empty is worth showing; a stalled
      // refresh behind a list already on screen is not.
      .catch((err) => !scans.length && setError(err.message))
      .finally(() => setHistoryLoading(false));
  }

  /* Every local edit to the list goes through here so the shared cache cannot
     drift from what is on screen — a share, an unshare or a delete must not
     leave a stale copy that the next visit paints from. */
  function updateScans(fn) {
    setScans((prev) => {
      const next = fn(prev);
      writeCache("scans", next);
      return next;
    });
  }

  /* Every way of adding a photo — browse, drag-and-drop, paste — funnels
     through here, so the size limit and the error wording cannot drift apart
     between them. */
  const addFiles = useCallback((incoming) => {
    if (scanUsage && !scanUsage.available) {
      setError("You have used all of this month's scans.");
      return;
    }
    const images = [...incoming].filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setError("That is not an image. Drop or paste a photo of Chinese text.");
      return;
    }

    const tooBig = images.filter((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    let ok = images.filter((f) => f.size <= MAX_UPLOAD_MB * 1024 * 1024);
    if (scanUsage?.remaining != null) {
      ok = ok.slice(0, scanUsage.remaining);
    }

    setError(
      tooBig.length
        ? `${tooBig.length === 1 ? `“${tooBig[0].name}” is` : `${tooBig.length} photos are`} over the ${MAX_UPLOAD_MB} MB limit and ${tooBig.length === 1 ? "was" : "were"} skipped.`
        : null,
    );

    if (ok.length) {
      setQueue((prev) => [
        ...prev,
        ...ok.map((file) => ({
          id: ++queueId,
          file,
          status: "ready",
          progress: 0,
        })),
      ]);
    }
  }, [scanUsage]);

  function handleFileChange(e) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function removeFromQueue(id) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }

  function openUploader() {
    if (scanUsage && !scanUsage.available) return;
    setError(null);
    setUploaderOpen(true);
  }

  // Discard anything queued but unscanned, so reopening starts clean rather
  // than resurrecting photos the user walked away from.
  function closeUploader() {
    if (loading) return;
    setUploaderOpen(false);
    setQueue([]);
    setError(null);
  }

  useEffect(() => {
    if (!uploaderOpen) return;
    function onKey(e) {
      if (e.key === "Escape" && !loading) closeUploader();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Pasting a screenshot is the fastest way in — Win+Shift+S then Ctrl+V.
  useEffect(() => {
    function onPaste(e) {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) {
        e.preventDefault();
        // Pasting is itself the intent to upload, so bring the dialog up with
        // the photo already in it rather than making them find the button.
        setUploaderOpen(true);
        addFiles(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  async function handleSubmit(e) {
    e.preventDefault();
    const pending = queue.filter(
      (it) => it.status === "ready" || it.status === "failed",
    );
    if (pending.length === 0) return;

    setError(null);
    setLoading(true);

    const patch = (id, changes) =>
      setQueue((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...changes } : it)),
      );

    const completed = [];
    // Sequential, not Promise.all: OCR is CPU-bound on the server and the
    // endpoint shares the 300/min bucket, so a burst is the wrong shape.
    for (const item of pending) {
      try {
        patch(item.id, { status: "uploading", progress: 0, error: null });
        const data = await api.scanWithProgress(token, item.file, (fraction) =>
          // Once the bytes are sent the server is still doing OCR, which we
          // cannot measure — so the row switches to an indeterminate state
          // rather than sitting at a fake 100%.
          patch(
            item.id,
            fraction >= 1
              ? { status: "scanning", progress: 1 }
              : { progress: fraction },
          ),
        );
        patch(item.id, { status: "done", progress: 1, scanId: data.id });
        if (data.usage) setScanUsage(data.usage);
        completed.push(data);
      } catch (err) {
        if (err.data?.usage) setScanUsage(err.data.usage);
        patch(item.id, { status: "failed", error: err.message });
        setError(err.message);
      }
    }

    setLoading(false);
    loadHistory({ force: true });

    // One photo lands straight on its document page, the way it did before.
    // Several would be ambiguous, so those stay here against a refreshed list.
    if (completed.length === 1) {
      navigate(`/scan/${completed[0].id}`);
    } else if (completed.length > 1) {
      setQueue((prev) => prev.filter((it) => it.status !== "done"));
      setUploaderOpen(false);
    }
  }

  /* Turning sharing on publishes the scan to anyone holding the link, so the
     panel says so plainly and offers revoking in the same place. The endpoint
     is idempotent, so reopening this never invalidates a link already sent. */
  async function handleShare(scanId) {
    setError(null);
    setSharing(true);
    setCopied(false);
    try {
      const { share_token } = await api.shareScan(token, scanId);
      updateScans((prev) =>
        prev.map((s) => (s.id === scanId ? { ...s, share_token } : s)),
      );
      setShareLink(`${window.location.origin}/shared/scan/${share_token}`);
      setShareFor(scanId);
      setMenuFor(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSharing(false);
    }
  }

  async function handleStopSharing(scanId) {
    setError(null);
    setSharing(true);
    try {
      await api.unshareScan(token, scanId);
      updateScans((prev) =>
        prev.map((s) => (s.id === scanId ? { ...s, share_token: null } : s)),
      );
      setShareFor(null);
      setShareLink("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the input is selectable as a fallback.
      setError("Could not copy automatically — select the link and copy it.");
    }
  }

  async function handleDeleteScan(scanId) {
    if (confirmingDelete !== scanId) {
      setConfirmingDelete(scanId);
      return;
    }

    setError(null);
    try {
      await api.deleteScan(token, scanId);
      updateScans((prev) => prev.filter((s) => s.id !== scanId));
      // The document page for that scan must not keep serving it either.
      invalidate(`scan:${scanId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setMenuFor(null);
      setConfirmingDelete(null);
    }
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredScans = scans.filter((s) =>
    (s.original_filename || "").toLowerCase().includes(search.toLowerCase()),
  );

  const sortedScans = [...filteredScans].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") {
      cmp = (a.original_filename || "").localeCompare(
        b.original_filename || "",
      );
    } else {
      cmp = new Date(a.created_at) - new Date(b.created_at);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const visibleScans = showAll ? sortedScans : sortedScans.slice(0, 5);

  return (
    <div className="sc">
      <div className="sc-header-row">
        <div className="sc-header-text">
          <h1 className="sc-heading">Scan Anything</h1>
          <p className="sc-subtitle">
            These are all the document you scan.{" "}
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
            <PageTools />
          </div>
        </div>
      </div>

      {error && <p className="sc-error">{error}</p>}

      <UsageLimitState
        usage={scanUsage}
        className="sc-limit-state"
        title={scanUsage?.is_pro ? "You’ve used this month’s Pro scans." : "You’ve used this month’s free scans."}
        description="Your saved scans stay available. Your scans reset next month."
        actionLabel="Get more scans with Verbo Pro"
      />

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

          <div className="sc-upload-actions">
            <button type="button" className="sc-btn" onClick={openUploader} disabled={scanUsage ? !scanUsage.available : false}>
              Add photo
            </button>
          </div>
        </div>
      </div>

      {/* The uploader is a dialog rather than part of the banner: it grows as
          photos queue up, which pushed the page around when it lived inline. */}
      {uploaderOpen && (
        <div
          className="sc-modal-overlay"
          onMouseDown={(e) => {
            // Only a click on the backdrop itself closes it — not one that
            // started inside the card and drifted out.
            if (e.target === e.currentTarget) closeUploader();
          }}
        >
          <div
            className="sc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sc-modal-title"
          >
            <div className="sc-modal-head">
              <h2 className="sc-modal-title" id="sc-modal-title">
                Upload a photo
              </h2>
              <p className="sc-modal-sub">
                Scan Chinese text from a photo or a screenshot.
              </p>
              <button
                type="button"
                className="sc-modal-close"
                onClick={closeUploader}
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            {error && <p className="sc-modal-error">{error}</p>}

            <form onSubmit={handleSubmit} className="sc-uploader">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                style={{ display: "none" }}
              />

              {/* The drop zone is a button so it is reachable by keyboard, not
                  just by pointer. */}
              <button
                type="button"
                className={"sc-dropzone" + (dragging ? " dragging" : "")}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
              >
                <span className="sc-dropzone-icon">
                  <CloudUploadIcon />
                </span>
                <span className="sc-dropzone-title">
                  Drop your photo here or browse
                </span>
                <span className="sc-dropzone-hint">
                  You can paste a screenshot too &middot; JPG, PNG or WEBP up to{" "}
                  {MAX_UPLOAD_MB} MB
                </span>
              </button>

              {queue.length > 0 && (
                <ul className="sc-queue">
                  {queue.map((item) => {
                    const busy =
                      item.status === "uploading" || item.status === "scanning";
                    return (
                      <li
                        key={item.id}
                        className={
                          "sc-queue-item" +
                          (item.status === "failed" ? " failed" : "")
                        }
                      >
                        <span className="sc-queue-kind">
                          {fileKind(item.file)}
                        </span>

                        <span className="sc-queue-body">
                          <span className="sc-queue-name">
                            {item.file.name}
                          </span>
                          <span className="sc-queue-meta">
                            {item.status === "uploading"
                              ? `${formatBytes(item.file.size * item.progress)} of ${formatBytes(item.file.size)}`
                              : item.status === "scanning"
                                ? "Reading the text…"
                                : item.status === "done"
                                  ? "Scanned"
                                  : item.status === "failed"
                                    ? item.error
                                    : formatBytes(item.file.size)}
                          </span>

                          {busy && (
                            <span
                              className={
                                "sc-queue-bar" +
                                (item.status === "scanning"
                                  ? " indeterminate"
                                  : "")
                              }
                            >
                              <span
                                style={{
                                  width: `${Math.round(item.progress * 100)}%`,
                                }}
                              />
                            </span>
                          )}
                        </span>

                        <button
                          type="button"
                          className="sc-queue-remove"
                          onClick={() => removeFromQueue(item.id)}
                          aria-label={`Remove ${item.file.name}`}
                          disabled={busy}
                        >
                          {busy ? <CloseIcon /> : <TrashIcon />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="sc-modal-actions">
                <button
                  type="button"
                  className="sc-modal-btn"
                  onClick={closeUploader}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sc-modal-btn primary"
                  disabled={loading || queue.length === 0}
                >
                  <ScanLinesIcon />
                  {loading
                    ? "Scanning…"
                    : queue.length > 1
                      ? `Scan ${queue.length}`
                      : "Scan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {scanUsage && (
        <div className="sc-documents-usage">
          <AllowanceIndicator usage={scanUsage} className="sc-usage-card">
            <strong>Scan usage:</strong>{" "}
            {scanUsage.limit == null
              ? "Unlimited"
              : `${scanUsage.remaining} of ${scanUsage.limit} left`}
            {scanUsage.resets_at || scanUsage.reset_date ? (
              <>
                <span className="sc-usage-dot" aria-hidden="true">·</span>
                {formatUsageReset(scanUsage, { monthStyle: "short" })}
              </>
            ) : null}
          </AllowanceIndicator>
        </div>
      )}

      <div className="sc-documents-header" id="sc-documents">
        <div>
          <h2 className="sc-documents-title">Documents</h2>
          <p className="sc-subtitle">These are all the document you scan.</p>
        </div>
        {sortedScans.length > 5 && (
          <button
            type="button"
            className="sc-link sc-view-all"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show Less" : "View All"}
          </button>
        )}
      </div>

      {historyLoading ? (
        /* Table-shaped rows, so the page keeps its height rather than
           collapsing and jumping when the history lands. */
        <div className="sc-table-wrap" aria-busy="true">
          <Skeleton style={{ height: 38, marginBottom: 8 }} />
          <Skeleton style={{ height: 52, marginBottom: 6 }} />
          <Skeleton style={{ height: 52, marginBottom: 6 }} />
          <Skeleton style={{ height: 52 }} />
        </div>
      ) : sortedScans.length === 0 ? (
        <div className="sc-empty">
          <EmptyScansIcon />
          <h3>No scans yet</h3>
          <p>Upload a photo of Chinese text to see it here.</p>
          <button type="button" className="sc-empty-upload" onClick={openUploader} disabled={scanUsage ? !scanUsage.available : false}>
            <CloudUploadIcon />
            Add a photo
          </button>
        </div>
      ) : (
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="sc-th-btn"
                    onClick={() => toggleSort("name")}
                  >
                    Name <img src={sortIcon} alt="" />
                  </button>
                </th>
                <th>Shared Users</th>
                <th>File Size</th>
                <th>
                  <button
                    type="button"
                    className="sc-th-btn"
                    onClick={() => toggleSort("date")}
                  >
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
                        style={{
                          background: ROW_COLORS[idx % ROW_COLORS.length],
                        }}
                      >
                        <img src={fileIcon} alt="" />
                      </span>
                      {s.original_filename || `Scan #${s.id}`}
                    </Link>
                  </td>
                  <td>
                    {s.share_token ? (
                      <span className="sc-shared-yes">Anyone with link</span>
                    ) : (
                      <span className="sc-unknown">Private</span>
                    )}
                  </td>
                  <td>
                    {s.size_bytes ? (
                      formatBytes(s.size_bytes)
                    ) : (
                      // The image is deleted once OCR finishes, so scans made
                      // before size was recorded can never have it filled in.
                      <span
                        className="sc-unknown"
                        title="Not recorded — this scan predates file-size tracking"
                      >
                        &mdash;
                      </span>
                    )}
                  </td>
                  <td>
                    {new Date(s.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    <div className="sc-row-actions">
                      <button
                        type="button"
                        className="sc-row-menu"
                        aria-label={`Options for ${s.original_filename || `Scan #${s.id}`}`}
                        aria-expanded={menuFor === s.id}
                        onClick={() => {
                          setMenuFor((cur) => (cur === s.id ? null : s.id));
                          setConfirmingDelete(null);
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
                            className="sc-menu-item"
                            disabled={sharing}
                            onClick={() => handleShare(s.id)}
                          >
                            Share
                          </button>
                          <button
                            type="button"
                            className="sc-menu-item sc-menu-danger"
                            onClick={() => handleDeleteScan(s.id)}
                          >
                            {confirmingDelete === s.id
                              ? "Confirm delete"
                              : "Delete"}
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

      {/* Share panel. A dialog rather than a menu item that silently copies,
          because turning this on makes the scan readable by anyone with the
          link — that deserves to be stated, and revoking has to be one click
          away from where it was switched on. */}
      {shareFor !== null && (
        <div
          className="sc-share-scrim"
          onMouseDown={(e) => e.target === e.currentTarget && setShareFor(null)}
        >
          <div className="sc-share" role="dialog" aria-label="Share document">
            <p className="sc-share-title">Share this document</p>
            <p className="sc-share-note">
              Anyone with this link can read the scanned text — no account
              needed. Stop sharing to break the link.
            </p>

            <div className="sc-share-row">
              <input
                readOnly
                value={shareLink}
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="sc-share-copy"
                onClick={handleCopyLink}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="sc-share-actions">
              <button
                type="button"
                className="sc-share-stop"
                disabled={sharing}
                onClick={() => handleStopSharing(shareFor)}
              >
                Stop sharing
              </button>
              <button
                type="button"
                className="sc-share-done"
                onClick={() => setShareFor(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
