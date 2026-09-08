import { useEffect, useMemo, useState } from 'react'
import { readCache } from '../dataCache'
import EditDrawer from './EditDrawer'
import ImageCropper from './ImageCropper'

/**
 * Publishing and editing a Read article, in the drawer every other admin
 * surface in this app now uses.
 *
 * ONE component for both jobs rather than a create form on Read and an edit
 * form on ReadArticle. The two took the same fields and drifted anyway — the
 * create form never offered `category`, so an article published from the Read
 * page landed with no topic and could only be filed by editing it afterwards.
 * The same trap SectionToggle and EditDrawer were both extracted to close.
 *
 * `article` absent means create; present means edit. Nothing else changes.
 */

/* A FLOOR, not the list. These are the topics the Read page names in
   TOPIC_ORDER, offered so a library with nothing published yet still suggests
   something sensible.
 *
 * The topic field is a combobox rather than a select: `articles.category` is a
 * free string server-side (`nullable|string|max:60`, no enum), and the Read
 * page builds its pills and shelves from whatever has actually been published —
 * unknown topics are appended alphabetically after TOPIC_ORDER. So a new topic
 * has always been publishable; a hardcoded <select> here was the only thing
 * stopping anyone creating one. */
const DEFAULT_TOPICS = [
  'Everyday Chinese',
  'Culture',
  'Entertainment',
  'Stories',
  'Travel',
  'Business',
]

/**
 * Every topic already in use, plus the defaults.
 *
 * Read from the shared cache rather than taken as a prop: `articles` is the key
 * both the Read page and the Dashboard already populate, so this is the same
 * list they render and costs no request. Falling back to the defaults when the
 * cache is cold is the honest empty case — it offers the canonical six rather
 * than pretending to know what has been published.
 */
function knownTopics(current) {
  const cached = readCache('articles')
  const used = Array.isArray(cached)
    ? cached.map((a) => a.category).filter(Boolean)
    : []
  // Case-insensitive de-dupe, keeping the first spelling seen. Two spellings of
  // one topic would build two shelves and split its pill in half.
  const seen = new Map()
  for (const t of [...used, ...DEFAULT_TOPICS, current].filter(Boolean)) {
    const key = t.trim().toLowerCase()
    if (key && !seen.has(key)) seen.set(key, t.trim())
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Snap a typed topic onto an existing one that differs only by case or spacing.
 *
 * Without this, "culture" and "Culture" are two different values: two pills,
 * two shelves, and an article filed where nobody looking at the other would
 * find it. Anything genuinely new is kept exactly as typed.
 */
function normaliseTopic(value, options) {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  const match = options.find((t) => t.toLowerCase() === trimmed.toLowerCase())
  return match || trimmed
}

/* FORMAT, not topic. `type` is what the piece IS (article/story/funfact) and
   shows as the small badge on a cover; `category` is what it is ABOUT. Mixing
   them is what once put "Grammar" beside "Entertainment" in one filter row. */
const FORMATS = [
  { value: 'article', label: 'Article' },
  { value: 'story', label: 'Story' },
  { value: 'funfact', label: 'Fun fact' },
]

const LEVELS = ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6']

/* The Read tile's cover is 16:9 (`.rd-tile-media` uses that aspect-ratio), so
   the crop is cut to the shape it will actually be shown in. Without a crop
   step an upload was scaled to fill and centre-cropped by the browser, which
   is how a photo whose subject sat low ended up beheaded on the card. */
const COVER_ASPECT = 16 / 9
const COVER_WIDTH = 960

export default function ArticleEditDrawer({ article, onSave, onClose }) {
  const editing = Boolean(article)

  const [tab, setTab] = useState('Article')
  const [title, setTitle] = useState(article?.title || '')
  const [type, setType] = useState(article?.type || 'article')
  const [category, setCategory] = useState(article?.category || '')
  /* Computed once per open. Recomputing per keystroke would re-sort the
     suggestion list under the cursor while someone is typing into it. */
  const topicOptions = useMemo(() => knownTopics(article?.category), [article?.category])
  const [hskLevel, setHskLevel] = useState(article?.hsk_level || '')
  const [body, setBody] = useState(article?.body || '')
  const [bodyEn, setBodyEn] = useState(article?.body_en || '')
  const [image, setImage] = useState(null)

  /* The cropper runs BEFORE the file becomes the upload, so the framing chosen
     here is what the card and the article header both show. */
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
        type,
        /* Normalised here as well as on blur — Save can be reached without the
           field ever losing focus (Enter, or clicking straight through), and an
           un-snapped "culture" would quietly become a second shelf. */
        category: normaliseTopic(category, topicOptions) || null,
        hsk_level: hskLevel || null,
        body,
        body_en: bodyEn,
        image,
      })
      // The caller closes on create; on edit it stays open, so say so.
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
      title={editing ? 'Edit article' : 'New article'}
      subtitle={editing ? article.title : 'Publish to the Read section'}
      tabs={['Article', 'Translation', 'Cover']}
      tab={tab}
      onTabChange={setTab}
      onClose={onClose}
      error={error}
      flash={flash}
    >
      <form className="ed-form" onSubmit={submit}>
        {tab === 'Article' && (
          <>
            <label className="ed-field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>

            <div className="ed-row">
              <label className="ed-field">
                <span>Format</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Type to create, or pick one that exists. A native datalist
                  rather than a custom dropdown: it is keyboard accessible for
                  free, and the whole point is that the field accepts a value
                  that is not on the list. */}
              <label className="ed-field">
                <span>Topic</span>
                <input
                  type="text"
                  list="ed-topics"
                  value={category}
                  placeholder="Unfiled — or type a new topic"
                  maxLength={60}
                  onChange={(e) => setCategory(e.target.value)}
                  /* Snapped on blur, not on every keystroke: correcting the
                     case while someone is still typing fights them. */
                  onBlur={() => setCategory((v) => normaliseTopic(v, topicOptions))}
                />
                <datalist id="ed-topics">
                  {topicOptions.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <small className="ed-hint">
                  A new topic gets its own shelf and filter on Read as soon as
                  this is published.
                </small>
              </label>

              <label className="ed-field ed-narrow">
                <span>Level</span>
                <select value={hskLevel} onChange={(e) => setHskLevel(e.target.value)}>
                  <option value="">—</option>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="ed-hint">
              Format is what the piece <em>is</em>; topic is what it is <em>about</em>. The
              Read page shelves by topic, so an unfiled article only turns up in search.
            </p>

            <label className="ed-field">
              <span>Chinese text</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                required
              />
            </label>
          </>
        )}

        {tab === 'Translation' && (
          <>
            <label className="ed-field">
              <span>English translation</span>
              <textarea value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} rows={14} />
            </label>
            <p className="ed-hint">
              Optional. Leaving it empty is valid — the reader's Translation switch renders
              disabled rather than opening a blank pane. It is one passage, not per-sentence
              pairs, so it sits under the Chinese rather than beside it.
            </p>
          </>
        )}

        {tab === 'Cover' && (
          <>
            {/* The crop being uploaded wins over what is already published, so
                the preview always shows what saving would actually produce. */}
            {imagePreview ? (
              <img className="ed-preview" src={imagePreview} alt="" />
            ) : (
              article?.image_url && <img className="ed-preview" src={article.image_url} alt="" />
            )}

            <label className="ed-btn-ghost">
              {image ? 'Choose a different image' : article?.image_url ? 'Replace image' : 'Choose image'}
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

            <p className="ed-hint">
              Optional — every article already generates a cover from its topic, so this
              is an upgrade rather than a requirement. Cropped to 16:9, the shape the card
              actually shows, and a new image replaces the old file on save.
            </p>
          </>
        )}

        <div className="ed-actions">
          <button type="submit" className="ed-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Publish'}
          </button>
        </div>
      </form>
    </EditDrawer>

    {/* Outside the drawer in the tree so the cropper is not clipped by the
        panel's own scrolling body. */}
    {cropSource && (
      <ImageCropper
        file={cropSource}
        aspect={COVER_ASPECT}
        outputWidth={COVER_WIDTH}
        onCancel={() => setCropSource(null)}
        onCrop={(cropped) => {
          setImage(cropped)
          setCropSource(null)
        }}
      />
    )}
    </>
  )
}
