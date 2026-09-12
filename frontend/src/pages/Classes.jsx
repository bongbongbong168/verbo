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

function JoinIcon() {
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
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.5" />
      <path d="M17 8h5M19.5 5.5v5" />
    </svg>
  );
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

function CalendarIcon() {
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
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

const TABS = [
  { key: "all", label: "All classes" },
  { key: "teaching", label: "Teaching" },
  { key: "studying", label: "Studying" },
];

const EMPTY = {
  name: "",
  subject: "",
  level: "",
  focus: "",
  term: "",
  description: "",
};

/**
 * A bare term reads as a stray number.
 *
 * `term` is free text, so it holds both "Sem 1" and "1" — and on a chip row
 * beside a focus and a level, that lone "1" was reported as meaningless:
 * "Business Based · 1 · HSK 3" gives no clue whether it counts students,
 * classes or assignments. Prefixing only when the value is nothing BUT digits
 * names it without mangling a term that already says what it is.
 */
function termLabel(term) {
  return /^\d+$/.test(term.trim()) ? `Term ${term.trim()}` : term;
}

/** "in 3 days" / "tomorrow" — a due date is read as a distance, not a date. */
function dueLabel(iso) {
  const due = new Date(iso);
  const days = Math.round((due - new Date()) / 86400000);
  if (days <= 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 7) return `due in ${days} days`;
  return `due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function agoLabel(iso) {
  const mins = Math.round((new Date() - new Date(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

const ACTIVITY_TEXT = {
  assignment_posted: (a) => `New assignment · ${a.title}`,
  material_posted: (a) => `New material · ${a.title}`,
  submitted: (a) => `${a.who || "A student"} handed in ${a.title}`,
};

/**
 * The right rail: what is happening, and what is coming.
 *
 * Both panels are REAL QUERIES over the curriculum and submission rows the
 * portal already writes — there is no activity log and no schedule table. The
 * page asked for something here because one class in a wide canvas looked
 * unfinished, and the honest way to answer that is with facts the app already
 * holds rather than two permanently empty cards that only fill the column.
 */
function ClassRail({ activity, upcoming }) {
  return (
    <aside className="cl-rail">
      <section className="cl-panel">
        <h2 className="cl-panel-title">
          <span className="cl-panel-mark" aria-hidden="true">
            <ClockIcon />
          </span>
          Class activity
        </h2>
        {activity.length === 0 ? (
          <p className="cl-panel-empty">
            Nothing yet. Work you post and hand-ins you receive show up here.
          </p>
        ) : (
          <ul className="cl-feed">
            {activity.map((a, i) => (
              <li className="cl-feed-row" key={`${a.kind}-${a.at}-${i}`}>
                <Link className="cl-feed-text" to={`/classes/${a.class_id}`}>
                  {(ACTIVITY_TEXT[a.kind] || (() => a.title))(a)}
                </Link>
                <span className="cl-feed-meta">
                  {a.class_name} · {agoLabel(a.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cl-panel">
        <h2 className="cl-panel-title">
          <span className="cl-panel-mark" aria-hidden="true">
            <CalendarIcon />
          </span>
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <p className="cl-panel-empty">
            No assignments due. Ones with a deadline ahead appear here.
          </p>
        ) : (
          <ul className="cl-feed">
            {upcoming.map((u) => (
              <li className="cl-feed-row" key={u.id}>
                <Link className="cl-feed-text" to={`/classes/${u.class_id}`}>
                  {u.title}
                </Link>
                <span className="cl-feed-meta">
                  {u.class_name} · {dueLabel(u.due_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

/**
 * One class, as a card.
 *
 * `subject · level` is the identity line — what this class IS — and the counts
 * sit under it as what is in it. The badge carries ungraded work rather than
 * the word "Active": this page only ever lists un-archived classes, so
 * "Active" would be a constant stamped on every card, which is decoration
 * wearing a status's clothes.
 */
function ClassCard({ c, teaching }) {
  const identity = [c.subject, c.level].filter(Boolean).join(" · ");
  const extras = [c.focus, c.term && termLabel(c.term)].filter(Boolean);
  const students = Number(c.students_count);
  const assignments = Number(c.assignments_count);

  return (
    <div className="cl-card">
      <Link className="cl-card-link" to={`/classes/${c.id}`}>
        <span className="cl-card-icon">
          <CapIcon />
        </span>
        <span className="cl-card-body">
          <span className="cl-card-head">
            <span className="cl-card-name">{c.name}</span>
            {teaching && c.to_grade > 0 && (
              <span className="cl-card-badge">{c.to_grade} to grade</span>
            )}
          </span>
          {identity && <span className="cl-card-identity">{identity}</span>}
          {/* `Number(...)` is load-bearing: SQLite hands these counts back as
              STRINGS, so the old `count === 1` was never true and every card
              read "1 students · 1 assignments". The same coercion the tutor
              and booking ids need before they are compared. */}
          <span className="cl-card-stats">
            {teaching && (
              <>
                {students} {students === 1 ? "Student" : "Students"}
                {" · "}
              </>
            )}
            {assignments} {assignments === 1 ? "Assignment" : "Assignments"}
          </span>
          {extras.length > 0 && (
            <span className="cl-card-chips">
              {extras.map((x) => (
                <span className="cl-chip" key={x}>
                  {x}
                </span>
              ))}
            </span>
          )}
        </span>
      </Link>

      {/* The code sits on the card because handing it out is the single most
          common thing a teacher does here. */}
      <div className="cl-card-foot">
        <JoinCode code={c.join_code} open={c.join_open} />
        <Link className="cl-card-more" to={`/classes/${c.id}`}>
          View class details
        </Link>
      </div>
    </div>
  );
}

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
  const [data, setData] = useState({
    teaching: [],
    joined: [],
    to_grade: 0,
    upcoming: [],
    activity: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("all");

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

  const counts = {
    all: data.teaching.length + data.joined.length,
    teaching: data.teaching.length,
    studying: data.joined.length,
  };
  const total = counts.all;
  /* The filter earns its space only once both roles are in play — three pills
     over a single class is furniture, and "Studying 0" beside it invites a
     click on nothing. */
  const showTabs = counts.teaching > 0 && counts.studying > 0;
  const pool =
    !showTabs || tab === "all"
      ? [...data.teaching, ...data.joined]
      : tab === "teaching"
        ? data.teaching
        : data.joined;
  const shown = pool;

  return (
    <div className="cl">
      <div className="cl-top">
        {/* "Classes" alone is generic — it names the noun and not the job.
            The line under it says what can be done here, which is the same
            treatment the Read and Vocabulary Bank headings get. */}
        <div className="cl-heading">
          <h1 className="cl-title">Classes</h1>
          <p className="cl-subtitle">
            Teach, join, and manage your Chinese classes.
          </p>
        </div>
        <div className="cl-tools">
          <PageTools />
        </div>
      </div>

      {error && <p className="cl-error">{error}</p>}

      {/* The two ways in, side by side — creating and joining are the only
          things you can do from here, so neither is buried in a menu.

          Each card leads with its own mark and a heading naming the ACTION
          rather than the role. "Teaching" and "Studying" are what the lists
          below are called; up here the question is what you came to do, and
          the two cards were otherwise identical slabs of the same weight. */}
      <div className="cl-entry">
        <div className="cl-entry-card">
          <span className="cl-entry-mark" aria-hidden="true">
            <CapIcon />
          </span>
          <div className="cl-entry-body">
            <h2 className="cl-entry-title">Teach a class</h2>
            <p className="cl-entry-text">
              Create one, then read the join code out to your students.
            </p>
          </div>
          {/* Always "Create class" now — the dialog carries its own Cancel, so
              this button no longer has to double as the way out. */}
          <button
            type="button"
            className="cl-btn cl-entry-action"
            onClick={() => setCreating(true)}
          >
            + Create class
          </button>
        </div>

        <div className="cl-entry-card">
          <span className="cl-entry-mark" aria-hidden="true">
            <JoinIcon />
          </span>
          <div className="cl-entry-body">
            <h2 className="cl-entry-title">Join a class</h2>
            <p className="cl-entry-text">
              Enter the code your teacher gave you.
            </p>
          </div>
          <form className="cl-join cl-entry-action" onSubmit={join}>
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

      {/* Body splits once there is anything to show: the classes on the left,
          what is happening on the right. Before this, one class sat alone in
          the full width of the page and read as an unfinished screen rather
          than as a portal with one class in it. */}
      {!loading && (
        <div className="cl-body">
          <div className="cl-main">
            <div className="cl-sec-head">
              <h2 className="cl-sec-title">Your classes</h2>
              {data.to_grade > 0 && (
                <span className="cl-pending">{data.to_grade} to grade</span>
              )}
            </div>

            {/* One list with a filter, not two headed sections. A person who
                both teaches and studies had their classes split across two
                headings with no way to see them together; the counts are real,
                so an empty side says so rather than being hidden. */}
            {showTabs && (
              <div className="cl-tabs" role="tablist" aria-label="Filter classes">
                {TABS.map((t) => (
                  <button
                    type="button"
                    key={t.key}
                    role="tab"
                    aria-selected={tab === t.key}
                    className={`cl-tab${tab === t.key ? " on" : ""}`}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                    <span className="cl-tab-n">{counts[t.key]}</span>
                  </button>
                ))}
              </div>
            )}

            {shown.length > 0 ? (
              <div className="cl-grid">
                {shown.map((c) => (
                  <ClassCard
                    key={`${c.role}-${c.id}`}
                    c={c}
                    teaching={c.role === "teacher"}
                  />
                ))}
              </div>
            ) : (
              <p className="cl-empty">
                {total === 0
                  ? "No classes yet. Create one to start teaching, or join one with a code from your teacher."
                  : tab === "teaching"
                    ? "You are not teaching any classes yet."
                    : "You have not joined a class yet."}
              </p>
            )}
          </div>

          <ClassRail activity={data.activity || []} upcoming={data.upcoming || []} />
        </div>
      )}
    </div>
  );
}
