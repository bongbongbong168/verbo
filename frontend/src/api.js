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
  // Paginated: resolves to {data, current_page, last_page, total, ...}
  getFlashcards: (token, page = 1) => request(`/flashcards?page=${page}`, { token }),
  addFlashcard: (token, flashcard) =>
    request('/flashcards', { method: 'POST', body: flashcard, token }),
  deleteFlashcard: (token, id) =>
    request(`/flashcards/${id}`, { method: 'DELETE', token }),
  getScans: (token) => request('/scans', { token }),
  getScan: (token, id) => request(`/scans/${id}`, { token }),
  scan: (token, file) => {
    const formData = new FormData()
    formData.append('image', file)
    return requestMultipart('/scans', formData, token)
  },
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
  saveTutorProfile: (token, { bio, subjects, hourly_rate, languages_spoken, availability, photo }) => {
    const formData = new FormData()
    if (bio != null) formData.append('bio', bio)
    if (subjects != null) formData.append('subjects', subjects)
    if (hourly_rate != null) formData.append('hourly_rate', hourly_rate)
    if (languages_spoken != null) formData.append('languages_spoken', languages_spoken)
    if (availability != null) formData.append('availability', availability)
    if (photo) formData.append('photo', photo)
    return requestMultipart('/tutor-profile', formData, token)
  },
  getBookings: (token) => request('/bookings', { token }),
  createBooking: (token, booking) =>
    request('/bookings', { method: 'POST', body: booking, token }),
  addLesson: (token, lesson) =>
    request('/tutor-profile/lessons', { method: 'POST', body: lesson, token }),
  deleteLesson: (token, id) =>
    request(`/tutor-profile/lessons/${id}`, { method: 'DELETE', token }),
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
  // Multipart because a level can carry a cover image for the carousel.
  createStudyLevel: (token, { title, description, category, image }) => {
    const formData = new FormData()
    formData.append('title', title)
    if (description != null) formData.append('description', description)
    if (category) formData.append('category', category)
    if (image) formData.append('image', image)
    return requestMultipart('/study-levels', formData, token)
  },
  createStudyUnit: (token, levelId, unit) =>
    request(`/study-levels/${levelId}/units`, { method: 'POST', body: unit, token }),
  getStudyUnit: (token, id) => request(`/study-units/${id}`, { token }),
  updateStudyUnit: (token, id, unit) =>
    request(`/study-units/${id}`, { method: 'PUT', body: unit, token }),
  addStudyVocabulary: (token, unitId, word) =>
    request(`/study-units/${unitId}/vocabulary`, { method: 'POST', body: word, token }),
  deleteStudyVocabulary: (token, id) =>
    request(`/study-vocabulary/${id}`, { method: 'DELETE', token }),
  addStudyGrammarPoint: (token, unitId, point) =>
    request(`/study-units/${unitId}/grammar`, { method: 'POST', body: point, token }),
  deleteStudyGrammarPoint: (token, id) =>
    request(`/study-grammar/${id}`, { method: 'DELETE', token }),
  addStudyQuizQuestion: (token, unitId, question) =>
    request(`/study-units/${unitId}/quiz`, { method: 'POST', body: question, token }),
  deleteStudyQuizQuestion: (token, id) =>
    request(`/study-quiz/${id}`, { method: 'DELETE', token }),
  checkStudyQuizAnswer: (token, id, selected) =>
    request(`/study-quiz/${id}/check`, { method: 'POST', body: { selected }, token }),
  getQuote: (token) => request('/quote', { token }),
  saveQuote: (token, quote) => request('/quote', { method: 'POST', body: quote, token }),
}
