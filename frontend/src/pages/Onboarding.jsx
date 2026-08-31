import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/sidebar/logo.png";
import feather from "../assets/signup/feather.png";
import "./Onboarding.css";

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 5 5 9-11" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13M12 5.5 18.5 12 12 18.5" />
    </svg>
  );
}

/* The five questions, in the spec's order (§3 steps 2-6). `title` is the
   spec's own copy from §11 — it is deliberately a question, not a label, so
   each screen reads as someone asking rather than a form demanding.

   `key` names the step for the stepper rail; `fields` are the preference keys
   it writes, which is what lets the summary say what was answered without
   restating the mapping. */
const STEPS = [
  {
    key: "level",
    nav: "Your level",
    navHint: "Where you are now",
    title: "What is your current Chinese level?",
    lede: "Rough is fine — this only decides where we start you off, and you can change it whenever.",
    fields: ["chinese_level", "hsk_level"],
  },
  {
    key: "goals",
    nav: "Your goals",
    navHint: "Why you are learning",
    title: "What are you learning Chinese for?",
    lede: "Pick as many as apply.",
    fields: ["goals"],
  },
  {
    key: "focus",
    nav: "Your focus",
    navHint: "What to improve",
    title: "What would you like to improve most?",
    lede: "These get the most weight when Verbo picks something for you.",
    fields: ["focus"],
  },
  {
    key: "content",
    nav: "Your content",
    navHint: "How you like to learn",
    title: "What kind of content do you enjoy learning with?",
    lede: "And, if you like, the topics you would rather read about.",
    fields: ["styles", "interests"],
  },
  {
    key: "routine",
    nav: "Your routine",
    navHint: "How much, and when",
    title: "How much time can you realistically study each day?",
    lede: "An honest number beats an ambitious one — this is only used to size what we suggest.",
    fields: ["daily_goal", "study_time"],
  },
];

const EMPTY = {
  chinese_level: "",
  hsk_level: "",
  goals: [],
  focus: [],
  interests: [],
  styles: [],
  daily_goal: "",
  study_time: "",
};

/**
 * Onboarding — the five short questions after sign-up.
 *
 * Combined from the supplied references, and each part is taken for a reason:
 *
 *  - The DARK PANEL is Register's, so sign-up and onboarding read as one
 *    continuous flow rather than two apps. It carries the vertical stepper from
 *    the second reference: named steps with ticks, which tells you how much is
 *    left without a second menu competing with the card.
 *  - The CARD is the fourth and fifth references: a segmented progress bar and
 *    a step counter at the top, one question per screen, and Back / Skip for
 *    now / Continue along the bottom.
 *  - CHIPS come from the first reference, including the ✕ on a selected chip —
 *    it says the thing is removable without needing to be discovered.
 *
 * Everything is optional. §12 of the spec asks for "Skip for now" on every
 * question and that is honoured literally: a user can reach the end having
 * answered nothing, and the summary says so rather than pretending.
 *
 * Nothing is saved until the end. Five separate writes would leave a
 * half-filled profile behind for anyone who closed the tab midway, and the
 * answers are worth nothing individually — they are read together or not at
 * all.
 */
export default function Onboarding() {
  const { token, user, setUser } = useAuth();
  const navigate = useNavigate();

  const [options, setOptions] = useState(null);
  const [values, setValues] = useState(EMPTY);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Someone who already went through this should not be able to get back in by
  // typing the URL — there is nothing here for them that Settings does not do.
  useEffect(() => {
    if (user?.onboarded_at) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api
      .getLearningPreferences(token)
      .then((data) => {
        setOptions(data.options);
        // Pre-fill if anything was already set — arriving here with answers is
        // unusual but losing them would be worse.
        if (data.preferences) setValues({ ...EMPTY, ...data.preferences });
      })
      .catch((err) => setError(err.message));
  }, [token]);

  function toggle(key, value) {
    setValues((v) => {
      const list = v[key] || [];
      return {
        ...v,
        [key]: list.includes(value)
          ? list.filter((x) => x !== value)
          : [...list, value],
      };
    });
  }

  function pick(key, value) {
    setValues((v) => {
      // Clicking the chosen one clears it, or a single-choice answer could
      // never be un-answered once touched.
      const next = { ...v, [key]: v[key] === value ? "" : value };

      // The HSK question is only shown for a known level, so answering it and
      // then going back to "Not sure" would hide the field while keeping its
      // value — saving "I don't know my level" alongside "HSK 4". Clear it
      // with the thing that revealed it.
      if (key === "chinese_level" && (!next.chinese_level || next.chinese_level === "Not sure")) {
        next.hsk_level = "";
      }

      return next;
    });
  }

  const last = step === STEPS.length;

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await api.saveLearningPreferences(token, values);
      const updated = await api.completeOnboarding(token);
      // Straight into context so the redirect guard sees the new flag rather
      // than bouncing back here.
      if (setUser) setUser(updated);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!options) {
    return (
      <div className="ob">
        <div className="ob-card ob-card-loading">
          <p className="ob-lede">{error || "Getting things ready…"}</p>
        </div>
      </div>
    );
  }

  const current = STEPS[step];

  /* How many answers this step has, so the footer can say Continue vs Skip
     without each step restating it. */
  const answered = (current?.fields || []).reduce((n, f) => {
    const v = values[f];
    return n + (Array.isArray(v) ? v.length : v ? 1 : 0);
  }, 0);

  return (
    <div className="ob">
      {/* ---- left: identity + where you are ---- */}
      <aside className="ob-side">
        <img className="ob-logo" src={logo} alt="Verbo" />
        <img className="ob-feather" src={feather} alt="" aria-hidden="true" />

        <div className="ob-side-body">
          <p className="ob-side-kicker">Setting up</p>
          <h1 className="ob-side-title">
            Let&rsquo;s make Verbo yours
          </h1>

          <ol className="ob-steps">
            {STEPS.map((s, i) => (
              <li
                className={
                  "ob-step" +
                  (i < step ? " done" : "") +
                  (i === step ? " here" : "")
                }
                key={s.key}
              >
                <span className="ob-step-mark" aria-hidden="true">
                  {i < step ? <CheckIcon /> : i + 1}
                </span>
                <span className="ob-step-text">
                  <span className="ob-step-name">{s.nav}</span>
                  <span className="ob-step-hint">{s.navHint}</span>
                </span>
              </li>
            ))}
          </ol>

          <p className="ob-side-foot">
            Every answer is optional, and all of them stay editable in Settings.
          </p>
        </div>
      </aside>

      {/* ---- right: one question at a time ---- */}
      <main className="ob-main">
        <div className="ob-card">
          {/* Segmented rather than one sliding bar: five questions, five
              segments, so "how much is left" is countable at a glance. The
              fill is a STATIC class per segment, never a transition — a bar
              that only fills while frames arrive would read as stuck. */}
          <div className="ob-progress" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span
                className={"ob-seg" + (i <= step - (last ? 0 : 1) ? " on" : "")}
                key={s.key}
              />
            ))}
          </div>

          <p className="ob-count">
            {last ? "All done" : `Step ${step + 1} of ${STEPS.length}`}
          </p>

          {/* Keyed on the step so the content re-mounts and the entrance plays
              again. Transform-only, so a tab that never composites still shows
              a fully visible, fully usable screen. */}
          <div className="ob-body" key={last ? "summary" : current.key}>
            {last ? (
              <Summary values={values} />
            ) : (
              <>
                <h2 className="ob-title">{current.title}</h2>
                <p className="ob-lede">{current.lede}</p>

                {current.key === "level" && (
                  <>
                    <Rows
                      options={options.chinese_level}
                      value={values.chinese_level}
                      onPick={(v) => pick("chinese_level", v)}
                    />
                    {/* Only offered once a level is chosen, and never for
                        "Not sure" — asking someone who does not know their
                        level for their HSK band is asking the same question
                        twice in a harder way. */}
                    {values.chinese_level &&
                      values.chinese_level !== "Not sure" && (
                        <Group label="Do you know your HSK level?" hint="Optional">
                          <Chips
                            options={options.hsk_level}
                            selected={
                              values.hsk_level ? [values.hsk_level] : []
                            }
                            onToggle={(v) => pick("hsk_level", v)}
                          />
                        </Group>
                      )}
                  </>
                )}

                {current.key === "goals" && (
                  <Chips
                    options={options.goals}
                    selected={values.goals}
                    onToggle={(v) => toggle("goals", v)}
                  />
                )}

                {current.key === "focus" && (
                  <Chips
                    options={options.focus}
                    selected={values.focus}
                    onToggle={(v) => toggle("focus", v)}
                  />
                )}

                {current.key === "content" && (
                  <>
                    <Chips
                      options={options.styles}
                      selected={values.styles}
                      onToggle={(v) => toggle("styles", v)}
                    />
                    <Group label="Topics you enjoy" hint="Optional">
                      <Chips
                        options={options.interests}
                        selected={values.interests}
                        onToggle={(v) => toggle("interests", v)}
                      />
                    </Group>
                  </>
                )}

                {current.key === "routine" && (
                  <>
                    <Rows
                      options={options.daily_goal}
                      value={values.daily_goal}
                      onPick={(v) => pick("daily_goal", v)}
                    />
                    <Group label="When do you usually study?" hint="Optional">
                      <Chips
                        options={options.study_time}
                        selected={
                          values.study_time ? [values.study_time] : []
                        }
                        onToggle={(v) => pick("study_time", v)}
                      />
                    </Group>
                  </>
                )}
              </>
            )}
          </div>

          {error && <p className="ob-error">{error}</p>}

          <div className="ob-foot">
            <button
              type="button"
              className="ob-back"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || busy}
            >
              ← Back
            </button>

            {!last && (
              <button
                type="button"
                className="ob-skip"
                onClick={() => setStep((s) => s + 1)}
              >
                Skip for now
              </button>
            )}

            <button
              type="button"
              className="ob-next"
              onClick={() => (last ? finish() : setStep((s) => s + 1))}
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : last
                  ? "Start learning"
                  : answered
                    ? "Continue"
                    : "Continue"}
              <ArrowIcon />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---- pieces ---- */

function Group({ label, hint, children }) {
  return (
    <div className="ob-group">
      <p className="ob-group-label">
        {label}
        {hint && <span className="ob-group-hint">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

/* Single choice, as full-width rows: a short closed list where exactly one
   answer is right reads better stacked than wrapped into chips. */
function Rows({ options, value, onPick }) {
  return (
    <div className="ob-rows">
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          className={"ob-row" + (value === opt ? " on" : "")}
          onClick={() => onPick(opt)}
          aria-pressed={value === opt}
        >
          <span>{opt}</span>
          <span className="ob-row-mark" aria-hidden="true">
            {value === opt && <CheckIcon />}
          </span>
        </button>
      ))}
    </div>
  );
}

/* Multi choice. A selected chip carries a ✕ so it says it can be taken off
   again — the reference's one genuinely instructive detail. */
function Chips({ options, selected, onToggle }) {
  return (
    <div className="ob-chips">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            type="button"
            key={opt}
            className={"ob-chip" + (on ? " on" : "")}
            onClick={() => onToggle(opt)}
            aria-pressed={on}
          >
            {opt}
            {on && <CloseIcon />}
          </button>
        );
      })}
    </div>
  );
}

/* The spec's §6 summary, built only from what was actually answered. A skipped
   question is named as skipped rather than filled with a guess. */
function Summary({ values }) {
  const lines = [
    {
      label: "Level",
      value: [values.chinese_level, values.hsk_level].filter(Boolean).join(" · "),
    },
    { label: "Goals", value: (values.goals || []).join(", ") },
    { label: "Focus", value: (values.focus || []).join(", ") },
    {
      label: "Preferred learning",
      value: [...(values.styles || []), ...(values.interests || [])].join(", "),
    },
    {
      label: "Daily goal",
      value: [values.daily_goal, values.study_time].filter(Boolean).join(" · "),
    },
  ];

  const anything = lines.some((l) => l.value);

  return (
    <>
      <span className="ob-done-mark" aria-hidden="true">
        <CheckIcon />
      </span>
      <h2 className="ob-title">Your learning profile is ready.</h2>
      <p className="ob-lede">
        {anything
          ? "Verbo will use this to pick the reading, listening and tutors it puts in front of you."
          : "You skipped the questions, which is fine — Verbo will show you everything until you tell it more."}
      </p>

      <dl className="ob-summary">
        {lines.map((l) => (
          <div key={l.label}>
            <dt>{l.label}</dt>
            <dd className={l.value ? "" : "empty"}>
              {l.value || "Skipped — set it any time in Settings"}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
