import { useState } from 'react'
import EditDrawer from './EditDrawer'

/**
 * Creating a study LEVEL (an HSK rung or a Daily Use situation) or a MODULE
 * (a lesson inside one), in the shared drawer.
 *
 * Two shapes in one component because the shell — panel, header, error, flash,
 * busy flag, save button — is the bulk of it and the fields are a short
 * branch. Splitting them would be two files that have to be kept in step, the
 * thing every other extraction here has been undoing.
 *
 * `kind` is 'level' or 'module'.
 */

const CATEGORIES = [
  { key: 'hsk', label: 'HSK' },
  { key: 'daily', label: 'Daily Use' },
]

export default function StudyEditDrawer({ kind, levelTitle, onSave, onClose }) {
  const isLevel = kind === 'level'

  const [tab, setTab] = useState(isLevel ? 'Level' : 'Module')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('hsk')
  const [lessonLabel, setLessonLabel] = useState('')
  const [image, setImage] = useState(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await onSave(
        isLevel
          ? { title, description, category, image }
          : { lesson_label: lessonLabel, title, description },
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <EditDrawer
      title={isLevel ? 'New level' : 'New module'}
      subtitle={isLevel ? 'A new HSK rung or Daily Use situation' : levelTitle}
      tabs={isLevel ? ['Level', 'Cover'] : ['Module']}
      tab={tab}
      onTabChange={setTab}
      onClose={onClose}
      error={error}
    >
      <form className="ed-form" onSubmit={submit}>
        {tab === 'Module' && (
          <>
            <label className="ed-field">
              <span>Lesson label</span>
              <input
                value={lessonLabel}
                onChange={(e) => setLessonLabel(e.target.value)}
                placeholder="e.g. 第一课"
              />
            </label>

            <label className="ed-field">
              <span>Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 我们去机场接你 - We will pick you up at the airport"
                required
              />
            </label>
            <p className="ed-hint">
              Written as <code>中文 - English</code>. The dash is what the Dashboard splits
              on to show the Chinese and the English separately, so keep it even when the
              spacing varies.
            </p>

            <label className="ed-field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="One line on what this lesson covers."
              />
            </label>
          </>
        )}

        {tab === 'Level' && (
          <>
            <label className="ed-field">
              <span>Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. HSK 3"
                required
              />
            </label>

            <label className="ed-field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="e.g. Master 600 words and intermediate communication skills."
              />
            </label>

            <label className="ed-field ed-narrow">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="ed-hint">
              HSK levels appear in the carousel; Daily Use situations get the shelved
              library instead. The two are different arrangements of the same content,
              and this is what decides which one a level lands in.
            </p>
          </>
        )}

        {tab === 'Cover' && (
          <>
            <label className="ed-btn-ghost">
              {image ? image.name : 'Choose cover image'}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImage(e.target.files[0] || null)}
              />
            </label>
            <p className="ed-hint">
              Optional — this is the book art on the carousel card. A level without one
              falls back to a lettered placeholder.
            </p>
          </>
        )}

        <div className="ed-actions">
          <button type="submit" className="ed-btn-primary" disabled={busy}>
            {busy ? 'Creating…' : isLevel ? 'Create level' : 'Create module'}
          </button>
        </div>
      </form>
    </EditDrawer>
  )
}
