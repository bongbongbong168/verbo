import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import PageTools from "../components/PageTools";
import JoinCode from "../components/JoinCode";
import CurriculumItem from "../components/CurriculumItem";
import CreateItemDialog from "../components/CreateItemDialog";
import "./Classes.css";

/* Attendance is deliberately not built yet — the tab is here so the shape of
   the portal is visible, and it says so rather than pretending. */
const TABS = [
  { key: "curriculum", label: "Curriculum" },
  { key: "students", label: "Students", teacherOnly: true },
  { key: "attendance", label: "Attendance", soon: true },
  { key: "settings", label: "Settings", teacherOnly: true },
];

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

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

export default function Classroom() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [cls, setCls] = useState(null);
  const [tab, setTab] = useState("curriculum");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getClass(token, id)
      .then((data) => {
        setCls(data);
        setSettings({
          name: data.name,
          subject: data.subject || "",
          level: data.level || "",
          focus: data.focus || "",
          term: data.term || "",
          description: data.description || "",
          join_open: data.join_open,
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, id]);

  useEffect(load, [load]);

  // The roster is its own call — most visits never open that tab.
  useEffect(() => {
    if (tab !== "students" || cls?.role !== "teacher") return;
    api
      .getClassStudents(token, id)
      .then(setStudents)
      .catch(() => {});
  }, [tab, cls?.role, token, id]);

  async function saveSettings(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateClass(token, id, settings);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeClass() {
    setBusy(true);
    try {
      await api.deleteClass(token, id);
      navigate("/classes");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (loading) return <p className="cl-empty cl-page-note">Loading class…</p>;
  if (!cls)
    return (
      <p className="cl-error cl-page-note">{error || "Class not found."}</p>
    );

  const isTeacher = cls.role === "teacher";
  const visibleTabs = TABS.filter((t) => !t.teacherOnly || isTeacher);

  return (
    <div className="cl">
      <div className="cl-top">
        <Link className="cl-back" to="/classes">
          ← Back to classes
        </Link>
        <div className="cl-tools">
          <PageTools />
        </div>
      </div>

      <header className="cl-head">
        <span className="cl-head-icon">
          <CapIcon />
        </span>
        <div className="cl-head-body">
          <h1 className="cl-head-name">{cls.name}</h1>
          {/* Two treatments, not three. Focus and term are the same KIND of
              fact — what it covers and when — so they wear the same quiet
              chip; only the level is emphasised, because it is the one a
              student checks. Anything with a hard navy outline here reads as a
              button: that is the app's card-stroke colour, not a label's. */}
          <div className="cl-head-chips">
            {cls.focus && <span className="cl-chip">{cls.focus}</span>}
            {cls.term && <span className="cl-chip">{cls.term}</span>}
            {cls.level && (
              <span className="cl-chip cl-chip-level">{cls.level}</span>
            )}
            {!isTeacher && cls.teacher?.name && (
              <span className="cl-chip">{cls.teacher.name}</span>
            )}
          </div>
        </div>
        {isTeacher && <JoinCode code={cls.join_code} open={cls.join_open} />}
      </header>

      {error && <p className="cl-error">{error}</p>}

      <nav className="cl-tabs">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`cl-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.soon && <span className="cl-soon">Soon</span>}
          </button>
        ))}
      </nav>

      {tab === "curriculum" && (
        <>
          {/* A proper section head rather than a button floating on its own:
              what this list is and how much is in it on the left, the one
              action that adds to it on the right. Same shape as the Vocabulary
              Bank's list head, so a "here is a list, here is how you add to
              it" row looks the same wherever it appears. */}
          <div className="cl-log-head">
            <div className="cl-log-title">
              <h2>Curriculum</h2>
              {cls.items.length > 0 && (
                <span className="cl-log-count">
                  {cls.items.length}
                  {/* The word is dropped visually but kept for screen
                      readers — "Curriculum, 1" on its own says nothing. */}
                  <span className="cl-sr">
                    {cls.items.length === 1 ? " post" : " posts"}
                  </span>
                </span>
              )}
            </div>

            {isTeacher && cls.items.length > 0 && (
              <button
                type="button"
                className="cl-btn cl-btn-log"
                onClick={() => setCreating(true)}
              >
                <PlusIcon />
                Post to class
              </button>
            )}
          </div>

          {cls.items.length === 0 ? (
            /* An empty list is where someone most needs telling what this is
               for, so the CTA lives INSIDE the empty state rather than above
               an empty panel. Dashed, because it is a slot waiting to be
               filled rather than a card with content in it. */
            <div className="cl-log-empty">
              <span className="cl-log-empty-mark" aria-hidden="true">
                <PlusIcon />
              </span>
              <p className="cl-log-empty-title">
                {isTeacher ? "Nothing posted yet" : "Nothing here yet"}
              </p>
              <p className="cl-log-empty-text">
                {isTeacher
                  ? "Post an assignment for students to turn in, or share material for them to read. Everything you post shows up here in order."
                  : "Your teacher has not posted anything yet. Assignments and materials will appear here."}
              </p>
              {isTeacher && (
                <button
                  type="button"
                  className="cl-btn"
                  onClick={() => setCreating(true)}
                >
                  Post to class
                </button>
              )}
            </div>
          ) : (
            <div className="cl-items">
              {cls.items.map((item) => (
                <CurriculumItem
                  key={item.id}
                  item={item}
                  classId={cls.id}
                  isTeacher={isTeacher}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "students" && isTeacher && (
        <div className="cl-panel">
          {students.length === 0 ? (
            <p className="cl-empty">
              No students yet. Share the code <strong>{cls.join_code}</strong>{" "}
              so they can join.
            </p>
          ) : (
            <table className="cl-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Submitted</th>
                  <th>Progress</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="cl-student">
                        {s.avatar_url ? (
                          <img className="cl-face" src={s.avatar_url} alt="" />
                        ) : (
                          <span className="cl-face cl-face-initial">
                            {(s.name || "?").charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span>
                          <span className="cl-student-name">{s.name}</span>
                          <span className="cl-student-email">{s.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      {s.submitted}/{s.total}
                    </td>
                    <td>
                      {/* Null when no work has been set — 0% would read as
                          failure rather than as "nothing to do yet". */}
                      {s.percent === null ? (
                        <span className="cl-muted">No work set</span>
                      ) : (
                        <span className="cl-progress">
                          <span
                            className="cl-progress-fill"
                            style={{ width: `${s.percent}%` }}
                          />
                        </span>
                      )}
                    </td>
                    <td className="cl-row-end">
                      <button
                        type="button"
                        className="cl-quiet"
                        onClick={async () => {
                          await api.removeClassMember(token, id, s.id);
                          api.getClassStudents(token, id).then(setStudents);
                          load();
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "attendance" && (
        <div className="cl-panel cl-soon-panel">
          <h2 className="cl-soon-title">Attendance isn&rsquo;t built yet</h2>
          <p className="cl-empty">
            The space is reserved. Marking students present or absent per
            session needs its own record, and nothing in Verbo produces one
            today.
          </p>
        </div>
      )}

      {tab === "settings" && isTeacher && settings && (
        <div className="cl-panel">
          <form className="cl-form" onSubmit={saveSettings}>
            <div className="cl-form-grid">
              {[
                ["name", "Class name", true],
                ["subject", "Subject"],
                ["level", "Level"],
                // Replaced "Room". Verbo is online, so a room number described
                // nothing a student could use; what the class is working on
                // does.
                ["focus", "Learning focus"],
                ["term", "Term"],
              ].map(([key, label, wide]) => (
                <label
                  className={`cl-field${wide ? " cl-field-wide" : ""}`}
                  key={key}
                >
                  <span>{label}</span>
                  <input
                    value={settings[key]}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <label className="cl-field cl-field-wide">
                <span>Description</span>
                <textarea
                  value={settings.description}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, description: e.target.value }))
                  }
                  rows={2}
                />
              </label>
            </div>

            <label className="cl-check">
              <input
                type="checkbox"
                checked={settings.join_open}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, join_open: e.target.checked }))
                }
              />
              <span>
                Accepting new students
                <em>
                  Turn this off to stop the code working without deleting the
                  class.
                </em>
              </span>
            </label>

            <button type="submit" className="cl-btn" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </form>

          <div className="cl-danger">
            <div>
              <strong>Delete this class</strong>
              <p>
                Removes the roster, every assignment and every submission.
                Cannot be undone.
              </p>
            </div>
            <button
              type="button"
              className="cl-danger-btn"
              onClick={removeClass}
              disabled={busy}
            >
              Delete class
            </button>
          </div>
        </div>
      )}

      {creating && (
        <CreateItemDialog
          className={cls.name}
          classId={cls.id}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}
