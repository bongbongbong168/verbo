/**
 * The like and comment marks, shared by the article action bar and the list
 * cards so the same idea is never drawn two different ways.
 *
 * Both are inline SVG on a 24 grid rather than text glyphs or emoji: `♥` next
 * to `💬` mixed a font character with a colour emoji, so they disagreed on
 * weight, size and colour and neither could follow `currentColor`.
 */

/**
 * A two-lobe heart built from arcs, symmetric about x=12. `filled` swaps
 * between the outline and the solid, which is what carries the liked state.
 */
export function HeartIcon({ filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20.3 4.9 13a4.6 4.6 0 0 1 6.5-6.5l.6.6.6-.6A4.6 4.6 0 0 1 19.1 13z" />
    </svg>
  );
}

/** A rounded speech bubble with a tail on the lower left. */
export function CommentIcon({ filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 11.7a7.7 7.7 0 0 1-11.2 6.9L4 20l1.4-4.6a7.7 7.7 0 1 1 15.1-3.7z" />
    </svg>
  );
}

/** A ribbon bookmark — same stroke weight as the other two. */
export function BookmarkIcon({ filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.8 3.8h10.4a1.3 1.3 0 0 1 1.3 1.3v15.1l-6.5-4.3-6.5 4.3V5.1a1.3 1.3 0 0 1 1.3-1.3z" />
    </svg>
  );
}

/** An arrow leaving a tray — reads as "send this elsewhere". */
export function ShareIcon() {
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
      <path d="M12 15.2V3.8" />
      <path d="m8.3 7.5 3.7-3.7 3.7 3.7" />
      <path d="M5 13.4v5.3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-5.3" />
    </svg>
  );
}
