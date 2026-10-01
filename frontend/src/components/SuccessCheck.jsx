import { useEffect, useRef, useState } from 'react'

/**
 * The animated success tick (the supplied Lottie file), played ONCE and then
 * held on its last frame - the finished green tick.
 *
 * Lottie steps on requestAnimationFrame, which a backgrounded or
 * non-compositing tab never runs, and its frame 0 is EMPTY (the circle draws
 * itself in). So a timer backstop jumps it to the finished frame after the
 * run's length, and reduced motion or any load failure shows the plain drawn
 * tick instead - it can never be left blank. The light player is enough: the
 * file has no expressions or 3D layers.
 */
export default function SuccessCheck({ size = 88 }) {
  const box = useRef(null)
  const [fallback, setFallback] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    if (fallback) return undefined
    let anim
    let backstop
    let live = true
    Promise.all([import('lottie-web/build/player/lottie_light'), import('../assets/checkout/success-check.json')])
      .then(([lottie, data]) => {
        if (!live || !box.current) return
        anim = lottie.default.loadAnimation({
          container: box.current,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          animationData: data.default,
        })
        const last = (data.default.op || 40) - 1
        anim.addEventListener('complete', () => anim.goToAndStop(last, true))
        backstop = setTimeout(() => anim?.goToAndStop(last, true), 1800)
      })
      .catch(() => live && setFallback(true))
    return () => {
      live = false
      clearTimeout(backstop)
      anim?.destroy()
    }
  }, [fallback])

  if (fallback) {
    return (
      <span className="sc-static" style={{ width: size * 0.8, height: size * 0.8 }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </span>
    )
  }

  return <span ref={box} className="sc-anim" style={{ width: size, height: size }} aria-hidden="true" />
}
