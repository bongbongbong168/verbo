import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import PageTools from "../components/PageTools";
import JoinCode from "../components/JoinCode";
import CurriculumItem from "../components/CurriculumItem";
import CreateItemDialog from "../components/CreateItemDialog";
import "./Classes.css";

/* ATTENDANCE WAS A TAB HERE AND IS GONE. It rendered a "Soon" chip over a
   panel explaining that marking students present per session needs a record
   nothing in Verbo produces. That was honest, but a permanent placeholder in
   the primary navigation of a class is still a tab that never does anything —
   it is the same call as the Practice section being kept out of the rail. */
const TABS = [
  { key: "curriculum", label: "Curriculum" },
  { key: "students", label: "Students", teacherOnly: true },
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

function ClockIcon() {
  return (
    <svg className="cl-rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.4V12l3.1 1.9" />
    </svg>
  );
}

function CalIcon() {
  return (
    <svg className="cl-rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

/* Named for what happened, not for the table it came from. `submitted` says
   "handed in" because that is the teacher’s word for it. */
const FEED_LABEL = {
  assignment_posted: "New assignment posted",
  material_posted: "New material posted",
  submitted: "Work handed in",
};

/* "Aug 28, 2026 · 10:43 PM". Absolute rather than "3 days ago": these rows
   are a record of when things happened in a class, and a teacher comparing
   them against a due date needs the date itself. */
const feedFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function longWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : feedFmt.format(d).replace(", ", " · ");
}
function PeopleIcon() {
  return (
    <svg className="cl-mini-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <path d="M16.2 5.9a3.2 3.2 0 0 1 0 4.9" />
      <path d="M18 14.6c1.6.8 2.7 2.4 2.7 4.2" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg className="cl-mini-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M8.8 13h6.4M8.8 16.4h4.2" />
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
  /* Counted from the items already on the page rather than asked for
     separately — a second source for a number sitting beside the list it
     comes from is a number that can disagree with it. */
  const assignmentCount = cls.items.filter((i) => i.type === "assignment").length;
  const visibleTabs = TABS.filter((t) => !t.teacherOnly || isTeacher);
  const hasRail = (cls.activity?.length || 0) + (cls.upcoming?.length || 0) > 0;

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
            {cls.subject && <span className="cl-chip">{cls.subject}</span>}
            {cls.focus && <span className="cl-chip">{cls.focus}</span>}
            {cls.term && <span className="cl-chip">{cls.term}</span>}
            {cls.level && (
              <span className="cl-chip cl-chip-level">{cls.level}</span>
            )}
            {!isTeacher && cls.teacher?.name && (
              <span className="cl-chip">{cls.teacher.name}</span>
            )}
            {/* REAL STATE, not decoration — and the reason it may exist here
                when the hub card refused one is that `show` does not filter
                archived classes out. A class that has been put away is still
                readable by the people who were in it, so this word changes;
                on the hub every row is un-archived by construction, which is
                why that card badges ungraded work instead. */}
            <span
              className={`cl-status${cls.archived_at ? " archived" : ""}`}
            >
              <span className="cl-status-dot" aria-hidden="true" />
              {cls.archived_at ? "Archived" : "Active"}
            </span>
          </div>

          {cls.description && (
            <p className="cl-head-desc">{cls.description}</p>
          )}

          {/* What the class IS, in numbers. Both are already on screen further
              down — the roster and the curriculum — but a teacher opening the
              page wants the size of the thing before they scroll to it. */}
          <div className="cl-head-stats">
            <span className="cl-head-stat">
              <PeopleIcon />
              {cls.students_count} {cls.students_count === 1 ? "Student" : "Students"}
            </span>
            <span className="cl-head-stat">
              <SheetIcon />
              {assignmentCount}{" "}
              {assignmentCount === 1 ? "Assignment" : "Assignments"}
            </span>
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
          </button>
        ))}
      </nav>

      {/* TWO COLUMNS, and the right one is REAL rather than padding. It
          carries what changed in this class and what is due next — both
          derived from rows the portal already writes, the same two queries
          the hub builds for every class at once. A class with neither is
          genuinely quiet, so the rail simply is not drawn and the panel
          takes the full width back. */}
      <div className={`cl-body${hasRail ? "" : " cl-body-wide"}`}>
        <div className="cl-main">

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
              {/* No mark. A plus in a chip directly above a button that already
                  says "Post to class" is the same instruction twice, and the
                  larger, quieter of the two was the one carrying no words. */}
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

        </div>

        {hasRail && (
          <aside className="cl-rail">
            {cls.activity?.length > 0 && (
              <section className="cl-rail-card">
                <div className="cl-rail-head">
                  <ClockIcon />
                  <h2>Class activity</h2>
                </div>
                <ul className="cl-feed">
                  {cls.activity.map((a, i) => (
                    <li className="cl-feed-row" key={`${a.kind}-${a.at}-${i}`}>
                      {/* The dot is the KIND, so the three read apart at a
                          glance without a second word on every line. */}
                      <span className={`cl-feed-dot cl-feed-${a.kind}`} aria-hidden="true" />
                      <div>
                        <p className="cl-feed-what">{FEED_LABEL[a.kind] || "Updated"}</p>
                        <p className="cl-feed-title">
                          {a.title}
                          {a.who ? ` — ${a.who}` : ""}
                        </p>
                        <p className="cl-feed-when">{longWhen(a.at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {cls.upcoming?.length > 0 && (
              <section className="cl-rail-card">
                <div className="cl-rail-head">
                  <CalIcon />
                  <h2>Upcoming</h2>
                </div>
                <ul className="cl-due">
                  {cls.upcoming.map((u) => (
                    <li className="cl-due-row" key={u.id}>
                      <span className="cl-due-mark" aria-hidden="true">
                        <CalIcon />
                      </span>
                      <div>
                        <p className="cl-due-title">{u.title}</p>
                        <p className="cl-due-when">{longWhen(u.due_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>

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
