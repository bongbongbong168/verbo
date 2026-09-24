import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import FilePreview from "./FilePreview";

function when(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * The grading table for one assignment.
 *
 * Students who have NOT submitted are listed too — "who is missing" is the
 * question this screen exists to answer, and a table of only the people who
 * turned up cannot answer it.
 *
 * The teacher never has to read a filename: the row already says whose work it
 * is, so "final_final_REAL.docx" is unambiguous.
 */
export default function SubmissionTable({ itemId, points }) {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // The submitted file currently open in the viewer, or null.
  const [preview, setPreview] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getItemSubmissions(token, itemId)
      .then((d) => setRows(d.rows))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, itemId]);

  useEffect(load, [load]);

  async function save(submissionId) {
    setBusy(true);
    setError(null);
    try {
      await api.gradeSubmission(token, submissionId, {
        score: score === "" ? null : Number(score),
        feedback,
      });
      setGrading(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="cl-empty">Loading submissions…</p>;

  return (
    <div className="gr">
      {error && <p className="cl-error">{error}</p>}

      <table className="cl-table gr-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Work</th>
            <th>Score</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ user, submission }) => {
            const status = submission?.status || "missing";
            const isOpen = grading === submission?.id;

            return (
              <Fragment key={user.id}>
              <tr>
                <td>
                  <span className="cl-student">
                    {user.avatar_url ? (
                      <img className="cl-face" src={user.avatar_url} alt="" />
                    ) : (
                      <span className="cl-face cl-face-initial">
                        {(user.name || "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="cl-student-name">{user.name}</span>
                  </span>
                </td>

                <td>
                  <span className={`gr-badge gr-${status}`}>
                    {status === "graded"
                      ? "Graded"
                      : status === "submitted"
                        ? "Submitted"
                        : "Missing"}
                  </span>
                  {submission?.is_late && <span className="gr-late">Late</span>}
                </td>

                <td className="cl-muted">{when(submission?.submitted_at)}</td>

                <td>
                  {submission?.files?.length ? (
                    submission.files.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className="cu-file gr-file"
                        /* Opens the work rather than saving it. This is the
                           row that matters most: marking six submissions used
                           to mean saving six files to disk and opening them
                           outside the app. */
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
                    ))
                  ) : (
                    <span className="cl-muted">—</span>
                  )}
                </td>

                <td>
                  {submission?.score != null
                    ? `${submission.score}${points ? `/${points}` : ""}`
                    : "—"}
                </td>

                <td className="cl-row-end">
                  {submission?.submitted_at && (
                    <button
                      type="button"
                      className="cl-quiet"
                      onClick={() => {
                        setGrading(isOpen ? null : submission.id);
                        setScore(submission.score ?? "");
                        setFeedback(submission.feedback ?? "");
                      }}
                    >
                      {isOpen
                        ? "Close"
                        : submission.score != null
                          ? "Edit grade"
                          : "Grade"}
                    </button>
                  )}

                </td>
              </tr>
              {isOpen && (
                <tr className="gr-editor-row">
                  <td colSpan={6}>
                    <form
                      className="gr-grade"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(submission.id);
                      }}
                    >
                      <label className="gr-score-field">
                        <span>Score{points ? ` / ${points}` : ""}</span>
                        <input
                          type="number"
                          min="0"
                          max={100}
                          value={score}
                          onChange={(e) => setScore(e.target.value)}
                          autoFocus
                        />
                      </label>
                      <label className="gr-feedback-field">
                        <span>Feedback</span>
                        <textarea
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="Feedback for the student…"
                          rows={2}
                        />
                      </label>
                      <button
                        type="submit"
                        className="cl-btn cl-btn-sm gr-save"
                        disabled={busy}
                      >
                        {busy ? "Saving…" : "Save grade"}
                      </button>
                      {submission.note && (
                        <p className="gr-note"><span>Student note</span>{submission.note}</p>
                      )}
                    </form>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {preview && (
        <FilePreview {...preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
