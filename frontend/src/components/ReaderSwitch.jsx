import './ReaderSwitch.css'

/**
 * The Pinyin / Translation switch, shared by every page that renders Chinese
 * with optional reading aids — ReadArticle, PodcastEpisode and StudyUnit.
 *
 * Extracted for the reason SectionToggle, EditDrawer and ArticleCover were:
 * hand-rolled copies drift. These had ALREADY drifted before this existed —
 * `.rd-switch` carried a measured cap-band padding correction and `.pe-switch`
 * never got it, so the same control sat a pixel lower on Podcast than on Read.
 * StudyUnit had drifted further still, rendering plain pills with no switch at
 * all. One component, one stylesheet, one appearance.
 *
 * Each page keeps its OWN row container — the same split PageTools uses. The
 * rows genuinely differ (StudyUnit puts a play-conversation button in its row;
 * the others do not), so this owns what a switch looks like and the page owns
 * where the row sits.
 */
export default function ReaderSwitch({ label, on, onChange, disabled = false, title }) {
  return (
    <button
      type="button"
      className={'rs-switch' + (on ? ' on' : '')}
      onClick={onChange}
      disabled={disabled}
      aria-pressed={on}
      title={title}
    >
      <span className="rs-track">
        <span className="rs-knob" />
      </span>
      {label}
    </button>
  )
}
