import './WordPopover.css'

// Anchored to a caller-supplied DOMRect and positioned `fixed`, so no ancestor
// with overflow can clip it — the native `title` tooltip this replaces had no
// such problem, but also no styling, and a ~1s delay before showing.
const WIDTH = 264
const GAP = 10
const EDGE = 12

export default function WordPopover({ word, rect, saved }) {
  if (!word || !rect) return null

  // Clamp horizontally so a word near either edge still shows its whole card.
  const centre = rect.left + rect.width / 2
  const half = WIDTH / 2
  const left = Math.min(Math.max(centre, EDGE + half), window.innerWidth - EDGE - half)

  // Flip below the word when there is not enough room above it.
  const below = rect.top < 160
  const top = below ? rect.bottom + GAP : rect.top - GAP

  return (
    <div
      className={'wp' + (below ? ' wp-below' : '')}
      style={{ left, top, width: WIDTH, '--wp-arrow': `${centre - left}px` }}
      role="tooltip"
    >
      <div className="wp-head">
        <span className="wp-hanzi">{word.text}</span>
        {word.pinyin && <span className="wp-pinyin">{word.pinyin}</span>}
      </div>

      {word.translation ? (
        <p className="wp-translation">{word.translation}</p>
      ) : (
        <p className="wp-translation wp-none">No dictionary entry</p>
      )}

      <div className="wp-foot">
        {/* "Saved" — not "in your flashcards". The caller only knows what was
            saved during this page view, so anything stronger would be a claim
            it cannot back up for words saved on an earlier visit. */}
        {saved ? (
          <span className="wp-saved">✓ Saved</span>
        ) : (
          <span>
            <kbd>Alt</kbd>
            <kbd>1</kbd> to save
          </span>
        )}
      </div>
    </div>
  )
}
