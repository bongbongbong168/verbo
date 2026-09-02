import { useEffect, useId, useRef, useState } from 'react'
import './FilterSelect.css'

/**
 * A filter dropdown that matches the app instead of the operating system.
 *
 * A native `<select>` cannot be styled where it matters: the OPEN list is drawn
 * by the OS, so it arrived as a white box with a hard blue highlight and system
 * type, in the middle of a page built on lavender pills and Hellix. The pill
 * itself was already styled; the moment you clicked it the illusion broke.
 *
 * So the trigger is a button and the list is ours. Everything a native select
 * gives away for free is rebuilt deliberately:
 *
 * - `role="listbox"` with `aria-selected`, so it is announced as a choice
 * - full keyboard control: Enter/Space/Down to open, Up/Down to move, Enter to
 *   pick, Escape to close, Tab to leave
 * - closes on outside pointerdown, and returns focus to the trigger on Escape
 *   so the keyboard is never stranded inside a closed menu
 *
 * The menu is shown by mounting it, never by fading it in — a panel whose
 * visibility depends on animation frames is invisible when those frames never
 * arrive, which is how the account popover once came up blank. The only motion
 * is a transform-only nudge that is fully opaque at frame 0.
 */
export default function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  /** Label for the "no filter" row. The row always exists — a filter you
   *  cannot clear is a trap. */
  anyLabel = 'Any',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  /* Which row the keyboard is on. Kept apart from `value`: moving through the
     list must not filter the page under you, only Enter commits. */
  const [cursor, setCursor] = useState(-1)
  const root = useRef(null)
  const trigger = useRef(null)
  const listId = useId()

  const rows = [{ value: '', label: anyLabel }, ...options.map((o) => ({ value: o, label: o }))]
  const selected = rows.find((r) => r.value === value)

  useEffect(() => {
    if (!open) return undefined

    /* pointerdown, not click: a click listener fires after the button's own
       handler has already toggled the menu back open, so the menu could never
       be closed by clicking the trigger a second time. */
    const away = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  function commit(v) {
    onChange(v)
    setOpen(false)
    trigger.current?.focus()
  }

  function onKeyDown(e) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
        setCursor(Math.max(0, rows.findIndex((r) => r.value === value)))
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(rows.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (rows[cursor]) commit(rows[cursor].value)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className={'dd ' + className} ref={root}>
      <button
        type="button"
        ref={trigger}
        className={'dd-btn' + (open ? ' open' : '') + (value ? ' set' : '')}
        onClick={() => {
          setOpen((v) => !v)
          setCursor(Math.max(0, rows.findIndex((r) => r.value === value)))
        }}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
      >
        <span className="dd-value">{selected?.value ? selected.label : placeholder}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          className="dd-menu"
          id={listId}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onKeyDown}
        >
          {rows.map((r, i) => (
            <li key={r.value || '__any__'}>
              <button
                type="button"
                role="option"
                aria-selected={r.value === value}
                className={
                  'dd-opt' +
                  (r.value === value ? ' selected' : '') +
                  (i === cursor ? ' cursor' : '')
                }
                /* Hovering moves the keyboard cursor too, so the pointer and
                   the keyboard never disagree about which row is live. */
                onMouseEnter={() => setCursor(i)}
                onClick={() => commit(r.value)}
              >
                <span className="dd-opt-label">{r.label}</span>
                {r.value === value && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
