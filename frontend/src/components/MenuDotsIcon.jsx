/**
 * The ⋮ overflow-menu mark.
 *
 * Shared because it had ALREADY drifted: `Scan.jsx` and `TutorProfileDetail.jsx`
 * each declared their own copy and the two disagreed on `aria-hidden` — the same
 * story as `SectionToggle`, `EditDrawer`, `ArticleCover` and `ReaderSwitch`.
 *
 * `aria-hidden` is the correct half of that disagreement: every button this sits
 * inside already carries an `aria-label` naming the row, so an unhidden glyph
 * only adds noise for a screen reader. Sized by the button, like `NavIcon`.
 */
export default function MenuDotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  )
}
