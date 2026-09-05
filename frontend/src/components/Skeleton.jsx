import './Skeleton.css'

/**
 * A grey block standing in for content that has not arrived.
 *
 * Hidden from assistive tech: a screen reader announcing six empty boxes is
 * noise. The page that owns the region carries the `aria-busy` instead, so the
 * fact that something is loading is stated once rather than per box.
 */
export default function Skeleton({ className = '', width, height, style, ...rest }) {
  return (
    <div
      className={`sk ${className}`.trim()}
      aria-hidden="true"
      style={{ width, height, ...style }}
      {...rest}
    />
  )
}

/** A run of text lines. `lines` is how many; the last is drawn short. */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="sk sk-text" />
      ))}
    </div>
  )
}

/**
 * `count` copies of a card shape. Used wherever a grid or shelf is about to
 * appear, so the page keeps its height instead of collapsing and then jumping
 * when the data lands.
 */
export function SkeletonCards({ count = 3, className = '', cardClassName = '', mediaHeight = 118 }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`sk-card ${cardClassName}`.trim()}>
          <div className="sk sk-media" style={{ height: mediaHeight }} />
          <div className="sk sk-text" style={{ marginTop: '0.7rem', width: '45%' }} />
          <div className="sk sk-title" style={{ marginTop: '0.5rem', width: '85%' }} />
        </div>
      ))}
    </div>
  )
}
