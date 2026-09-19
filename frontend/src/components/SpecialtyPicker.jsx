import './SpecialtyPicker.css'

/**
 * Pick teaching specialties, and which one is the main.
 *
 * Shared by the tutor application (BecomeTutor) and the edit drawer, so the
 * two cannot drift. The options come from the server (TutorProfile::
 * SPECIALTIES) and are passed in; nothing here keeps its own list.
 *
 * Tap a specialty to add or remove it. Among the chosen ones, the star marks
 * the main - shown under the tutor's name. The first chosen becomes main
 * automatically, and removing the main hands it to the next one, so there
 * is never a chosen set with no main.
 */
export default function SpecialtyPicker({ options, value, main, onChange }) {
  const chosen = value || []

  function toggle(key) {
    const next = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key]
    const nextMain = next.includes(main) ? main : next[0] || null
    onChange(next, nextMain)
  }

  return (
    <ul className="spk">
      {options.map((opt) => {
        const on = chosen.includes(opt.key)
        const isMain = on && main === opt.key
        return (
          <li key={opt.key} className={'spk-item' + (on ? ' spk-on' : '')}>
            <button
              type="button"
              className="spk-pick"
              aria-pressed={on}
              onClick={() => toggle(opt.key)}
            >
              <span className="spk-mark" aria-hidden="true">{opt.emoji}</span>
              <span className="spk-text">
                <span className="spk-label">{opt.label}</span>
                <span className="spk-blurb">{opt.blurb}</span>
              </span>
            </button>
            {on && (
              <button
                type="button"
                className={'spk-main' + (isMain ? ' spk-main-on' : '')}
                aria-pressed={isMain}
                title={isMain ? 'Main specialty' : 'Make this your main specialty'}
                onClick={() => onChange(chosen, opt.key)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
                </svg>
                {isMain ? 'Main' : 'Set main'}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
