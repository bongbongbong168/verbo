const BASE_URL = import.meta.env.VITE_API_URL

async function parseResponse(res) {
  const data = await res.json().catch(() => null)

  if (!res.ok) {
    let message = data?.errors
      ? Object.values(data.errors).flat().join(' ')
      : data?.message || 'Request failed'

    if (res.status === 429) {
      message = 'Too many requests. Please wait a moment and try again.'
    }

    // Preserve the status so callers can tell an expired session (401)
    // apart from rate limiting (429) or a server fault (5xx).
    const error = new Error(message)
    error.status = res.status
    throw error
  }

  return data
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  return parseResponse(res)
}

async function requestMultipart(path, formData, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: formData,
  })

  return parseResponse(res)
}

function articleFormData({ title, type, body, body_en, image }) {
  const formData = new FormData()
  formData.append('title', title)
  formData.append('type', type)
  formData.append('body', body)
  if (body_en != null) formData.append('body_en', body_en)
  if (image) formData.append('image', image)
  return formData
}

function studyLevelFormData({ title, description, level_label, accent_color, category, image, banner }) {
  const formData = new FormData()
  formData.append('title', title)
  if (description != null) formData.append('description', description)
  if (level_label != null) formData.append('level_label', level_label)
  if (accent_color) formData.append('accent_color', accent_color)
  if (category) formData.append('category', category)
  if (image) formData.append('image', image)
  if (banner) formData.append('banner', banner)
  return formData
}

function podcastFormData({ title, transcript, level, bio, audio, image }) {
  const formData = new FormData()
  formData.append('title', title)
  formData.append('transcript', transcript)
  if (level) formData.append('level', level)
  if (bio) formData.append('bio', bio)
  if (audio) formData.append('audio', audio)
  if (image) formData.append('image', image)
  return formData
}

export const api = {
  register: (name, email, password) =>
    request('/register', { method: 'POST', body: { name, email, password } }),
  login: (email, password) =>
    request('/login', { method: 'POST', body: { email, password } }),
  logout: (token) => request('/logout', { method: 'POST', token }),
  me: (token) => request('/user', { token }),
  // Settings page.
  getUserStats: (token) => request('/user/stats', { token }),
  updateProfile: (token, fields) => request('/user/profile', { method: 'PUT', body: fields, token }),
  updatePassword: (token, fields) => request('/user/password', { method: 'PUT', body: fields, token }),
  revokeOtherSessions: (token) =>
    request('/user/sessions/revoke-others', { method: 'POST', token }),
  // Paginated: resolves to {data, current_page, last_page, total, ...}
  getFlashcards: (token, page = 1) => request(`/flashcards?page=${page}`, { token }),
  addFlashcard: (token, flashcard) =>
    request('/flashcards', { method: 'POST', body: flashcard, token }),
  deleteFlashcard: (token, id) =>
    request(`/flashcards/${id}`, { method: 'DELETE', token }),
  getScans: (token) => request('/scans', { token }),
  getScan: (token, id) => request(`/scans/${id}`, { token }),
  deleteScan: (token, id) => request(`/scans/${id}`, { method: 'DELETE', token }),
  // Public-link sharing. shareScan is idempotent — it returns the existing
  // link rather than rotating it, so a link already sent out keeps working.
  shareScan: (token, id) => request(`/scans/${id}/share`, { method: 'POST', token }),
  unshareScan: (token, id) => request(`/scans/${id}/share`, { method: 'DELETE', token }),
  // No auth argument on purpose: the share token IS the credential.
  getSharedScan: (shareToken) => request(`/shared/scans/${shareToken}`),
  scan: (token, file) => {
    const formData = new FormData()
    formData.append('image', file)
    return requestMultipart('/scans', formData, token)
  },
  // Same endpoint, but over XHR so the upload can report byte progress —
  // fetch() has no equivalent of upload.onprogress. onProgress receives a
  // 0..1 fraction; it stops at 1 when the bytes are sent, which is well
  // before OCR finishes on the server.
  scanWithProgress: (token, file, onProgress) =>
    new Promise((resolve, reject) => {
      const formData = new FormData()
      formData.append('image', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE_URL}/scans`)
      xhr.setRequestHeader('Accept', 'application/json')
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
      }

      xhr.onload = () => {
        let body
        try {
          body = JSON.parse(xhr.responseText)
        } catch {
          body = null
        }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(body)

        // Mirror parseResponse: keep the status on the error so a 429 or a
        // 5xx cannot be mistaken for an auth failure and end the session.
        const message =
          xhr.status === 429
            ? 'Too many requests. Please wait a moment and try again.'
            : body?.message || `Request failed with status ${xhr.status}`
        const error = new Error(message)
        error.status = xhr.status
        reject(error)
      }

      xhr.onerror = () => reject(new Error('Network error while uploading.'))
      xhr.send(formData)
    }),
  getArticles: (token) => request('/articles', { token }),
  getArticle: (token, id) => request(`/articles/${id}`, { token }),
  createArticle: (token, article) =>
    requestMultipart('/articles', articleFormData(article), token),
  updateArticle: (token, id, article) => {
    const formData = articleFormData(article)
    formData.append('_method', 'PUT')
    return requestMultipart(`/articles/${id}`, formData, token)
  },
  deleteArticle: (token, id) => request(`/articles/${id}`, { method: 'DELETE', token }),
  getTutors: (token) => request('/tutors', { token }),
  getTutor: (token, id) => request(`/tutors/${id}`, { token }),
  getMyTutorProfile: (token) => request('/tutor-profile', { token }),
  // Admin-only: set the photo on someone else's tutor profile. saveTutorProfile
  // below can only ever touch the caller's own.
  setTutorPhoto: (token, profileId, photo) => {
    const formData = new FormData()
    formData.append('photo', photo)
    return requestMultipart(`/tutors/${profileId}/photo`, formData, token)
  },
  // Everything the edit drawer changes, in one multipart call. Allowed for the
  // profile's own tutor or an admin acting for them — unlike saveTutorProfile
  // below, which can only ever reach the caller's own profile.
  updateTutorProfile: (token, profileId, fields) => {
    const formData = new FormData()
    Object.entries(fields).forEach(([key, value]) => {
      if (value != null) formData.append(key, value)
    })
    return requestMultipart(`/tutors/${profileId}/profile`, formData, token)
  },
  saveTutorProfile: (token, { bio, subjects, hourly_rate, languages_spoken, availability, photo, video_url }) => {
    const formData = new FormData()
    if (bio != null) formData.append('bio', bio)
    if (subjects != null) formData.append('subjects', subjects)
    if (hourly_rate != null) formData.append('hourly_rate', hourly_rate)
    if (languages_spoken != null) formData.append('languages_spoken', languages_spoken)
    if (availability != null) formData.append('availability', availability)
    if (photo) formData.append('photo', photo)
    if (video_url != null) formData.append('video_url', video_url)
    return requestMultipart('/tutor-profile', formData, token)
  },
  getBookings: (token) => request('/bookings', { token }),
  createBooking: (token, booking) =>
    request('/bookings', { method: 'POST', body: booking, token }),
  addLesson: (token, profileId, lesson) =>
    request(`/tutors/${profileId}/lessons`, { method: 'POST', body: lesson, token }),
  deleteLesson: (token, id) =>
    request(`/tutor-lessons/${id}`, { method: 'DELETE', token }),
  addResumeEntry: (token, profileId, entry) =>
    request(`/tutors/${profileId}/resume`, { method: 'POST', body: entry, token }),
  deleteResumeEntry: (token, id) =>
    request(`/tutor-resume/${id}`, { method: 'DELETE', token }),
  getPodcasts: (token) => request('/podcasts', { token }),
  getPodcast: (token, id) => request(`/podcasts/${id}`, { token }),
  createPodcast: (token, podcast) =>
    requestMultipart('/podcasts', podcastFormData(podcast), token),
  updatePodcast: (token, id, podcast) => {
    const formData = podcastFormData(podcast)
    formData.append('_method', 'PUT')
    return requestMultipart(`/podcasts/${id}`, formData, token)
  },
  deletePodcast: (token, id) => request(`/podcasts/${id}`, { method: 'DELETE', token }),
  getStudyLevels: (token) => request('/study-levels', { token }),
  getStudyLevel: (token, id) => request(`/study-levels/${id}`, { token }),
  // Multipart: a level carries a carousel cover plus a module-page banner.
  createStudyLevel: (token, level) =>
    requestMultipart('/study-levels', studyLevelFormData(level), token),
  updateStudyLevel: (token, id, level) => {
    const formData = studyLevelFormData(level)
    formData.append('_method', 'PUT')
    return requestMultipart(`/study-levels/${id}`, formData, token)
  },
  createStudyUnit: (token, levelId, unit) =>
    request(`/study-levels/${levelId}/units`, { method: 'POST', body: unit, token }),
  getStudyUnit: (token, id) => request(`/study-units/${id}`, { token }),
  updateStudyUnit: (token, id, unit) =>
    request(`/study-units/${id}`, { method: 'PUT', body: unit, token }),
  addCultureImage: (token, unitId, image) => {
    const formData = new FormData()
    formData.append('image', image)
    return requestMultipart(`/study-units/${unitId}/culture-images`, formData, token)
  },
  deleteCultureImage: (token, id) =>
    request(`/study-culture-images/${id}`, { method: 'DELETE', token }),
  addStudyText: (token, unitId, text) =>
    request(`/study-units/${unitId}/texts`, { method: 'POST', body: text, token }),
  deleteStudyText: (token, id) =>
    request(`/study-texts/${id}`, { method: 'DELETE', token }),
  addStudyTextLine: (token, textId, line) =>
    request(`/study-texts/${textId}/lines`, { method: 'POST', body: line, token }),
  deleteStudyTextLine: (token, id) =>
    request(`/study-text-lines/${id}`, { method: 'DELETE', token }),
  addStudyVocabulary: (token, unitId, word) =>
    request(`/study-units/${unitId}/vocabulary`, { method: 'POST', body: word, token }),
  deleteStudyVocabulary: (token, id) =>
    request(`/study-vocabulary/${id}`, { method: 'DELETE', token }),
  addStudyGrammarPoint: (token, unitId, point) =>
    request(`/study-units/${unitId}/grammar`, { method: 'POST', body: point, token }),
  updateStudyGrammarPoint: (token, id, point) =>
    request(`/study-grammar/${id}`, { method: 'PUT', body: point, token }),
  deleteStudyGrammarPoint: (token, id) =>
    request(`/study-grammar/${id}`, { method: 'DELETE', token }),
  addStudyGrammarExample: (token, pointId, example) =>
    request(`/study-grammar/${pointId}/examples`, { method: 'POST', body: example, token }),
  deleteStudyGrammarExample: (token, id) =>
    request(`/study-grammar-examples/${id}`, { method: 'DELETE', token }),
  addStudyQuizQuestion: (token, unitId, question) =>
    request(`/study-units/${unitId}/quiz`, { method: 'POST', body: question, token }),
  deleteStudyQuizQuestion: (token, id) =>
    request(`/study-quiz/${id}`, { method: 'DELETE', token }),
  checkStudyQuizAnswer: (token, id, selected) =>
    request(`/study-quiz/${id}/check`, { method: 'POST', body: { selected }, token }),
  // "Pick up where you left off". recordStudyUnitView is fire-and-forget from
  // the unit page; getStudyProgress resolves to null when the user has never
  // opened a unit (the endpoint answers 204, not 404 — an empty history is an
  // ordinary state, not an error).
  recordStudyUnitView: (token, unitId) =>
    request(`/study-units/${unitId}/view`, { method: 'POST', token }),
  getStudyProgress: (token) => request('/study-progress/latest', { token }),
  // Time tracking for the Dashboard's activity chart. recordActivity carries no
  // duration on purpose — the server measures the gap between beats, so the
  // client cannot inflate the total.
  recordActivity: (token) => request('/activity/heartbeat', { method: 'POST', token }),
  getActivitySummary: (token, days = 7) => request(`/activity/summary?days=${days}`, { token }),
  getQuote: (token) => request('/quote', { token }),
  saveQuote: (token, quote) => request('/quote', { method: 'POST', body: quote, token }),
}
