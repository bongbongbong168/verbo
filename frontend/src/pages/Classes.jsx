import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import PageTools from "../components/PageTools";
import JoinCode from "../components/JoinCode";
import "./Classes.css";

function CapIcon() {
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
      <path d="M2.5 8.5 12 4l9.5 4.5L12 13z" />
      <path d="M6.5 10.7v4.6c0 1.4 2.5 2.7 5.5 2.7s5.5-1.3 5.5-2.7v-4.6" />
      <path d="M21.5 8.5v5" />
    </svg>
  );
}

const EMPTY = {
  name: "",
  subject: "",
  level: "",
  focus: "",
  term: "",
  description: "",
};

/**
 * The classes hub: what you teach, what you are enrolled in, and the two ways
 * in — create one, or join with a code.
 *
 * One page for both roles rather than a separate "teacher portal": a person can
 * easily teach one class and study in another, and splitting them would mean
 * choosing a side at the front door.
 */
export default function Classes() {
  const { token } = useAuth();
  const [data, setData] = useState({ teaching: [], joined: [], to_grade: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [joinNote, setJoinNote] = useState(null);

  function load() {
    setLoading(true);
    api
      .getClasses(token)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  // Escape closes the create dialog, matching CreateItemDialog and the file
  // viewer — a modal that can only be dismissed by aiming at a ✕ is a modal
  // people feel trapped in.
  useEffect(() => {
    if (!creating) return;
    function onKey(e) {
      if (e.key === "Escape") setCreating(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating]);

  async function createClass(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createClass(token, form);
      setForm(EMPTY);
      setCreating(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function join(e) {
    e.preventDefault();
    setBusy(true);
    setJoinNote(null);
    try {
      const joined = await api.joinClass(token, code.trim());
      setCode("");
      setJoinNote({ ok: true, text: `Joined ${joined.name}.` });
      load();
    } catch (err) {
      setJoinNote({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="cl">
      <div className="cl-top">
        <h1 className="cl-title">Classes</h1>
        <div className="cl-tools">
          <PageTools />
        </div>
      </div>

      {error && <p className="cl-error">{error}</p>}

      {/* The two ways in, side by side — creating and joining are the only
          things you can do from here, so neither is buried in a menu. */}
      <div className="cl-entry">
        <div className="cl-entry-card">
          <span className="cl-entry-label">Teaching</span>
          <p className="cl-entry-text">
            Create a class, then read the join code out to your students.
          </p>
          {/* Always "Create class" now — the dialog carries its own Cancel, so
              this button no longer has to double as the way out. */}
          <button
            type="button"
            className="cl-btn"
            onClick={() => setCreating(true)}
          >
            + Create class
          </button>
        </div>

        <div className="cl-entry-card">
          <span className="cl-entry-label">Studying</span>
          <p className="cl-entry-text">
            Got a code from your teacher? Enter it here.
          </p>
          <form className="cl-join" onSubmit={join}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              maxLength={12}
              aria-label="Class code"
            />
            <button
              type="submit"
              className="cl-btn cl-btn-ghost"
              disabled={busy || !code.trim()}
            >
              Join
            </button>
          </form>
          {joinNote && (
            <p className={`cl-join-note${joinNote.ok ? " ok" : ""}`}>
              {joinNote.text}
            </p>
          )}
        </div>
      </div>

      {/* A dialog, not an inline panel. Creating a class is a short, committed
          task with its own fields, and unfolding it in the middle of the page
          pushed the class lists you were looking at down the screen. Reuses the
          `ci-` shell that CreateItemDialog already uses, so the portal has one
          dialog language rather than two. */}
      {creating && (
        <div
          className="ci-scrim"
          onMouseDown={(e) => e.target === e.currentTarget && setCreating(false)}
        >
          <form
            className="ci cl-create"
            onSubmit={createClass}
            role="dialog"
            aria-modal="true"
            aria-label="Create a class"
          >
            {/* The supporting line says what HAPPENS, not what you already
                know. "You will be the teacher" restated the button you just
                pressed; the join code is the thing you get out of this and the
                next thing you will need. It is a sentence in muted text rather
                than the uppercase `ci-sub` eyebrow, which is a label style and
                reads as shouting when a sentence is put in it. */}
            <div className="ci-head cl-create-head">
              <span className="cl-create-mark" aria-hidden="true">
                <CapIcon />
              </span>
              <div className="cl-create-heading">
                <h2 className="ci-title">Create a class</h2>
                <p className="cl-create-note">
                  You&rsquo;ll get a join code to share with your students.
                </p>
              </div>
              <button
                type="button"
                className="ci-x"
                onClick={() => setCreating(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="cl-form-grid">
            <label className="cl-field cl-field-wide">
              <span>Class name</span>
              <input
                value={form.name}
                onChange={set("name")}
                required
                maxLength={120}
                autoFocus
              />
            </label>
            <label className="cl-field">
              <span>Subject</span>
              <input
                value={form.subject}
                onChange={set("subject")}
                placeholder="Chinese"
              />
            </label>
            <label className="cl-field">
              <span>Level</span>
              <input
                value={form.level}
                onChange={set("level")}
                placeholder="HSK 3"
              />
            </label>
            <label className="cl-field">
              <span>Learning focus</span>
              <input
                value={form.focus}
                onChange={set("focus")}
                placeholder="Speaking & listening"
              />
            </label>
            <label className="cl-field">
              <span>Term</span>
              <input
                value={form.term}
                onChange={set("term")}
                placeholder="Sem 1"
              />
            </label>
            <label className="cl-field cl-field-wide">
              <span>Description</span>
              <textarea
                value={form.description}
                onChange={set("description")}
                rows={2}
              />
            </label>
            </div>

            <div className="cl-create-foot">
              {/* Honest and useful: it stops someone hunting for the "right"
                  subject before they can start, and it is true — every one of
                  these is editable from the class's Settings tab. */}
              <p className="cl-create-hint">
                Only the name is required. Everything else can be changed later.
              </p>
              <button
                type="button"
                className="cl-quiet"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="cl-btn"
                disabled={busy || !form.name.trim()}
              >
                {busy ? "Creating…" : "Create class"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <p className="cl-empty">Loading your classes…</p>}

      {!loading && data.teaching.length > 0 && (
        <section className="cl-section">
          <div className="cl-sec-head">
            <h2 className="cl-sec-title">Teaching</h2>
            {data.to_grade > 0 && (
              <span className="cl-pending">{data.to_grade} to grade</span>
            )}
          </div>

          <div className="cl-grid">
            {data.teaching.map((c) => (
              <div className="cl-card" key={c.id}>
                <Link className="cl-card-link" to={`/classes/${c.id}`}>
                  <span className="cl-card-icon">
                    <CapIcon />
                  </span>
                  <span className="cl-card-body">
                    <span className="cl-card-name">{c.name}</span>
                    <span className="cl-card-chips">
                      {c.focus && <span className="cl-chip">{c.focus}</span>}
                      {c.term && <span className="cl-chip">{c.term}</span>}
                      {c.level && (
                        <span className="cl-chip cl-chip-level">{c.level}</span>
                      )}
                    </span>
                    <span className="cl-card-stats">
                      {c.students_count}{" "}
                      {c.students_count === 1 ? "student" : "students"} ·{" "}
                      {c.assignments_count}{" "}
                      {c.assignments_count === 1 ? "assignment" : "assignments"}
                    </span>
                  </span>
                </Link>

                {/* The code sits on the card because handing it out is the
                    single most common thing a teacher does here. */}
                <JoinCode code={c.join_code} open={c.join_open} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && data.joined.length > 0 && (
        <section className="cl-section">
          <div className="cl-sec-head">
            <h2 className="cl-sec-title">Enrolled</h2>
          </div>

          <div className="cl-grid">
            {data.joined.map((c) => (
              <Link
                className="cl-card cl-card-link"
                key={c.id}
                to={`/classes/${c.id}`}
              >
                <span className="cl-card-icon">
                  <CapIcon />
                </span>
                <span className="cl-card-body">
                  <span className="cl-card-name">{c.name}</span>
                  <span className="cl-card-chips">
                    {c.focus && <span className="cl-chip">{c.focus}</span>}
                    {c.term && <span className="cl-chip">{c.term}</span>}
                    {c.level && (
                      <span className="cl-chip cl-chip-level">{c.level}</span>
                    )}
                  </span>
                  <span className="cl-card-stats">
                    {c.assignments_count}{" "}
                    {c.assignments_count === 1 ? "assignment" : "assignments"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!loading && data.teaching.length === 0 && data.joined.length === 0 && (
        <p className="cl-empty">
          No classes yet. Create one to start teaching, or join one with a code
          from your teacher.
        </p>
      )}
    </div>
  );
}
