import './TutorFitFields.css'

function toggle(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

/** Shared by the tutor application and editor so the same choices are stored
 * and shown everywhere a tutor describes who they teach. */
export default function TutorFitFields({ value, options, onChange, required = false }) {
  const bestFor = value.teaches_levels || []
  const focus = value.specialties || []
  const languages = value.teaching_languages || []

  return (
    <div className="tff">
      <div className="tff-field">
        <span className="tff-label">Best for{required && <i aria-hidden="true">*</i>}</span>
        <small>Which student levels do you feel most comfortable teaching?</small>
        <div className="tff-chips">
          {(options.teaches_levels || []).map((item) => (
            <button key={item} type="button" className={bestFor.includes(item) ? 'on' : ''}
              aria-pressed={bestFor.includes(item)} onClick={() => onChange({ teaches_levels: toggle(bestFor, item) })}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="tff-field">
        <span className="tff-label">Teaching focus{required && <i aria-hidden="true">*</i>}</span>
        <small>What types of Chinese lessons do you specialize in?</small>
        <div className="tff-chips">
          {(options.specialties || []).map((item) => (
            <button key={item.key} type="button" className={focus.includes(item.key) ? 'on' : ''}
              aria-pressed={focus.includes(item.key)} onClick={() => onChange({ specialties: toggle(focus, item.key) })}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tff-field">
        <span className="tff-label">Teaches in{required && <i aria-hidden="true">*</i>}</span>
        <small>Which languages can you use to explain lessons to students?</small>
        <div className="tff-chips">
          {(options.teaching_languages || []).map((item) => (
            <button key={item} type="button" className={languages.includes(item) ? 'on' : ''}
              aria-pressed={languages.includes(item)} onClick={() => onChange({ teaching_languages: toggle(languages, item) })}>
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
