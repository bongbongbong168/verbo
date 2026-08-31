import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import "./LearningPreferences.css";

/* Which fields take one value and which take several. The option LISTS come
   from the server so this file never carries its own copy — a hard-coded list
   here is how it drifts from what the validator will actually accept. */
const SINGLE = [
  { key: "chinese_level", label: "Chinese level" },
  { key: "hsk_level", label: "HSK level", hint: "Optional" },
  // Collected during onboarding; editable here because a study routine is the
  // preference most likely to change once someone has actually tried to keep it.
  { key: "daily_goal", label: "Daily study goal" },
  { key: "study_time", label: "When you study", hint: "Optional" },
];

const MULTI = [
  { key: "goals", label: "Learning goals" },
  { key: "focus", label: "Learning focus" },
  { key: "interests", label: "Interests" },
  { key: "styles", label: "Preferred formats" },
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
 * The learning preferences that drive article recommendations.
 *
 * Everything here is chips rather than dropdowns: these are short, closed lists
 * and a reader picks several from most of them, which a multi-select handles
 * badly and a set of toggles handles obviously.
 */
export default function LearningPreferences() {
  const { token } = useAuth();
  const [options, setOptions] = useState(null);
  const [values, setValues] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getLearningPreferences(token)
      .then((data) => {
        setOptions(data.options);
        if (data.preferences) setValues({ ...EMPTY, ...data.preferences });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  function toggleMulti(key, value) {
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

  function pickSingle(key, value) {
    // Clicking the selected one clears it — otherwise a single-choice field can
    // never be un-answered once touched.
    setValues((v) => ({ ...v, [key]: v[key] === value ? "" : value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.saveLearningPreferences(token, values);
      setFlash("Preferences saved — your recommendations will use them.");
      setTimeout(() => setFlash(null), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="lp-note">Loading preferences…</p>;
  if (!options)
    return <p className="lp-note">{error || "Preferences are unavailable."}</p>;

  const chosen =
    (values.goals?.length || 0) +
    (values.focus?.length || 0) +
    (values.interests?.length || 0) +
    (values.styles?.length || 0) +
    (values.chinese_level ? 1 : 0) +
    (values.hsk_level ? 1 : 0) +
    (values.daily_goal ? 1 : 0) +
    (values.study_time ? 1 : 0);

  return (
    <form className="lp" onSubmit={save}>
      <p className="lp-intro">
        These shape what appears under <strong>Recommended for You</strong>.
        Nothing here is required — the more you pick, the closer the match.
      </p>

      {SINGLE.map((f) => (
        <fieldset className="lp-field" key={f.key}>
          <legend>
            {f.label}
            {f.hint && <span className="lp-hint">{f.hint}</span>}
          </legend>
          <div className="lp-chips">
            {options[f.key].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`lp-chip${values[f.key] === opt ? " on" : ""}`}
                onClick={() => pickSingle(f.key, opt)}
                aria-pressed={values[f.key] === opt}
              >
                {opt}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      {MULTI.map((f) => (
        <fieldset className="lp-field" key={f.key}>
          <legend>
            {f.label}
            <span className="lp-hint">Pick any</span>
          </legend>
          <div className="lp-chips">
            {options[f.key].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`lp-chip${(values[f.key] || []).includes(opt) ? " on" : ""}`}
                onClick={() => toggleMulti(f.key, opt)}
                aria-pressed={(values[f.key] || []).includes(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      {error && <p className="lp-error">{error}</p>}
      {flash && <p className="lp-flash">{flash}</p>}

      <div className="lp-foot">
        <button type="submit" className="lp-save" disabled={saving}>
          {saving ? "Saving…" : "Save preferences"}
        </button>
        <span className="lp-count">{chosen} selected</span>
      </div>
    </form>
  );
}
