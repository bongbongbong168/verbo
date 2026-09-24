import { useEffect, useRef, useState } from 'react'
import { tutorVideoId, youtubeEmbedUrl } from '../tutorVideo'
import './TutorMedia.css'

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.875 6.5v11c0 .8.9 1.3 1.6.9l8.2-5.5c.6-.4.6-1.4 0-1.8L8.475 5.6c-.7-.4-1.6.1-1.6.9z" />
    </svg>
  )
}

/**
 * Photo-first tutor media. A YouTube iframe is created only after a deliberate
 * hover delay or a press on its Intro control, and one browser event closes
 * any other preview before it loads.
 */
export default function TutorMedia({
  tutor,
  className = '',
  previewOnHover = true,
  priority = false,
  variant = 'card',
  showIntro = true,
}) {
  const instance = useRef(`tutor-media-${Math.random().toString(36).slice(2)}`)
  const timer = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const videoId = tutorVideoId(tutor)
  const photo = tutor?.photo_url
  const name = tutor?.user?.name || tutor?.name || 'Tutor'

  function stopPreview() {
    window.clearTimeout(timer.current)
    timer.current = null
    setPlaying(false)
  }

  function startPreview() {
    if (!videoId) return
    window.dispatchEvent(new CustomEvent('verbo:tutor-video-preview', { detail: instance.current }))
    setPlaying(true)
  }

  useEffect(() => {
    function closeOther(event) {
      if (event.detail !== instance.current) stopPreview()
    }
    window.addEventListener('verbo:tutor-video-preview', closeOther)
    return () => {
      window.removeEventListener('verbo:tutor-video-preview', closeOther)
      window.clearTimeout(timer.current)
    }
  }, [])

  function handleEnter() {
    if (!previewOnHover || !videoId || !window.matchMedia('(hover: hover)').matches) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(startPreview, 700)
  }

  function handleLeave() {
    if (previewOnHover) stopPreview()
  }

  function handlePlay(event) {
    event.preventDefault()
    event.stopPropagation()
    startPreview()
  }

  return (
    <span
      className={`tm tm-${variant} ${className}`.trim()}
      data-tone={Number(tutor?.id) % 5}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {playing && videoId ? (
        <iframe
          className="tm-player"
          src={youtubeEmbedUrl(videoId, { preview: previewOnHover, autoplay: true })}
          title={`${name} introduction`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          onError={stopPreview}
        />
      ) : photo && !imageFailed ? (
        <img
          src={photo}
          alt={name}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="tm-mark" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
      )}
      {showIntro && videoId && !playing && (
        <button type="button" className="tm-intro" onClick={handlePlay} aria-label={`Play ${name}'s introduction`}>
          <PlayIcon /> <span>Intro</span>
        </button>
      )}
    </span>
  )
}
