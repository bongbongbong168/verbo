import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

function UploadIcon() {
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
      <path d="M12 15.5V4" />
      <path d="m8 7.7 4-3.7 4 3.7" />
      <path d="M4.5 14v4.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V14" />
    </svg>
  );
}

/**
 * Post an assignment or a material.
 *
 * One dialog with a type switch rather than two: they share a title, body and
 * attachments, and only an assignment adds a due date, a score and the late
 * rule. Switching type hides those rather than opening a different form.
 */
export default function CreateItemDialog({
  className,
  classId,
  onClose,
  onCreated,
}) {
  const { token } = useAuth();
  const [type, setType] = useState("assignment");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [points, setPoints] = useState("");
  const [allowLate, setAllowLate] = useState(true);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    function esc(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createClassItem(token, classId, {
        type,
        title,
        description,
        due_at: type === "assignment" && dueAt ? dueAt.replace("T", " ") : null,
        points: type === "assignment" ? points : "",
        allow_late: allowLate,
        files,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const isAssignment = type === "assignment";

  return (
    <div
      className="ci-scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="ci"
        role="dialog"
        aria-modal="true"
        aria-label="Create curriculum log"
      >
        <div className="ci-head">
          <div>
            <h2 className="ci-title">
              {isAssignment ? "Create assignment" : "Share material"}
            </h2>
            <p className="ci-sub">{className}</p>
          </div>
          <button
            type="button"
            className="ci-x"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="ci-switch">
          {["assignment", "material"].map((t) => (
            <button
              key={t}
              type="button"
              className={`ci-switch-btn${type === t ? " active" : ""}`}
              onClick={() => setType(t)}
            >
              {t === "assignment" ? "Assignment" : "Material"}
            </button>
          ))}
        </div>

        <form className="ci-form" onSubmit={submit}>
          <input
            className="ci-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title…"
            required
            maxLength={200}
            autoFocus
          />

          <textarea
            className="ci-input ci-area"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isAssignment ? "Instructions…" : "Description…"}
            rows={3}
          />

          {/* Only an assignment has a deadline or a score — a material with a
              due date would be a field the student could never act on. */}
          {isAssignment && (
            <div className="ci-row">
              <label className="ci-inline">
                <span>Due</span>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </label>

              <label className="ci-inline ci-inline-sm">
                <span>Points</span>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="20"
                />
              </label>

              <button
                type="button"
                className={`ci-late${allowLate ? " on" : ""}`}
                onClick={() => setAllowLate((v) => !v)}
                aria-pressed={allowLate}
              >
                Late: {allowLate ? "Yes" : "No"}
              </button>
            </div>
          )}

          <button
            type="button"
            className="ci-drop"
            onClick={() => fileRef.current?.click()}
          >
            <UploadIcon />
            <span>
              {files.length
                ? `${files.length} file(s) attached`
                : "Attach files"}
            </span>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => setFiles([...e.target.files])}
            />
          </button>

          {files.length > 0 && (
            <ul className="ci-files">
              {files.map((f, i) => (
                <li key={f.name + i}>
                  <span>{f.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((list) => list.filter((_, j) => j !== i))
                    }
                    aria-label={`Remove ${f.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="ci-error">{error}</p>}

          <button
            type="submit"
            className="ci-save"
            disabled={busy || !title.trim()}
          >
            {busy
              ? "Posting…"
              : isAssignment
                ? "Post assignment"
                : "Post material"}
          </button>
        </form>
      </div>
    </div>
  );
}
