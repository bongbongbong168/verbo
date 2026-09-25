import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import EditDrawer from './EditDrawer'
import ImageCropper from './ImageCropper'

/**
 * Publishing and editing a podcast episode, in the shared drawer.
 *
 * One component for both, like ArticleEditDrawer — the create form on Podcast
 * and the edit form on PodcastEpisode took the same fields and were maintained
 * twice.
 *
 * `podcast` absent means create; present means edit. The only real difference
 * between the two is audio: it is REQUIRED to create an episode (the column is
 * NOT NULL) and optional to edit one, where leaving it empty keeps the file
 * already uploaded.
 */

const LEVELS = ['Beginner', 'Intermediate', 'Advanced']

/* Mirrors Podcast::CATEGORIES on the server, which is what the validator
   checks against — a topic typed freehand here would come back a 422. */
const TOPICS = [
  'Everyday Chinese',
  'Culture',
  'Travel',
  'Business',
  'Technology',
  'Society',
]

/* The cover's shape, moved here with the cropper it configures. Left on the
   Podcast page it would have been a constant with nothing reading it, and the
   crop would silently have fallen back to the cropper's own 13/15 default —
   a different frame from the one every existing cover was cut to. */
const COVER_ASPECT = 261 / 150
const COVER_WIDTH = 720

const STATUS_LABELS = {
  not_processed: 'Not processed',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
}

/**
 * The synced-transcript tab. It saves on its own, against its own endpoint,
 * at its own moment - the same reason the tutor drawer's tabs do - so the
 * form's Save button is not shown here.
 *
 * Deepgram is the normal route. JSON import remains available for transcripts
 * prepared elsewhere.
 */
function SyncTab({ podcast, onChange }) {
  const { token } = useAuth()
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [armed, setArmed] = useState(false)
  const disarm = useRef(null)
  /* Hand corrections, keyed by line index, held until "Save lines". Only
     the lines actually changed are sent. */
  const [edits, setEdits] = useState({})
  const [flash, setFlash] = useState(null)

  useEffect(() => {
    let live = true
    api
      .getTimedTranscript(token, podcast.id)
      .then((data) => live && setInfo(data))
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
      clearTimeout(disarm.current)
    }
  }, [token, podcast.id])

  /* A provider may take a moment for a longer recording. Poll only while it
     is working, then stop as soon as it reports completed or failed. */
  useEffect(() => {
    if (info?.status !== 'processing') return undefined

    let live = true
    const timer = setInterval(() => {
      api
        .getTimedTranscript(token, podcast.id)
        .then((data) => {
          if (!live) return
          setInfo(data)
          if (data.status !== 'processing') onChange?.(data)
        })
        .catch((err) => live && setError(err.message))
    }, 2000)

    return () => {
      live = false
      clearInterval(timer)
    }
  }, [info?.status, token, podcast.id, onChange])

  async function upload(file) {
    setBusy(true)
    setError(null)
    try {
      const next = await api.uploadTimedTranscript(token, podcast.id, file)
      setInfo(next)
      onChange?.(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const next = await api.generateTimedTranscript(token, podcast.id)
      setInfo(next)
      onChange?.(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Arms on the first click and acts on the second, disarming on a timer -
  // the pattern every other delete in the app uses.
  async function remove() {
    if (!armed) {
      setArmed(true)
      disarm.current = setTimeout(() => setArmed(false), 4000)
      return
    }
    clearTimeout(disarm.current)
    setArmed(false)
    setBusy(true)
    setError(null)
    try {
      const next = await api.deleteTimedTranscript(token, podcast.id)
      setInfo(next)
      onChange?.(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveLines() {
    const lines = Object.entries(edits).map(([index, text]) => ({ index: Number(index), text }))
    if (!lines.length) return
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      const next = await api.editTimedTranscript(token, podcast.id, lines)
      setInfo(next)
      setEdits({})
      setFlash(`Saved ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`)
      onChange?.(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const status = info?.status || podcast.timed_transcript_status || 'not_processed'
  const done = status === 'completed'
  const changed = Object.keys(edits).length

  return (
    <>
      <div className="ed-field">
        <span>Synced transcript</span>
        <p className="ed-sync-status">
          <strong className={'ed-sync-badge ed-sync-' + status}>{STATUS_LABELS[status] || status}</strong>
          {done && info?.stats && (
            <>
              {' '}
              {info.stats.segments} lines · {info.stats.timed_words} of {info.stats.words} words timed
              {info.processed_at && <> · {new Date(info.processed_at).toLocaleDateString()}</>}
            </>
          )}
        </p>
        {status === 'failed' && info?.error && <p className="ed-sync-error">{info.error}</p>}
      </div>

      <p className="ed-hint">Generate the Chinese transcript from the audio. Verbo adds Pinyin, English, and word timing automatically.</p>

      {!podcast.audio_url && (
        <p className="ed-hint">This episode has no audio yet, so there is nothing to sync to.</p>
      )}

      {podcast.audio_url && <button type="button" className="ed-btn-primary" onClick={generate} disabled={busy}>{busy ? 'Generating…' : done ? 'Generate again' : 'Generate synced transcript'}</button>}
      <details className="ed-advanced-sync">
        <summary>Advanced: import transcript file</summary>
        <label className={'ed-btn-ghost' + (busy ? ' is-busy' : '')}>
          Upload transcript (.json)
          <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { const picked = e.target.files[0]; e.target.value = ''; if (picked) upload(picked) }} />
        </label>
      </details>

      {(done || status === 'failed') && (
        <button type="button" className="ed-btn-ghost" onClick={remove} disabled={busy}>
          {armed ? 'Click again to remove' : 'Remove synced transcript'}
        </button>
      )}

      {error && <p className="ed-sync-error">{error}</p>}

      {done && info?.segments?.length > 0 && (
        <div className="ed-field">
          <span>Lines</span>
          <p className="ed-hint">
            Fix anything Deepgram misheard, or clear a line to remove it. Words you keep stay
            on their original timing; new words are fitted into the gap around them.
          </p>
          <ol className="ed-sync-lines">
            {info.segments.map((seg, i) => {
              const value = edits[i] ?? seg.text
              const dirty = i in edits && edits[i] !== seg.text
              return (
                <li key={i} className={'ed-sync-line' + (dirty ? ' is-dirty' : '')}>
                  <textarea
                    rows={Math.min(4, Math.max(1, Math.ceil(value.length / 28)))}
                    value={value}
                    placeholder="(line will be removed)"
                    onChange={(e) => {
                      const text = e.target.value
                      setFlash(null)
                      setEdits((prev) => {
                        const next = { ...prev }
                        if (text === seg.text) delete next[i]
                        else next[i] = text
                        return next
                      })
                    }}
                  />
                </li>
              )
            })}
          </ol>
          <div className="ed-sync-save">
            <button type="button" className="ed-btn-primary" onClick={saveLines} disabled={busy || !changed}>
              {busy ? 'Saving…' : changed ? `Save ${changed} ${changed === 1 ? 'line' : 'lines'}` : 'Save lines'}
            </button>
            {changed > 0 && (
              <button type="button" className="ed-btn-ghost" onClick={() => setEdits({})} disabled={busy}>
                Undo changes
              </button>
            )}
            {flash && <span className="ed-sync-flash">{flash}</span>}
          </div>
        </div>
      )}
    </>
  )
}

export default function PodcastEditDrawer({ podcast, onSave, onClose, onTimedChange }) {
  const { token } = useAuth()
  const editing = Boolean(podcast)
  /* Sync endpoints need a real episode id. During creation, Generate saves
     the episode record without closing the drawer, then runs transcription
     immediately so uploading audio and syncing it remains one job. */
  const [createdPodcast, setCreatedPodcast] = useState(null)
  const workingPodcast = podcast || createdPodcast

  const [tab, setTab] = useState('Episode')
  const [title, setTitle] = useState(podcast?.title || '')
  const [level, setLevel] = useState(podcast?.level || 'Beginner')
  const [category, setCategory] = useState(podcast?.category || '')
  const [host, setHost] = useState(podcast?.host || '')
  const [bio, setBio] = useState(podcast?.bio || '')
  const [isPremium, setIsPremium] = useState(Boolean(podcast?.is_premium))
  const [transcript, setTranscript] = useState(podcast?.transcript || '')
  const [transcriptEn, setTranscriptEn] = useState(podcast?.transcript_en || '')
  const [translating, setTranslating] = useState(false)
  const [audio, setAudio] = useState(null)
  const [image, setImage] = useState(null)

  /* The cropper runs BEFORE the file becomes the upload, so the framing chosen
     here is what both the list card and the episode page show. */
  const [cropSource, setCropSource] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)

  function values() {
    return {
      title,
      level,
      // Sent even when empty, or a topic could never be cleared back to
      // Unfiled — the rule transcript_en already follows.
      category,
      host,
      bio,
      isPremium,
      transcript,
      // Always sent, even empty, or clearing a translation would be
      // impossible — the rule podcastFormData already follows.
      transcriptEn,
      audio,
      image,
    }
  }

  // Built in an effect, not in render — createObjectURL during render mints a
  // new URL every pass and never frees them.
  useEffect(() => {
    if (!image) {
      setImagePreview(null)
      return
    }
    const url = URL.createObjectURL(image)
    setImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setFlash(null)
    setBusy(true)
    try {
      const saved = await onSave(values(), createdPodcast)
      if (editing) {
        if (saved) setCreatedPodcast(saved)
        setAudio(null)
        setImage(null)
        setFlash('Changes saved')
      } else {
        onClose()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function generateFromAudio() {
    if (!title.trim()) {
      setTab('Episode')
      setError('Add a title before publishing the episode.')
      return
    }
    if (!audio) {
      setTab('Media')
      setError('Choose an audio file before generating the transcript.')
      return
    }

    setError(null)
    setFlash(null)
    setBusy(true)
    let saved = null
    try {
      saved = await onSave(values(), createdPodcast)
      if (!saved?.id) throw new Error('The episode was saved, but Sync could not load it. Close this drawer and open the episode again.')

      const synced = await api.generateTimedTranscript(token, saved.id)
      if (synced.status !== 'completed') {
        /* SyncTab owns failed-state messaging. Mount it with the saved episode
           and avoid repeating the same error in EditDrawer's top banner. */
        setCreatedPodcast({ ...saved, timed_transcript_status: synced.status })
        setAudio(null)
        setImage(null)
        return
      }

      /* Generation writes these same lines onto the episode. Mirror the
         response into the still-open form so Transcript immediately shows
         the result without a second fetch or a stale blank draft. */
      const generatedChinese = (synced.segments || []).map((line) => line.text).filter(Boolean).join('\n')
      const generatedEnglish = (synced.segments || []).map((line) => line.translation).filter(Boolean).join('\n')
      setCreatedPodcast({
        ...saved,
        transcript: generatedChinese,
        transcript_en: generatedEnglish,
        timed_transcript_status: 'completed',
      })
      setTranscript(generatedChinese)
      setTranscriptEn(generatedEnglish)
      setAudio(null)
      setImage(null)
      setFlash('Transcript generated, translated, and synced')
    } catch (err) {
      /* Saving and generation are two server operations. If generation
         fails, keep the successfully-created episode in this drawer so retry
         updates it instead of creating a duplicate. */
      if (saved?.id) {
        setCreatedPodcast(saved)
        setAudio(null)
        setImage(null)
      }
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function translateTranscript() {
    if (!transcript.trim() || translating) return
    setTranslating(true)
    setError(null)
    try {
      const result = await api.translatePodcastTranscript(token, transcript)
      setTranscriptEn(result.translation)
    } catch (err) {
      setError(err.message)
    } finally {
      setTranslating(false)
    }
  }

  return (
    <>
      <EditDrawer
        title={editing ? 'Edit episode' : 'New episode'}
        subtitle={editing ? podcast.title : 'Publish to the Podcast section'}
        tabs={editing ? ['Episode', 'Media', 'Transcript', 'Sync'] : ['Episode', 'Media', 'Transcript']}
        tab={tab}
        onTabChange={setTab}
        onClose={onClose}
        error={error}
        flash={flash}
      >
        <form
          className="ed-form"
          onSubmit={submit}
          /* Once a field changes again, the confirmation must disappear: it
             describes the version on the server, not the new draft. */
          onChange={() => flash && setFlash(null)}
        >
          {tab === 'Episode' && (
            <>
              <label className="ed-field">
                <span>Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </label>

              <div className="ed-row">
                <label className="ed-field ed-narrow">
                  <span>Level</span>
                  <select value={level} onChange={(e) => setLevel(e.target.value)}>
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="ed-field">
                  <span>Topic</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Unfiled</option>
                    {TOPICS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="ed-hint">
                Level is how hard the episode is; topic is what it is about. The Podcast
                page filters on both, so an unfiled episode only turns up under "All
                topics".
              </p>

              <label className="ed-field">
                <span>Host</span>
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="e.g. 陈明月 Chen Mingyue"
                />
              </label>
              <p className="ed-hint">
                Who presents the episode. Left empty, the card falls back to the account
                that uploaded it — which is rarely the name a listener should see.
              </p>

              <label className="ed-field">
                <span>Host bio</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="e.g. Native Mandarin speaker from Chengdu, Sichuan, with 6 years of teaching experience."
                />
              </label>

              <label className="ed-check ed-premium-check">
                <input
                  type="checkbox"
                  checked={isPremium}
                  onChange={(e) => setIsPremium(e.target.checked)}
                />
                <span>
                  Verbo Pro episode
                  <em>Free learners can see the episode details, but playback and transcripts require Pro.</em>
                </span>
              </label>
            </>
          )}

          {tab === 'Transcript' && (
            <>
              <p className="ed-hint">
                Add the transcript yourself here. To create it from a recording,
                use Generate and sync under Media.
              </p>

              <label className="ed-field">
                <span>Chinese transcript</span>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={12}
                />
              </label>
              <p className="ed-hint">
                Paste or write the transcript here. You can provide your own English
                version below or let Verbo translate it.
              </p>

              <label className="ed-field">
                <span>English transcript</span>
                <textarea
                  value={transcriptEn}
                  onChange={(e) => setTranscriptEn(e.target.value)}
                  rows={10}
                />
              </label>
              <button type="button" className="ed-btn-ghost" onClick={translateTranscript} disabled={!transcript.trim() || translating}>
                {translating ? 'Translating…' : transcriptEn.trim() ? 'Refresh English translation' : 'Translate to English'}
              </button>
              <p className="ed-hint">
                Verbo makes one English line per Chinese sentence, so refreshed
                legacy episodes use the same translation layout as new ones. Save
                changes to publish the refreshed translation.
              </p>
            </>
          )}

          {tab === 'Media' && (
            <>
              <label className="ed-field">
                <span>Audio {workingPodcast ? '(leave empty to keep the current file)' : ''}</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setAudio(e.target.files[0] || null)}
                />
              </label>
              <p className="ed-hint">
                mp3, wav, m4a, ogg, aac, flac or mp4, up to 60MB. Optional — an episode
                can be written before it is recorded, and the episode page says the audio
                is missing rather than showing an empty player.
              </p>

              {workingPodcast?.image_url && !imagePreview && (
                <img className="ed-preview" src={workingPodcast.image_url} alt="" />
              )}
              {imagePreview && <img className="ed-preview" src={imagePreview} alt="" />}

              <label className="ed-btn-ghost">
                {image ? 'Choose a different cover' : workingPodcast?.image_url ? 'Replace cover' : 'Choose cover'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const picked = e.target.files[0]
                    if (picked) setCropSource(picked)
                    // Cleared so picking the SAME file again still fires change.
                    e.target.value = ''
                  }}
                />
              </label>
              {image && (
                <button
                  type="button"
                  className="ed-btn-ghost"
                  onClick={() => setCropSource(image)}
                >
                  Adjust framing
                </button>
              )}

              {!editing && !workingPodcast && (
                <div className="ed-media-sync">
                  <strong>Generate and sync from audio</strong>
                  <p>
                    Verbo transcribes the Chinese, translates it to English, and
                    synchronizes every word in one job.
                  </p>
                  {audio ? (
                    <>
                      <p className="ed-sync-file">Audio · {audio.name}</p>
                      <button
                        type="button"
                        className="ed-btn-primary"
                        onClick={generateFromAudio}
                        disabled={busy}
                      >
                        {busy ? 'Generating…' : 'Generate transcript'}
                      </button>
                    </>
                  ) : (
                    <p className="ed-hint">Choose an audio file above to generate its transcript.</p>
                  )}
                </div>
              )}

              {!editing && workingPodcast && (
                <div className="ed-media-sync ed-media-sync-existing">
                  <SyncTab podcast={workingPodcast} onChange={onTimedChange} />
                </div>
              )}
            </>
          )}

          {tab === 'Sync' && workingPodcast && (
            <SyncTab podcast={workingPodcast} onChange={onTimedChange} />
          )}

          {tab !== 'Sync' && (
          <div className="ed-actions">
            {flash === 'Changes saved' && (
              <span className="ed-save-status" role="status">
                <span aria-hidden="true">✓</span> Changes saved
              </span>
            )}
            <button type="submit" className="ed-btn-primary" disabled={busy}>
              {busy ? 'Saving…' : flash === 'Changes saved' ? 'Saved ✓' : editing ? 'Save changes' : 'Publish'}
            </button>
          </div>
          )}
        </form>
      </EditDrawer>

      {/* Outside the drawer in the tree so it is not clipped by the panel's
          own scrolling body. */}
      {cropSource && (
        <ImageCropper
          file={cropSource}
          aspect={COVER_ASPECT}
          outputWidth={COVER_WIDTH}
          onCancel={() => setCropSource(null)}
          onCrop={(file) => {
            setImage(file)
            setCropSource(null)
          }}
        />
      )}
    </>
  )
}
