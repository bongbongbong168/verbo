import './EyeIcon.css'

/**
 * The show/hide mark inside a password field.
 *
 * Replaces a single static PNG that was used for BOTH states. Only the
 * aria-label changed when you pressed it, so a sighted user got no feedback at
 * all — the same eye-with-a-slash sat there whether the password was showing
 * or not. Screen reader users were told the truth; everyone else was not.
 *
 * The icon shows the ACTION, matching the label beside it: a plain eye means
 * "show this", a struck-through eye means "hide it again".
 *
 * On the motion — the slash is drawn or not drawn, never faded or wiped in.
 * That is the whole state, and this codebase's rule is that state must be
 * right at frame 0: a CSS animation only advances while the tab composites,
 * so a slash that animated in would simply be MISSING in a backgrounded tab
 * and the icon would claim the opposite of the truth. The animation is a
 * squeeze on the whole mark, and its keyframes start and end at rest, so a
 * frozen one is indistinguishable from a finished one.
 */
export default function EyeIcon({ shown }) {
  return (
    <svg
      /* Remounts on toggle, which is what replays the animation — a CSS
         animation does not restart on its own when a class changes. */
      key={shown ? 'shown' : 'hidden'}
      className="eye"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.6 12S6.2 5.9 12 5.9 21.4 12 21.4 12 17.8 18.1 12 18.1 2.6 12 2.6 12z" />
      <circle cx="12" cy="12" r="2.9" />
      {/* Static: present or absent, with no transition on it. */}
      {shown && <path className="eye-slash" d="M4.2 4.2l15.6 15.6" />}
    </svg>
  )
}
