import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import SubmissionTable from "./SubmissionTable";
import SubmitWork from "./SubmitWork";
import FilePreview from "./FilePreview";

function formatWhen(value) {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DocIcon({ material }) {
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
      {material ? (
        <>
          <path d="M4 5.6A1.6 1.6 0 0 1 5.6 4H10a2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 1 2-1h4.4A1.6 1.6 0 0 1 20 5.6v12.8a1.6 1.6 0 0 1-1.6 1.6H14a2.4 2.4 0 0 0-2 1 2.4 2.4 0 0 0-2-1H5.6A1.6 1.6 0 0 1 4 18.4z" />
          <path d="M12 5v15" />
        </>
      ) : (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </>
      )}
    </svg>
  );
}

/**
 * One row in the curriculum feed, collapsed to its headline and expandable.
 *
 * Collapsed shows only what a teacher scans for: what it is, when it is due,
 * and how many have turned it in. Everything else is a click away.
 */
export default function CurriculumItem({
  item,
  classId,
  isTeacher,
  onChanged,
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // The file currently open in the viewer, or null.
  const [preview, setPreview] = useState(null);

  const isAssignment = item.type === "assignment";
  const mine = item.my_submission;

  async function remove() {
    // Arms on the first click, acts on the second — the same pattern the Scan
    // page's delete uses. Disarms on a timer, because blur never fires if
    // focus never landed on the button.
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setBusy(true);
    try {
      await api.deleteClassItem(token, item.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`cu${open ? " open" : ""}`}>
      <div className="cu-row">
        <span className={`cu-icon${isAssignment ? "" : " material"}`}>
          <DocIcon material={!isAssignment} />
        </span>

        <button
          type="button"
          className="cu-main"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="cu-title">{item.title}</span>
          <span className="cu-meta">
            <span className={`cu-kind${isAssignment ? "" : " material"}`}>
              {isAssignment ? "Assignment" : "Material"}
            </span>
            <span>Posted {formatWhen(item.created_at)}</span>
            {isAssignment && item.due_at && (
              <span className={item.is_overdue ? "cu-due-past" : ""}>
                Due {formatWhen(item.due_at)}
              </span>
            )}
            {isAssignment && item.points ? (
              <span>{item.points} points</span>
            ) : null}
          </span>
        </button>

        {/* Teacher sees the turn-in count; a student sees their own state. */}
        {isAssignment && isTeacher && (
          <span className="cu-count">
            <strong>
              {item.turned_in}/{item.total_students}
            </strong>
            <em>turned in</em>
          </span>
        )}

        {isAssignment && !isTeacher && (
          <span className={`cu-status cu-status-${mine?.status || "missing"}`}>
            {mine?.status === "graded"
              ? item.points
                ? `${mine.score ?? "—"}/${item.points}`
                : "Graded"
              : mine?.status === "submitted"
                ? "Submitted"
                : item.is_overdue
                  ? "Missing"
                  : "To do"}
          </span>
        )}

        {isTeacher && (
          <button
            type="button"
            className={`cu-del${confirming ? " armed" : ""}`}
            onClick={remove}
            disabled={busy}
            title="Delete"
          >
            {confirming ? (
              "Sure?"
            ) : (
              /* Drawn, not the 🗑 glyph: an emoji renders in a different
                 typeface on every OS and cannot follow `currentColor`, so it
                 stayed dark while the button turned red on arming. Same 24
                 grid and 1.7 stroke as every other icon in the app. */
              <svg
                className="cu-del-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h16" />
                <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
                <path d="M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
                <path d="M10.5 11v5.5M13.5 11v5.5" />
              </svg>
            )}
          </button>
        )}

        <button
          type="button"
          className="cu-chev"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path
              d={open ? "M6 14l6-6 6 6" : "M6 10l6 6 6-6"}
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {open && (
        <div className="cu-body">
          {item.description && <p className="cu-desc">{item.description}</p>}

          {item.files?.length > 0 && (
            <div className="cu-files">
              {item.files.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="cu-file"
                  /* Opens a viewer rather than saving to disk. Downloading was
                     the only option before, so reading an attachment meant
                     leaving the app for it. Download is still offered inside
                     the viewer, and is the only option for types a browser
                     cannot render. */
                  onClick={() =>
                    setPreview({
                      url: api.classFileUrl(f.id),
                      name: f.name,
                      mime: f.mime,
                      size: f.size,
                    })
                  }
                  title={f.name}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {!item.description && !item.files?.length && (
            <p className="cu-desc cl-muted">No instructions or attachments.</p>
          )}

          {isAssignment && isTeacher && (
            <SubmissionTable itemId={item.id} points={item.points} />
          )}

          {isAssignment && !isTeacher && (
            <SubmitWork item={item} submission={mine} onDone={onChanged} />
          )}
        </div>
      )}

      {preview && (
        <FilePreview {...preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
