import { useEffect, useRef } from 'react'

/**
 * The animated gold Pro crest (user-supplied Lottie, `assets/pro/crown.json`).
 *
 * The player and the file are lazy-loaded, so they cost nothing until a page
 * that shows the crest opens. The light player is enough: the file uses no
 * expressions. Frame 0 is the finished crest, so a tab that never draws a
 * frame, or reduced motion, shows the still badge rather than nothing.
 */
export default function ProCrown({ className = '' }) {
  const box = useRef(null)

  useEffect(() => {
    let anim
    let live = true
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    Promise.all([import('lottie-web/build/player/lottie_light'), import('../assets/pro/crown.json')])
      .then(([lottie, data]) => {
        if (!live || !box.current) return
        anim = lottie.default.loadAnimation({
          container: box.current,
          renderer: 'svg',
          loop: !still,
          autoplay: !still,
          animationData: data.default,
        })
        if (still) anim.goToAndStop(0, true)
      })
      .catch(() => {})

    return () => {
      live = false
      anim?.destroy()
    }
  }, [])

  return <span ref={box} className={className} role="img" aria-label="Verbo Pro" />
}
