import { useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import FilePreview from "./FilePreview";

/**
 * The student's side of an assignment: turn work in, see the grade come back.
 *
 * Resubmitting REPLACES the previous files rather than adding more — there is
 * one piece of work per student per assignment, and two would leave the teacher
 * guessing which to mark.
 */
export default function SubmitWork({ item, submission, onDone }) {
  const { token } = useAuth();
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  // The submitted file currently open in the viewer, or null.
  const [preview, setPreview] = useState(null);

  const graded = submission?.status === "graded";
  const closed = item.is_overdue && !item.allow_late;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.submitClassWork(token, item.id, { note, files });
      setFiles([]);
      setNote("");
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sw">
      {submission?.submitted_at && (
        <div className="sw-current">
          <div className="sw-current-head">
            <span className={`st-badge st-${submission.status}`}>
              {graded ? "Graded" : "Submitted"}
            </span>
            {submission.is_late && <span className="st-late">Late</span>}
            {graded && item.points != null && (
              <span className="sw-score">
                {submission.score ?? "—"}/{item.points}
              </span>
            )}
          </div>

          {submission.files?.map((f) => (
            <button
              key={f.id}
              type="button"
              className="cu-file"
              /* The student checking what they actually turned in — the same
                 viewer the teacher marks from. */
              onClick={() =>
                setPreview({
                  url: api.submissionFileUrl(f.id),
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

          {/* The whole reason a student cares about any of this. */}
          {submission.feedback && (
            <div className="sw-feedback">
              <span className="sw-feedback-label">Feedback</span>
              <p>{submission.feedback}</p>
            </div>
          )}
        </div>
      )}

      {closed ? (
        <p className="cl-muted sw-closed">
          This assignment is closed — the due date has passed and late work was
          not allowed.
        </p>
      ) : (
        <form className="sw-form" onSubmit={submit}>
          <button
            type="button"
            className="ci-drop sw-drop"
            onClick={() => fileRef.current?.click()}
          >
            <span>
              {files.length
                ? `${files.length} file(s) ready`
                : submission?.submitted_at
                  ? "Choose new files to replace your submission"
                  : "Attach your work"}
            </span>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => setFiles([...e.target.files])}
            />
          </button>

          <textarea
            className="ci-input ci-area"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note for your teacher (optional)…"
            rows={2}
          />

          {item.is_overdue && item.allow_late && (
            <p className="sw-late-warn">
              The due date has passed — this will be marked late.
            </p>
          )}

          {error && <p className="cl-error">{error}</p>}

          <button
            type="submit"
            className="cl-btn cl-btn-sm"
            disabled={busy || (!files.length && !submission?.submitted_at)}
          >
            {busy
              ? "Submitting…"
              : submission?.submitted_at
                ? "Resubmit"
                : "Turn in"}
          </button>
        </form>
      )}

      {preview && (
        <FilePreview {...preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
