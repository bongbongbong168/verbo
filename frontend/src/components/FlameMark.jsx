/**
 * The streak flame, shared by the Dashboard's hero badge and the Profile's
 * streak bar.
 *
 * It replaced `assets/dashboard/icon-streak.png`, a 512px raster, and the
 * reason is not sharpness — that file was already oversampled for a 17px
 * mark. It is that A RASTER CANNOT CHANGE COLOUR. Both call sites needed a
 * "no streak yet" state and both had to fake it the same way, with
 * `filter: grayscale(1)`, which does not produce the app's grey: it produces
 * a desaturated orange. As an inline SVG the cold state is a real colour, and
 * the two pages stop carrying two copies of a workaround.
 *
 * Drawn flat and rounded from the supplied illustration — two tones, no
 * gradient, no outline. The reference's face and sparks are deliberately NOT
 * here: this renders at 17px on the Dashboard and 28px on the Profile, where
 * a mouth is three grey pixels and a spark is one. They belong to the
 * illustration, not to the mark.
 *
 * THE INK RUNS EDGE TO EDGE IN THE VIEWBOX, which matters to the call sites.
 * The PNG filled only 75.4% of its square canvas, and `.db-streak-badge`
 * carried a measured `calc(1rem - 2.09px)` left inset to hide that transparent
 * margin. Swapping in artwork that fills its box without removing that
 * correction would pull the flame 2px into the pill's padding — so the inset
 * went back to symmetric when this landed.
 *
 * Colours are eyeballed from the supplied illustration rather than sampled;
 * the file itself was never on disk. They are the mark's own, not palette
 * tokens: Verbo owns lavender and one salmon accent, and neither is a flame.
 *
 * It flickers, floats and throws embers — see FlameMark.css, which also
 * explains why this is the one shape of animation the codebase allows.
 */
import './FlameMark.css'

export default function FlameMark({ className = '', lit = true }) {
  return (
    /* 16x24, not a square. The reference flame is a tall slender teardrop —
       measured off it at roughly 0.65 wide to tall — and the first attempt
       drew it on a 24 square, which came out as a round blob with a dent in
       it. The box is the proportion. */
    <svg
      className={`fm-flame${lit ? ' fm-lit' : ''} ${className}`.trim()}
      viewBox="0 0 16 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Outer: a long tapering point, a notch, then a shorter lick right. */}
      <path
        className="fm-outer"
        d="M7.4 0.4C8.4 2.8 9.5 5.9 9.8 8.2C9.9 9.1 10.8 9.4 11.4 8.8C12 8.2 12.5 7.3 12.7 6.4C14.4 9.1 15.6 12.3 15.6 15.2C15.6 19.9 12.3 23.6 8 23.6C3.7 23.6 0.4 19.9 0.4 15.2C0.4 11 2.4 7 4.2 4.4C5.3 2.8 6.5 1.2 7.4 0.4Z"
        fill={lit ? '#f0911a' : '#cfcbdd'}
      />
      {/* Inner: the same shape again, smaller and sitting low. */}
      <path
        className="fm-inner"
        d="M8.4 9.2C9 10.6 9.6 12.2 9.8 13.3C9.9 13.8 10.4 13.9 10.7 13.6C11 13.3 11.3 12.8 11.4 12.4C12.2 13.7 12.7 15.4 12.7 16.9C12.7 19.7 10.6 21.9 8 21.9C5.4 21.9 3.3 19.7 3.3 16.9C3.3 14.5 4.6 12.3 5.7 11C6.5 10.1 7.7 9.2 8.4 9.2Z"
        fill={lit ? '#ffd21e' : '#e7e3f6'}
      />
      {/* Embers, drawn at NEGATIVE y — above the viewBox, painted only because
          the stylesheet sets `overflow: visible`. Keeping them outside the box
          is what lets them exist at all: the box is the flame, edge to edge,
          and every size the two call sites set is derived from that. Growing
          the viewBox upward to fit them would have shrunk the flame inside the
          same 17px and reintroduced the ink-is-not-the-box correction that
          swapping off the PNG just removed. They clear the badge's own top
          padding at both sizes, so nothing clips them. */}
      {lit && (
        <g className="fm-sparks">
          <rect className="fm-spark fm-spark-a" x="3.6" y="-3.6" width="1.9" height="2.9" rx="0.95" fill="#f0911a" />
          <rect className="fm-spark fm-spark-b" x="11.2" y="-3" width="1.9" height="2.9" rx="0.95" fill="#f0911a" />
          <rect className="fm-spark fm-spark-c" x="9.5" y="-0.6" width="1.7" height="2.6" rx="0.85" fill="#ffd21e" />
        </g>
      )}
    </svg>
  )
}
