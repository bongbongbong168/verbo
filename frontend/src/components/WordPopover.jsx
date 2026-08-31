import './WordPopover.css'

// Anchored to a caller-supplied DOMRect and positioned `fixed`, so no ancestor
// with overflow can clip it — the native `title` tooltip this replaces had no
// such problem, but also no styling, and a ~1s delay before showing.
const WIDTH = 264
const GAP = 10
const EDGE = 12

export default function WordPopover({ word, rect, saved }) {
  if (!word || !rect) return null

  /* TWO COORDINATE SPACES, and mixing them is what put this card on top of the
     word it describes.

     `#root` carries `zoom: var(--app-scale)`. `getBoundingClientRect()` returns
     VIEWPORT pixels — already multiplied by that zoom. But this card lives
     inside `#root`, so a `top` written here is a CSS length the browser scales
     by the zoom AGAIN. At 1.1 that put the card ~67px lower and ~69px right of
     where the maths intended: `top: 670.8` rendered at 737.9, past the word's
     own top edge at 680.8.

     Dividing the measured rect by the scale converts it into the space this
     element is actually positioned in. Same family as the `--app-vh` fix —
     `zoom` and viewport-derived measurements do not share a unit. */
  const scale =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--app-scale')
    ) || 1

  const top0 = rect.top / scale
  const bottom0 = rect.bottom / scale
  const left0 = rect.left / scale
  const width0 = rect.width / scale
  // window.innerWidth is viewport px too, so the clamp has to be converted with
  // everything else or a word near the right edge clamps to the wrong number.
  const viewportW = window.innerWidth / scale

  // Clamp horizontally so a word near either edge still shows its whole card.
  const centre = left0 + width0 / 2
  const half = WIDTH / 2
  const left = Math.min(Math.max(centre, EDGE + half), viewportW - EDGE - half)

  // Flip below the word when there is not enough room above it. Compared in
  // viewport px because that is what the space above the word is measured in.
  const below = rect.top < 160
  const top = below ? bottom0 + GAP : top0 - GAP

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
