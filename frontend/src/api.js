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

    /* 413 is the one status whose body cannot be relied on. php rejects an
       oversized request before the app runs, and with display_errors on (the
       dev server's default) it prepends a raw HTML warning to the JSON — so
       `res.json()` fails, `data` is null, and the real message is lost behind
       a generic "Request failed". Say what actually happened instead. */
    if (res.status === 413 && !data?.message) {
      message = 'That file is too large for the server to accept. Try a shorter or more compressed file.'
    }

    // Preserve the status so callers can tell an expired session (401)
    // apart from rate limiting (429) or a server fault (5xx).
    const error = new Error(message)
    error.status = res.status
    // The parsed body too, for the failures that carry structured detail
    // rather than only a sentence — a booking refused for a schedule clash
    // returns which lesson is in the way, and the caller cannot recover that
    // from the message text.
    error.data = data
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

function articleFormData({ title, type, category, hsk_level, body, body_en, image }) {
  const formData = new FormData()
  formData.append('title', title)
  formData.append('type', type)
  formData.append('body', body)
  if (body_en != null) formData.append('body_en', body_en)
  /* `category` is the TOPIC the Read page shelves by, and it was missing here:
     the controller has always accepted it, but nothing sent it, so an article
     published through the UI arrived unfiled and could only reach a shelf by
     being edited afterwards. Sent even when empty, or clearing a topic back to
     "Unfiled" would be impossible — the same reason podcastFormData always
     sends transcript_en. */
  if (category !== undefined) formData.append('category', category ?? '')
  if (hsk_level !== undefined) formData.append('hsk_level', hsk_level ?? '')
  if (image) formData.append('image', image)
  return formData
}

function studyLevelFormData({
  title,
  description,
  level_label,
  accent_color,
  category,
  image,
  banner,
}) {
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

function podcastFormData({ title, transcript, transcriptEn, level, category, host, bio, audio, image }) {
  const formData = new FormData()
  formData.append('title', title)
  formData.append('transcript', transcript)
  // Always sent, even empty — omitting it would make clearing a translation
  // impossible, since the server only sees the fields that arrive.
  formData.append('transcript_en', transcriptEn ?? '')
  if (level) formData.append('level', level)
  // Same rule as transcript_en: sent even when empty, so a topic can be
  // cleared back to Unfiled rather than being stuck once set.
  if (category !== undefined) formData.append('category', category ?? '')
  if (host !== undefined) formData.append('host', host ?? '')
  if (bio) formData.append('bio', bio)
  if (audio) formData.append('audio', audio)
  if (image) formData.append('image', image)
  return formData
}

export const api = {
  register: (name, email, password) =>
    request('/register', { method: 'POST', body: { name, email, password } }),
  login: (email, password) => request('/login', { method: 'POST', body: { email, password } }),

  /* Forgotten passwords — a six-digit code, not a link. `forgotPassword`
     answers the same way whether or not the address has an account (see
     PasswordResetController), so the page must not try to infer anything
     from the response. */
  forgotPassword: (email) => request('/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (body) => request('/reset-password', { method: 'POST', body }),
  // The signed-in route, for Settings. Takes no email: the server reads it
  // from the session so it cannot be aimed at someone else's account.
  sendMyResetLink: (token) => request('/user/password/reset-link', { method: 'POST', token }),

  /* Confirming the address after sign-up. Both read the email off the
     session, so neither takes one. */
  sendVerifyCode: (token) => request('/email/send-code', { method: 'POST', token }),
  verifyEmail: (token, code) => request('/email/verify', { method: 'POST', token, body: { code } }),
  /* Sign in or sign up with Google. `credential` is the ID token Google
     Identity Services hands the browser; the server verifies it and answers
     with the same {user, token} shape login does, so the caller stores it
     exactly the same way. */
  googleSignIn: (credential) =>
    request('/auth/google', { method: 'POST', body: { credential } }),
  logout: (token) => request('/logout', { method: 'POST', token }),
  me: (token) => request('/user', { token }),
  // Settings page.
  getUserStats: (token) => request('/user/stats', { token }),
  // Profile page + the header popover: name, derived level, counts.
  getUserOverview: (token) => request('/user/overview', { token }),
  // Profile picture. Multipart, so it goes through requestMultipart.
  uploadAvatar: (token, file) => {
    const formData = new FormData()
    formData.append('avatar', file)
    return requestMultipart('/user/avatar', formData, token)
  },
  removeAvatar: (token) => request('/user/avatar', { method: 'DELETE', token }),
  /* In-app notifications. getNotifications with a `limit` returns the compact
     {data, unread} shape the bell dropdown wants; without one it pages. */
  getNotifications: (token, { limit, unread, page } = {}) => {
    const qs = new URLSearchParams()
    if (limit) qs.set('limit', limit)
    if (unread) qs.set('unread', '1')
    if (page) qs.set('page', page)
    const q = qs.toString()
    return request(`/notifications${q ? `?${q}` : ''}`, { token })
  },
  getUnreadNotifications: (token) => request('/notifications/unread', { token }),
  markNotificationRead: (token, id) =>
    request(`/notifications/${id}/read`, { method: 'POST', token }),
  markAllNotificationsRead: (token) =>
    request('/notifications/read-all', { method: 'POST', token }),
  deleteNotification: (token, id) => request(`/notifications/${id}`, { method: 'DELETE', token }),
  /* Empties the list in one request rather than one per row — a full list is 50
     notifications, and they share the 300/min bucket with everything else. */
  clearAllNotifications: (token) => request('/notifications', { method: 'DELETE', token }),
  updateProfile: (token, fields) =>
    request('/user/profile', { method: 'PUT', body: fields, token }),
  updatePassword: (token, fields) =>
    request('/user/password', { method: 'PUT', body: fields, token }),
  revokeOtherSessions: (token) =>
    request('/user/sessions/revoke-others', { method: 'POST', token }),
  // Paginated: resolves to {data, current_page, last_page, total, ...}
  // `filters` is {source, bucket, q} — all optional, and an empty value is
  // dropped rather than sent as "", which the server would reject as an
  // invalid enum instead of treating as "no filter".
  getFlashcards: (token, page = 1, filters = {}) => {
    const qs = new URLSearchParams({ page })
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v)
    return request(`/flashcards?${qs}`, { token })
  },
  getFlashcardStats: (token) => request('/flashcards/stats', { token }),
  // One review run's worth of cards, already shuffled server-side.
  getReviewCards: (token, filters = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v)
    return request(`/flashcards/review?${qs}`, { token })
  },
  gradeFlashcard: (token, id, correct) =>
    request(`/flashcards/${id}/grade`, { method: 'POST', body: { correct }, token }),
  addFlashcard: (token, flashcard) =>
    request('/flashcards', { method: 'POST', body: flashcard, token }),
  deleteFlashcard: (token, id) => request(`/flashcards/${id}`, { method: 'DELETE', token }),
  /* Sentences using this word, found across the learner's own articles,
     podcasts, lessons and scans. Fetched only when a word is opened — it runs
     four LIKE scans, so doing it for a whole page of the bank would be most of
     the work thrown away. */
  getFlashcardExamples: (token, id, limit = 3) =>
    request(`/flashcards/${id}/examples?limit=${limit}`, { token }),
  getScans: (token) => request('/scans', { token }),
  getScan: (token, id) => request(`/scans/${id}`, { token }),
  deleteScan: (token, id) => request(`/scans/${id}`, { method: 'DELETE', token }),
  // Public-link sharing. shareScan is idempotent — it returns the existing
  // link rather than rotating it, so a link already sent out keeps working.
  shareScan: (token, id) => request(`/scans/${id}/share`, { method: 'POST', token }),
  unshareScan: (token, id) => request(`/scans/${id}/share`, { method: 'DELETE', token }),
  // No auth argument on purpose: the share token IS the credential.
  getSharedScan: (shareToken) => request(`/shared/scans/${shareToken}`),
  // `scan()` (a plain multipart POST to the same endpoint) was removed: every
  // caller uses scanWithProgress, because an OCR upload without a progress bar
  // looks frozen. The route itself is unchanged.
  //
  // Over XHR so the upload can report byte progress —
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
  createArticle: (token, article) => requestMultipart('/articles', articleFormData(article), token),
  updateArticle: (token, id, article) => {
    const formData = articleFormData(article)
    formData.append('_method', 'PUT')
    return requestMultipart(`/articles/${id}`, formData, token)
  },
  deleteArticle: (token, id) => request(`/articles/${id}`, { method: 'DELETE', token }),
  /* Read-section interactions. Each toggle resolves to the article's fresh
     counts plus this viewer's own state, so the buttons never guess. */
  toggleArticleLike: (token, id) => request(`/articles/${id}/like`, { method: 'POST', token }),
  toggleArticleBookmark: (token, id) =>
    request(`/articles/${id}/bookmark`, { method: 'POST', token }),
  recordArticleShare: (token, id, platform) =>
    request(`/articles/${id}/share`, { method: 'POST', body: { platform }, token }),
  recordArticleView: (token, id) => request(`/articles/${id}/view`, { method: 'POST', token }),
  getBookmarks: (token) => request('/bookmarks', { token }),
  getArticleComments: (token, id) => request(`/articles/${id}/comments`, { token }),
  addArticleComment: (token, id, content, parentId = null) =>
    request(`/articles/${id}/comments`, {
      method: 'POST',
      body: { content, parent_id: parentId },
      token,
    }),
  updateArticleComment: (token, commentId, content) =>
    request(`/article-comments/${commentId}`, { method: 'PUT', body: { content }, token }),
  deleteArticleComment: (token, commentId) =>
    request(`/article-comments/${commentId}`, { method: 'DELETE', token }),
  // `exclude` keeps the article you are reading out of its own list.
  /* The Read banner's four slides in one request — a recommendation, the
     last article opened, this week's reading counts. One call rather than
     three, against a shared 300/min bucket. */
  getReadHighlights: (token) => request("/articles/highlights", { token }),
  getRecommendedArticles: (token, { limit = 3, exclude } = {}) => {
    const qs = new URLSearchParams({ limit })
    if (exclude) qs.set('exclude', exclude)
    return request(`/articles/recommended?${qs}`, { token })
  },
  /* ---- Tutor portal ----
     A classroom is not a course: no price, no checkout. Students get in with a
     code the teacher reads out. */
  getClasses: (token) => request('/classes', { token }),
  createClass: (token, fields) => request('/classes', { method: 'POST', body: fields, token }),
  joinClass: (token, code) => request('/classes/join', { method: 'POST', body: { code }, token }),
  getClass: (token, id) => request(`/classes/${id}`, { token }),
  updateClass: (token, id, fields) =>
    request(`/classes/${id}`, { method: 'PUT', body: fields, token }),
  deleteClass: (token, id) => request(`/classes/${id}`, { method: 'DELETE', token }),
  getClassStudents: (token, id) => request(`/classes/${id}/students`, { token }),
  removeClassMember: (token, id, userId) =>
    request(`/classes/${id}/members/${userId}`, { method: 'DELETE', token }),
  // Multipart: an item can carry attachments.
  createClassItem: (token, classId, fields) => {
    const fd = new FormData()
    fd.append('type', fields.type)
    fd.append('title', fields.title)
    if (fields.description) fd.append('description', fields.description)
    if (fields.due_at) fd.append('due_at', fields.due_at)
    if (fields.points !== '' && fields.points != null) fd.append('points', fields.points)
    fd.append('allow_late', fields.allow_late ? '1' : '0')
    ;(fields.files || []).forEach((f) => fd.append('files[]', f))
    return requestMultipart(`/classes/${classId}/items`, fd, token)
  },
  deleteClassItem: (token, itemId) =>
    request(`/class-items/${itemId}`, { method: 'DELETE', token }),
  getItemSubmissions: (token, itemId) =>
    request(`/class-items/${itemId}/submissions`, { token }),
  submitClassWork: (token, itemId, { note, files }) => {
    const fd = new FormData()
    if (note) fd.append('note', note)
    ;(files || []).forEach((f) => fd.append('files[]', f))
    return requestMultipart(`/class-items/${itemId}/submit`, fd, token)
  },
  gradeSubmission: (token, submissionId, { score, feedback }) =>
    request(`/submissions/${submissionId}/grade`, {
      method: 'POST',
      body: { score, feedback },
      token,
    }),
  // Files are private; these need the bearer token, so they are fetched as
  // blobs rather than linked directly.
  classFileUrl: (id) => `${BASE_URL}/class-files/${id}`,
  submissionFileUrl: (id) => `${BASE_URL}/submission-files/${id}`,
  /* Fetches a private file and hands back an object URL to RENDER rather than
     save. The route needs a bearer token, so an <img src> or <iframe src>
     cannot reach it directly — the same reason MessageAttachment works this
     way. The caller owns revoking the URL; an unrevoked one pins the blob in
     memory for the life of the tab. */
  viewPrivateFile: async (token, url) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('Could not open that file.')
    const blob = await res.blob()
    return { blob, objectUrl: URL.createObjectURL(blob) }
  },
  downloadPrivateFile: async (token, url, name) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('Could not download that file.')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = name || 'file'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Object URLs pin the blob in memory until revoked.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  },
  // Stamps users.onboarded_at and returns the updated user. Called once at the
  // end of onboarding — by "Start learning" and by skipping alike, since
  // skipping still answers "have you been asked?".
  completeOnboarding: (token) =>
    request('/user/onboarded', { method: 'POST', token }),
  getLearningPreferences: (token) => request('/learning-preferences', { token }),
  saveLearningPreferences: (token, prefs) =>
    request('/learning-preferences', { method: 'POST', body: prefs, token }),
  getTutors: (token) => request('/tutors', { token }),
  getTutor: (token, id) => request(`/tutors/${id}`, { token }),
  /* Returns {profile, options} — NOT the profile itself. `profile` is null for
     someone who has never applied, which is a different fact from a rejected
     application, and `options` carries the validator's own lists so the form
     cannot drift from what the server accepts. */
  getMyTutorProfile: (token) => request('/tutor-profile', { token }),
  /* The tutor application. Same endpoint submits and resubmits: someone asked
     for more information edits and posts again, which returns them to the
     queue. Multipart, because the photo goes with it. */
  applyAsTutor: (token, fields) => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) {
      if (v === null || v === undefined || v === '') continue
      // teaches_levels is an array; FormData needs one entry per value or PHP
      // receives a comma-joined string and the `array` rule rejects it.
      if (Array.isArray(v)) v.forEach((item) => fd.append(`${k}[]`, item))
      else fd.append(k, v)
    }
    return requestMultipart('/tutor-profile', fd, token)
  },
  uploadTutorCredential: (token, file, label) => {
    const fd = new FormData()
    fd.append('file', file)
    if (label) fd.append('label', label)
    return requestMultipart('/tutor-credentials', fd, token)
  },
  deleteTutorCredential: (token, id) =>
    request(`/tutor-credentials/${id}`, { method: 'DELETE', token }),
  // Admin review queue.
  getTutorApplications: (token, status = 'awaiting') =>
    request(`/tutor-applications?status=${encodeURIComponent(status)}`, { token }),
  getTutorApplicationCounts: (token) => request('/tutor-applications/counts', { token }),
  getTutorApplication: (token, id) => request(`/tutor-applications/${id}`, { token }),
  decideTutorApplication: (token, id, decision, note) =>
    request(`/tutor-applications/${id}/decide`, {
      method: 'POST',
      body: { decision, note: note || null },
      token,
    }),
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
  saveTutorProfile: (
    token,
    { bio, subjects, hourly_rate, languages_spoken, availability, photo, video_url },
  ) => {
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
  // A tutor's weekly recurring hours — the source bookable slots are generated
  // from. Distinct from `tutor_profiles.availability`, which is free text shown
  // on the card and creates no slots at all.
  getTutorAvailability: (token, profileId) =>
    request(`/tutors/${profileId}/availability`, { token }),
  // Replaces the whole week in one call, so a failure cannot leave a
  // half-applied schedule.
  saveTutorAvailability: (token, profileId, body) =>
    request(`/tutors/${profileId}/availability`, { method: 'POST', body, token }),
  // Group courses: a fixed schedule sold whole, the counterpart to bookings.
  // `getCourses()` (the whole catalogue) went with the Group Courses tab on
  // Find Tutor. Courses are now only reached through a tutor, so the per-tutor
  // call below is the only list anyone asks for. `GET /courses` still exists.
  getCourse: (token, id) => request(`/courses/${id}`, { token }),
  getTutorCourses: (token, profileId) => request(`/tutors/${profileId}/courses`, { token }),
  addCourse: (token, profileId, course) =>
    request(`/tutors/${profileId}/courses`, { method: 'POST', body: course, token }),
  deleteCourse: (token, id) => request(`/courses/${id}`, { method: 'DELETE', token }),
  // Creates a *held* enrolment; payment flips it, same seam as a booking.
  enrollInCourse: (token, id) => request(`/courses/${id}/enroll`, { method: 'POST', token }),
  confirmEnrollment: (token, id) =>
    request(`/enrollments/${id}/confirm`, { method: 'POST', token }),
  cancelEnrollment: (token, id) => request(`/enrollments/${id}/cancel`, { method: 'POST', token }),
  getMyEnrollments: (token) => request('/enrollments', { token }),
  /* Messaging. Context-based — there is no user directory and no way to start
     a thread with someone you have no tutoring relationship with. */
  getConversations: (token) => request('/conversations', { token }),
  // Drives the dot on the top-right Messages button. Returns { unread: n }.
  getUnreadMessages: (token) => request('/conversations/unread', { token }),
  getConversation: (token, id) => request(`/conversations/${id}`, { token }),
  // No `getUnreadCount()`: the unread badge is driven by the notification
  // bell's own poll, so nothing ever asked conversations for a count.
  // `GET /conversations/unread` is still routed if that changes.
  // Multipart, because a message can carry a file. Body or file — a picture on
  // its own is a perfectly good message.
  sendMessage: (token, id, body, file) => {
    const formData = new FormData()
    if (body) formData.append('body', body)
    if (file) formData.append('file', file)
    return requestMultipart(`/conversations/${id}/messages`, formData, token)
  },
  /* Attachments live on the private disk and stream through an authorised
     route, so they cannot go straight into an <img src>. Fetched as a blob with
     the token attached, then handed to the page as an object URL. */
  /* Unsend one of your own messages. It goes for both sides — see the
     controller for why there is no "delete for me". */
  deleteMessage: (token, id) => request(`/messages/${id}`, { method: 'DELETE', token }),
  /* A BLOB FETCH THAT CANNOT HANG FOREVER.
     This request had no timeout, so a stalled one simply never settled — and
     the deployed API stalls for seconds on roughly one request in three. The
     picture's reserved placeholder then sat there as a blank tinted box with
     nothing to resolve it and no error to report, which is exactly the "it
     does not show until I refresh" symptom: reloading is the only thing that
     starts a second request.

     One retry, because the stall is a one-in-three event rather than a broken
     file: a second attempt usually lands. The abort is what makes the retry
     possible at all — without it the first request is still holding on. */
  fetchAttachment: async (token, messageId, { timeoutMs = 12000, attempt = 0 } = {}) => {
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), timeoutMs)
    try {
      const res = await fetch(`${BASE_URL}/messages/${messageId}/attachment`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: stop.signal,
      })
      if (!res.ok) throw new Error('Could not load that attachment.')
      return URL.createObjectURL(await res.blob())
    } catch (err) {
      /* Retry a stall, never a refusal: a 403 or a 404 will say the same thing
         twice and the second wait is spent for nothing. */
      if (attempt === 0 && err.name === 'AbortError') {
        return api.fetchAttachment(token, messageId, { timeoutMs, attempt: 1 })
      }
      throw err.name === 'AbortError'
        ? new Error('That attachment took too long to load.')
        : err
    } finally {
      clearTimeout(timer)
    }
  },
  // Idempotent: returns the existing thread or opens it. Never a second one.
  openTutorConversation: (token, profileId) =>
    request(`/tutors/${profileId}/conversation`, { method: 'POST', token }),
  openCourseConversation: (token, courseId) =>
    request(`/courses/${courseId}/conversation`, { method: 'POST', token }),
  /* The dashboard's "My Learning": upcoming private lessons and group classes
     merged into one time-ordered list. Read-only — it owns no table, it just
     answers "what am I learning and when do I show up?" across both shapes. */
  getMyLearning: (token, limit = 3) =>
    request(`/my-learning?limit=${limit}`, { token }),
  getBookings: (token) => request('/bookings', { token }),
  // Bookable datetimes, generated on read from the tutor's weekly hours.
  // `lessonId` matters: length comes from the lesson, so a 60-minute lesson
  // returns only the starts where a full hour is actually free.
  getTutorSlots: (token, profileId, { days = 14, lessonId } = {}) =>
    request(`/tutors/${profileId}/slots?days=${days}${lessonId ? `&lesson=${lessonId}` : ''}`, {
      token,
    }),
  // Creates a *hold*, not a confirmed lesson — it lapses after 15 minutes.
  createBooking: (token, booking) => request('/bookings', { method: 'POST', body: booking, token }),
  /* Stripe. `paymentConfig` says whether payments are live at all — with no
     keys in .env the checkout falls back to its demo button rather than
     mounting a card field that could never work. `paymentIntent` returns a
     client secret for ONE purchase; the amount is decided server-side, never
     sent from here. Fulfilment happens on Stripe's webhook, not on the
     browser's return, so nothing here confirms anything. */
  paymentConfig: () => request('/payments/config'),
  paymentIntent: (token, kind, id) =>
    request('/payments/intent', { method: 'POST', token, body: { kind, id } }),

  /* The DEMO settle path, kept for when Stripe is switched off. It now 422s
     once keys are configured — otherwise a student could POST here and take a
     free lesson. */
  payBooking: (token, id) => request(`/bookings/${id}/pay`, { method: 'POST', token }),
  // Tutor-only: accepting the request is what confirms it.
  confirmBooking: (token, id) => request(`/bookings/${id}/confirm`, { method: 'POST', token }),
  cancelBooking: (token, id) => request(`/bookings/${id}/cancel`, { method: 'POST', token }),
  // Tutor-only, and a distinct status from cancel: the student needs to tell
  // "you called this off" apart from "the tutor wasn't available".
  declineBooking: (token, id, reason) =>
    request(`/bookings/${id}/decline`, { method: 'POST', body: { reason }, token }),
  // Clears a settled booking from YOUR list only — the row survives for the
  // other side, so tidying your history never erases theirs.
  hideBooking: (token, id) => request(`/bookings/${id}`, { method: 'DELETE', token }),
  hideEnrollment: (token, id) => request(`/enrollments/${id}`, { method: 'DELETE', token }),
  // Clears the whole Past list for one side in a single call, rather than one
  // request per row against the shared 300/min bucket.
  clearPastBookings: (token, role) =>
    request('/bookings/clear-past', { method: 'POST', body: { role }, token }),
  addLesson: (token, profileId, lesson) =>
    request(`/tutors/${profileId}/lessons`, { method: 'POST', body: lesson, token }),
  deleteLesson: (token, id) => request(`/tutor-lessons/${id}`, { method: 'DELETE', token }),
  // Reviews. saveReview is an upsert — posting again edits the one you left.
  saveReview: (token, profileId, review) =>
    request(`/tutors/${profileId}/reviews`, { method: 'POST', body: review, token }),
  deleteReview: (token, id) => request(`/tutor-reviews/${id}`, { method: 'DELETE', token }),
  addResumeEntry: (token, profileId, entry) =>
    request(`/tutors/${profileId}/resume`, { method: 'POST', body: entry, token }),
  deleteResumeEntry: (token, id) => request(`/tutor-resume/${id}`, { method: 'DELETE', token }),
  getPodcasts: (token) => request('/podcasts', { token }),
  getPodcast: (token, id) => request(`/podcasts/${id}`, { token }),
  createPodcast: (token, podcast) => requestMultipart('/podcasts', podcastFormData(podcast), token),
  updatePodcast: (token, id, podcast) => {
    const formData = podcastFormData(podcast)
    formData.append('_method', 'PUT')
    return requestMultipart(`/podcasts/${id}`, formData, token)
  },
  deletePodcast: (token, id) => request(`/podcasts/${id}`, { method: 'DELETE', token }),
  /* Where the listener got to. Called on a timer while audio plays, so it is
     an upsert of one row rather than a log — order between calls does not
     matter and a dropped one costs at most a few seconds of accuracy. */
  savePodcastProgress: (token, id, positionSeconds, durationSeconds) =>
    request(`/podcasts/${id}/progress`, {
      method: 'PUT',
      body: { position_seconds: Math.round(positionSeconds), duration_seconds: durationSeconds ? Math.round(durationSeconds) : null },
      token,
    }),
  /* The word-timed transcript. Its own call rather than part of the episode
     payload: it can run to hundreds of KB and is only needed once one exists. */
  getTimedTranscript: (token, id) => request(`/podcasts/${id}/timed-transcript`, { token }),
  uploadTimedTranscript: (token, id, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestMultipart(`/podcasts/${id}/timed-transcript`, formData, token)
  },
  /* Hand corrections: [{index, text}], an empty text deleting that line. */
  editTimedTranscript: (token, id, lines) =>
    request(`/podcasts/${id}/timed-transcript`, { method: 'PATCH', body: { lines }, token }),
  deleteTimedTranscript: (token, id) =>
    request(`/podcasts/${id}/timed-transcript`, { method: 'DELETE', token }),
  getContinueListening: (token, limit = 3) =>
    request(`/podcasts/continue?limit=${limit}`, { token }),
  /* The Daily Use shelves in one call — recommended, popular and
     grouped topics are slices of the same small set. */
  getDailyUse: (token) => request('/study-levels/daily', { token }),
  getStudyLevels: (token) => request('/study-levels', { token }),
  getStudyLevel: (token, id) => request(`/study-levels/${id}`, { token }),
  // Multipart: a level carries a carousel cover plus a module-page banner.
  createStudyLevel: (token, level) =>
    requestMultipart('/study-levels', studyLevelFormData(level), token),
  /* Restored — a topic's cover picture is now settable from its own page.
     `_method=PUT` because a browser cannot send a real multipart PUT, the same
     spoofing `updateArticle` uses. The endpoint requires `title` on every save
     even when only the picture changed, so the caller resends what the topic
     already has. */
  updateStudyLevel: (token, id, level) => {
    const form = studyLevelFormData(level)
    form.append('_method', 'PUT')
    return requestMultipart(`/study-levels/${id}`, form, token)
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
  deleteStudyText: (token, id) => request(`/study-texts/${id}`, { method: 'DELETE', token }),
  addStudyTextLine: (token, textId, line) =>
    request(`/study-texts/${textId}/lines`, { method: 'POST', body: line, token }),
  deleteStudyTextLine: (token, id) =>
    request(`/study-text-lines/${id}`, { method: 'DELETE', token }),
  addStudyVocabulary: (token, unitId, word) =>
    request(`/study-units/${unitId}/vocabulary`, { method: 'POST', body: word, token }),
  deleteStudyVocabulary: (token, id) =>
    request(`/study-vocabulary/${id}`, { method: 'DELETE', token }),
  /* Meaning, character breakdown and real example sentences for one word.
     Its own request, made when the panel opens — finding examples means LIKE
     scans across four tables, so doing it for every word on every page load
     would be almost entirely wasted work. */
  explainVocabulary: (token, id) => request(`/study-vocabulary/${id}/explain`, { token }),
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
  deleteStudyQuizQuestion: (token, id) => request(`/study-quiz/${id}`, { method: 'DELETE', token }),
  checkStudyQuizAnswer: (token, id, selected) =>
    request(`/study-quiz/${id}/check`, { method: 'POST', body: { selected }, token }),
  // "Pick up where you left off". recordView is fire-and-forget from the unit
  // and episode pages; getRecentViews returns them newest first, mixed across
  // modules, and an empty array when there is no history — an ordinary state,
  // not an error.
  recordView: (token, type, id) =>
    request('/recent-views', { method: 'POST', body: { type, id }, token }),
  getRecentViews: (token, limit = 3) => request(`/recent-views?limit=${limit}`, { token }),
  // Time tracking for the Dashboard's activity chart. recordActivity carries no
  // duration on purpose — the server measures the gap between beats, so the
  // client cannot inflate the total.
  recordActivity: (token) => request('/activity/heartbeat', { method: 'POST', token }),
  getActivitySummary: (token, days = 7) => request(`/activity/summary?days=${days}`, { token }),

  /* The Dashboard's plan card: which level, how much of it is left, and
     today's three goals. One call because it is one card — see
     LearningPlanController. Nothing is stored server-side; it is all counted,
     so this is always current and never needs invalidating on a write. */
  getLearningPlan: (token) => request('/learning-plan', { token }),
  getQuote: (token) => request('/quote', { token }),
  saveQuote: (token, quote) => request('/quote', { method: 'POST', body: quote, token }),

  /* The floating practice assistant. Asked once on mount so an install with
     no GEMINI_API_KEY renders no button at all, rather than one that errors. */
  getPracticeChatStatus: (token) => request('/practice-chat/status', { token }),
  /* The whole (trimmed) conversation goes up each turn — nothing is stored
     server-side, so the widget's own state IS the thread. */
  sendPracticeChat: (token, body) =>
    request('/practice-chat', { method: 'POST', body, token }),

  /* Saved cards.
     `addPaymentMethod` takes the brand, the last four digits and the expiry —
     NEVER a card number. The browser reads the number only long enough to work
     those out and then forgets it; there is no column for one on the server and
     no parameter for one here. */
  getPaymentMethods: (token) => request('/payment-methods', { token }),
  addPaymentMethod: (token, body) =>
    request('/payment-methods', { method: 'POST', body, token }),
  setDefaultPaymentMethod: (token, id) =>
    request(`/payment-methods/${id}/default`, { method: 'POST', token }),
  deletePaymentMethod: (token, id) =>
    request(`/payment-methods/${id}`, { method: 'DELETE', token }),
}
