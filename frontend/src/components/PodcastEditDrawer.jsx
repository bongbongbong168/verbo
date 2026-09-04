import { useEffect, useState } from 'react'
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

export default function PodcastEditDrawer({ podcast, onSave, onClose }) {
  const editing = Boolean(podcast)

  const [tab, setTab] = useState('Episode')
  const [title, setTitle] = useState(podcast?.title || '')
  const [level, setLevel] = useState(podcast?.level || 'Beginner')
  const [category, setCategory] = useState(podcast?.category || '')
  const [host, setHost] = useState(podcast?.host || '')
  const [bio, setBio] = useState(podcast?.bio || '')
  const [transcript, setTranscript] = useState(podcast?.transcript || '')
  const [transcriptEn, setTranscriptEn] = useState(podcast?.transcript_en || '')
  const [audio, setAudio] = useState(null)
  const [image, setImage] = useState(null)

  /* The cropper runs BEFORE the file becomes the upload, so the framing chosen
     here is what both the list card and the episode page show. */
  const [cropSource, setCropSource] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)

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
      await onSave({
        title,
        level,
        // Sent even when empty, or a topic could never be cleared back to
        // Unfiled — the rule transcript_en already follows.
        category,
        host,
        bio,
        transcript,
        // Always sent, even empty, or clearing a translation would be
        // impossible — the rule podcastFormData already follows.
        transcriptEn,
        audio,
        image,
      })
      if (editing) setFlash('Saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <EditDrawer
        title={editing ? 'Edit episode' : 'New episode'}
        subtitle={editing ? podcast.title : 'Publish to the Podcast section'}
        tabs={['Episode', 'Transcript', 'Media']}
        tab={tab}
        onTabChange={setTab}
        onClose={onClose}
        error={error}
        flash={flash}
      >
        <form className="ed-form" onSubmit={submit}>
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
            </>
          )}

          {tab === 'Transcript' && (
            <>
              <label className="ed-field">
                <span>Chinese transcript</span>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={12}
                  required
                />
              </label>
              <p className="ed-hint">
                Every word here becomes hoverable on the episode page, and Alt+1 saves it
                to the flashcard bank.
              </p>

              <label className="ed-field">
                <span>English transcript</span>
                <textarea
                  value={transcriptEn}
                  onChange={(e) => setTranscriptEn(e.target.value)}
                  rows={10}
                />
              </label>
              <p className="ed-hint">
                Optional. A Chinese-only episode is valid — the Translation switch renders
                disabled rather than opening a blank pane.
              </p>
            </>
          )}

          {tab === 'Media' && (
            <>
              <label className="ed-field">
                <span>Audio {editing ? '(leave empty to keep the current file)' : ''}</span>
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

              {podcast?.image_url && !imagePreview && (
                <img className="ed-preview" src={podcast.image_url} alt="" />
              )}
              {imagePreview && <img className="ed-preview" src={imagePreview} alt="" />}

              <label className="ed-btn-ghost">
                {image ? 'Choose a different cover' : podcast?.image_url ? 'Replace cover' : 'Choose cover'}
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
            </>
          )}

          <div className="ed-actions">
            <button type="submit" className="ed-btn-primary" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Publish'}
            </button>
          </div>
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
