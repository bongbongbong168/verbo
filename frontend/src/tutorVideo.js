const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** Return a YouTube ID from the public/unlisted formats tutors can paste. */
export function youtubeVideoId(value) {
  const raw = (value || '').trim()
  if (!raw) return null

  let url
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)
  let id = null

  if (host === 'youtu.be') id = parts[0]
  if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (parts[0] === 'watch') id = url.searchParams.get('v')
    if (['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1]
  }

  return YOUTUBE_ID.test(id || '') ? id : null
}

export function tutorVideoId(tutor) {
  const stored = tutor?.video_id
  return YOUTUBE_ID.test(stored || '') ? stored : youtubeVideoId(tutor?.video_url)
}

export function youtubeWatchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`
}

export function youtubeEmbedUrl(id, { preview = false, autoplay = false } = {}) {
  const params = new URLSearchParams({
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
  })

  if (preview || autoplay) {
    params.set('autoplay', '1')
  }

  if (preview) {
    params.set('mute', '1')
    params.set('controls', '0')
  }

  return `https://www.youtube-nocookie.com/embed/${id}?${params}`
}
