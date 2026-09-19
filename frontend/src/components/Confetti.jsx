import { useEffect, useRef, useState } from 'react'
import './Confetti.css'

/**
 * One burst of confetti over the whole screen, then gone.
 *
 * The animation is the user-supplied Lottie file (assets/quiz/confetti.json, a
 * 5s After Effects export). It uses expressions and 3D layers, which is why
 * this is the full `lottie-web` player rather than the light build - the light
 * one drops expressions, and the pieces would stop spinning.
 *
 * Loaded on demand: the player and the file are only fetched when a quiz is
 * finished, so no other page pays for them.
 *
 * Ornament only, per the app's frozen-compositor rule: it carries no state and
 * covers nothing clickable (pointer-events: none). A timer removes it even if
 * the tab never draws a frame and `complete` never fires, and reduced motion
 * skips it entirely.
 */
export default function Confetti() {
  const boxRef = useRef(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDone(true)
      return undefined
    }
    let anim = null
    let alive = true
    Promise.all([import('lottie-web'), import('../assets/quiz/confetti.json')])
      .then(([lottie, data]) => {
        if (!alive || !boxRef.current) return
        anim = lottie.default.loadAnimation({
          container: boxRef.current,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          animationData: data.default,
          // Fill the screen: the file is 16:9, a phone is tall.
          rendererSettings: { preserveAspectRatio: 'xMidYMid slice' },
        })
        anim.addEventListener('complete', () => alive && setDone(true))
      })
      .catch(() => alive && setDone(true))
    // 126 frames at 25fps is ~5s; this is the backstop.
    const timer = setTimeout(() => alive && setDone(true), 6500)
    return () => {
      alive = false
      clearTimeout(timer)
      anim?.destroy()
    }
  }, [])

  if (done) return null
  return <div className="cf" ref={boxRef} aria-hidden="true" />
}
