/**
 * The five places a word can come from, drawn rather than typed.
 *
 * These replaced colour emoji (🎧 📖 📚 📷 ✍️). Emoji are a different visual
 * language from everything else in Verbo: they cannot follow `currentColor`, so
 * they stayed full-colour while the line around them was muted grey, and they
 * render as a different typeface on every operating system.
 *
 * All five sit on the same 24 grid at `strokeWidth 1.7` with `currentColor` as
 * the stroke — identical to `ArticleIcons` and the sidebar's `NavIcon`, so the
 * app has ONE icon vocabulary rather than three. The shapes themselves are the
 * app's own: they are the per-feature marks that were orphaned when the sidebar
 * moved to sections, so a scan here looks like a scan everywhere else.
 */
function Mark({ children }) {
  return (
    <svg
      className="src-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* Microphone and arc — the same mark the Podcast rail item used. */
export function PodcastMark() {
  return (
    <Mark>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="17.5" x2="12" y2="21" />
    </Mark>
  );
}

/* A page with a folded corner and two lines of text. */
export function ReadMark() {
  return (
    <Mark>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v3h3" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </Mark>
  );
}

/* The graduation cap, matching how Classes and Study are marked elsewhere. */
export function StudyMark() {
  return (
    <Mark>
      <path d="M2.5 8.5 12 4l9.5 4.5L12 13z" />
      <path d="M6.5 10.7v4.6c0 1.4 2.5 2.7 5.5 2.7s5.5-1.3 5.5-2.7v-4.6" />
      <path d="M21.5 8.5v5" />
    </Mark>
  );
}

/* The scan frame — four corners and the sweep line, as on the Scan page. */
export function ScanMark() {
  return (
    <Mark>
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <line x1="4.5" y1="12" x2="19.5" y2="12" />
    </Mark>
  );
}

/* A pen over a page: a word you typed in yourself. */
export function ManualMark() {
  return (
    <Mark>
      <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.4-9.4z" />
    </Mark>
  );
}

/** Keyed by `source_module`, so a card picks its own mark. */
export const SOURCE_MARKS = {
  podcast: PodcastMark,
  read: ReadMark,
  study: StudyMark,
  scan: ScanMark,
  manual: ManualMark,
};
