import { useState } from 'react'
import { api } from '../api'
import EditDrawer from './EditDrawer'

const TABS = ['Vocabulary', 'Reading', 'Grammar', 'Culture', 'Quiz']
const OPTIONS = ['a', 'b', 'c', 'd']

const EMPTY_WORD = { hanzi: '', pinyin: '', translation: '', explanation: '' }
const EMPTY_LINE = { speaker: '', chinese: '', pinyin: '' }
const EMPTY_POINT = { title: '', description: '', structure: '' }
const EMPTY_EXAMPLE = { chinese: '', pinyin: '', english: '' }
const EMPTY_QUESTION = {
  question: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: 'a',
}

/**
 * Everything an admin can change about a study unit, behind one button.
 *
 * The unit spans five content types across eighteen endpoints, seven of them
 * collections with add/delete — so like TutorEditDrawer there is no single
 * Save. Each form commits against its own endpoint at its own moment, and
 * `onChange` patches the unit on the page behind so it stays in step without a
 * refetch. Photos and vocabulary are the two cases where the distinction is
 * visible to the user, so both say so in the UI.
 */
export default function StudyUnitEditDrawer({ token, unit, initialTab, onChange, onClose }) {
  const [tab, setTab] = useState(TABS.includes(initialTab) ? initialTab : 'Vocabulary')
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)
  const [busy, setBusy] = useState(null)

  const [word, setWord] = useState(EMPTY_WORD)
  const [textTitle, setTextTitle] = useState('')
  const [activeTextId, setActiveTextId] = useState(null)
  const [line, setLine] = useState(EMPTY_LINE)
  const [point, setPoint] = useState(EMPTY_POINT)
  const [editingPointId, setEditingPointId] = useState(null)
  const [pointDraft, setPointDraft] = useState(EMPTY_POINT)
  const [exampleDrafts, setExampleDrafts] = useState({})
  const [culture, setCulture] = useState({
    culture_title: unit.culture_title || '',
    culture_term: unit.culture_term || '',
    culture_body: unit.culture_body || '',
  })
  const [question, setQuestion] = useState(EMPTY_QUESTION)

  const texts = unit.texts || []
  const currentTextId = activeTextId ?? texts[0]?.id ?? null
  const currentText = texts.find((t) => t.id === currentTextId) || null
  const images = unit.culture_images || []

  function say(what) {
    setFlash(what)
    setTimeout(() => setFlash(null), 2200)
  }

  /* One wrapper around every mutation: it owns the error reset, the busy flag
     and the flash, so eighteen handlers do not each restate them. */
  async function run(key, work, done) {
    setError(null)
    setBusy(key)
    try {
      const result = await work()
      if (done) done(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const patch = (changes) => onChange({ ...unit, ...changes })

  // ---- vocabulary ----
  const addWord = (e) => {
    e.preventDefault()
    run(
      'word',
      () => api.addStudyVocabulary(token, unit.id, word),
      (added) => {
        patch({ vocabulary: [...unit.vocabulary, added] })
        setWord(EMPTY_WORD)
        say('Word added')
      }
    )
  }

  const deleteWord = (id) =>
    run(
      `word-${id}`,
      () => api.deleteStudyVocabulary(token, id),
      () => patch({ vocabulary: unit.vocabulary.filter((w) => w.id !== id) })
    )

  // ---- reading ----
  const addText = (e) => {
    e.preventDefault()
    run(
      'text',
      () => api.addStudyText(token, unit.id, { title: textTitle }),
      (added) => {
        patch({ texts: [...texts, added] })
        setActiveTextId(added.id)
        setTextTitle('')
        say('Text added')
      }
    )
  }

  const deleteText = (id) =>
    run(
      `text-${id}`,
      () => api.deleteStudyText(token, id),
      () => {
        patch({ texts: texts.filter((t) => t.id !== id) })
        setActiveTextId((current) => (current === id ? null : current))
      }
    )

  const addLine = (e) => {
    e.preventDefault()
    run(
      'line',
      () => api.addStudyTextLine(token, currentTextId, line),
      (added) => {
        patch({
          texts: texts.map((t) =>
            t.id === currentTextId ? { ...t, lines: [...t.lines, added] } : t
          ),
        })
        setLine(EMPTY_LINE)
        say('Line added')
      }
    )
  }

  const deleteLine = (id) =>
    run(
      `line-${id}`,
      () => api.deleteStudyTextLine(token, id),
      () =>
        patch({
          texts: texts.map((t) => ({ ...t, lines: t.lines.filter((l) => l.id !== id) })),
        })
    )

  // ---- grammar ----
  const addPoint = (e) => {
    e.preventDefault()
    run(
      'point',
      () => api.addStudyGrammarPoint(token, unit.id, point),
      (added) => {
        patch({ grammar_points: [...unit.grammar_points, added] })
        setPoint(EMPTY_POINT)
        say('Grammar point added')
      }
    )
  }

  const savePoint = (e, id) => {
    e.preventDefault()
    run(
      `point-${id}`,
      () => api.updateStudyGrammarPoint(token, id, pointDraft),
      (updated) => {
        patch({
          grammar_points: unit.grammar_points.map((p) => (p.id === id ? updated : p)),
        })
        setEditingPointId(null)
        say('Grammar point saved')
      }
    )
  }

  const deletePoint = (id) =>
    run(
      `point-${id}`,
      () => api.deleteStudyGrammarPoint(token, id),
      () => patch({ grammar_points: unit.grammar_points.filter((p) => p.id !== id) })
    )

  const addExample = (e, pointId) => {
    e.preventDefault()
    const draft = exampleDrafts[pointId] || EMPTY_EXAMPLE
    run(
      `example-${pointId}`,
      () => api.addStudyGrammarExample(token, pointId, draft),
      (added) => {
        patch({
          grammar_points: unit.grammar_points.map((p) =>
            p.id === pointId ? { ...p, examples: [...p.examples, added] } : p
          ),
        })
        setExampleDrafts((prev) => ({ ...prev, [pointId]: EMPTY_EXAMPLE }))
        say('Example added')
      }
    )
  }

  const deleteExample = (pointId, id) =>
    run(
      `example-${id}`,
      () => api.deleteStudyGrammarExample(token, id),
      () =>
        patch({
          grammar_points: unit.grammar_points.map((p) =>
            p.id === pointId ? { ...p, examples: p.examples.filter((x) => x.id !== id) } : p
          ),
        })
    )

  // ---- culture ----
  const saveCulture = (e) => {
    e.preventDefault()
    // The update endpoint requires a title on every save even when only the
    // culture fields change, so resend the unit's current title/description.
    run(
      'culture',
      () =>
        api.updateStudyUnit(token, unit.id, {
          title: unit.title,
          description: unit.description,
          ...culture,
        }),
      (updated) => {
        patch(updated)
        say('Culture note saved')
      }
    )
  }

  const addImage = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    run(
      'image',
      () => api.addCultureImage(token, unit.id, file),
      (added) => {
        patch({ culture_images: [...images, added] })
        say('Photo uploaded')
      }
    ).finally(() => {
      e.target.value = ''
    })
  }

  const deleteImage = (id) =>
    run(
      `image-${id}`,
      () => api.deleteCultureImage(token, id),
      () => patch({ culture_images: images.filter((img) => img.id !== id) })
    )

  // ---- quiz ----
  const addQuestion = (e) => {
    e.preventDefault()
    run(
      'quiz',
      () => api.addStudyQuizQuestion(token, unit.id, question),
      (added) => {
        patch({ quiz_questions: [...unit.quiz_questions, added] })
        setQuestion(EMPTY_QUESTION)
        say('Question added')
      }
    )
  }

  const deleteQuestion = (id) =>
    run(
      `quiz-${id}`,
      () => api.deleteStudyQuizQuestion(token, id),
      () => patch({ quiz_questions: unit.quiz_questions.filter((q) => q.id !== id) })
    )

  const field = (label, value, onInput, props = {}) => (
    <label className="ed-field">
      <span>{label}</span>
      {props.rows ? (
        <textarea value={value} onChange={(e) => onInput(e.target.value)} {...props} />
      ) : (
        <input value={value} onChange={(e) => onInput(e.target.value)} {...props} />
      )}
    </label>
  )

  return (
    <EditDrawer
      title="Edit unit"
      subtitle={unit.title}
      tabs={TABS}
      tab={tab}
      onTabChange={setTab}
      onClose={onClose}
      error={error}
      flash={flash}
    >
      {tab === 'Vocabulary' && (
        <>
          <div className="ed-group">
            <p className="ed-group-title">Words ({unit.vocabulary.length})</p>
            {unit.vocabulary.length === 0 ? (
              <p className="ed-empty">Nothing here yet.</p>
            ) : (
              <ul className="ed-list">
                {unit.vocabulary.map((w) => (
                  <li className="ed-item" key={w.id}>
                    <div>
                      <p className="ed-item-title">{w.hanzi}</p>
                      <p className="ed-item-meta">
                        {[w.pinyin, w.translation].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ed-remove"
                      onClick={() => deleteWord(w.id)}
                      aria-label={`Delete ${w.hanzi}`}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="ed-form ed-add" onSubmit={addWord}>
            <p className="ed-group-title">Add a word</p>
            {field('Hanzi', word.hanzi, (v) => setWord({ ...word, hanzi: v }), {
              placeholder: '以为',
              required: true,
            })}
            {field('Pinyin', word.pinyin, (v) => setWord({ ...word, pinyin: v }), {
              placeholder: 'Leave blank to generate',
            })}
            {field('Translation', word.translation, (v) => setWord({ ...word, translation: v }))}
            {field('Explanation', word.explanation, (v) => setWord({ ...word, explanation: v }), {
              rows: 2,
              placeholder: 'Leave blank to use the dictionary',
            })}
            <button type="submit" className="ed-btn-primary" disabled={busy === 'word'}>
              {busy === 'word' ? 'Adding…' : 'Add word'}
            </button>
          </form>
        </>
      )}

      {tab === 'Reading' && (
        <>
          <div className="ed-group">
            <p className="ed-group-title">Texts</p>
            {texts.length === 0 ? (
              <p className="ed-empty">Nothing here yet.</p>
            ) : (
              <ul className="ed-list">
                {texts.map((t) => (
                  <li
                    className={'ed-item' + (t.id === currentTextId ? ' active' : '')}
                    key={t.id}
                  >
                    <button
                      type="button"
                      className="ed-item-pick"
                      onClick={() => setActiveTextId(t.id)}
                    >
                      <span className="ed-item-title">{t.title}</span>
                      <span className="ed-item-meta">{t.lines.length} lines</span>
                    </button>
                    <button
                      type="button"
                      className="ed-remove"
                      onClick={() => deleteText(t.id)}
                      aria-label={`Delete ${t.title}`}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="ed-form ed-add" onSubmit={addText}>
            <p className="ed-group-title">Add a text</p>
            {field('Title', textTitle, setTextTitle, { placeholder: 'e.g. Text 1', required: true })}
            <button type="submit" className="ed-btn-primary" disabled={busy === 'text'}>
              {busy === 'text' ? 'Adding…' : 'Add text'}
            </button>
          </form>

          {currentText && (
            <>
              <div className="ed-group ed-add">
                <p className="ed-group-title">Lines in “{currentText.title}”</p>
                {currentText.lines.length === 0 ? (
                  <p className="ed-empty">Nothing here yet.</p>
                ) : (
                  <ul className="ed-list">
                    {currentText.lines.map((l) => (
                      <li className="ed-item" key={l.id}>
                        <div>
                          <p className="ed-item-title">{l.chinese}</p>
                          <p className="ed-item-meta">
                            {[l.speaker, l.pinyin].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="ed-remove"
                          onClick={() => deleteLine(l.id)}
                          aria-label="Delete line"
                        >
                          &times;
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <form className="ed-form ed-add" onSubmit={addLine}>
                <p className="ed-group-title">Add a line</p>
                {field('Speaker', line.speaker, (v) => setLine({ ...line, speaker: v }), {
                  placeholder: 'e.g. 安妮',
                })}
                {field('Chinese', line.chinese, (v) => setLine({ ...line, chinese: v }), {
                  placeholder: '桌子上摆着的那张照片是你吗？',
                  required: true,
                })}
                {field('Pinyin', line.pinyin, (v) => setLine({ ...line, pinyin: v }), {
                  placeholder: 'Leave blank to generate',
                })}
                <button type="submit" className="ed-btn-primary" disabled={busy === 'line'}>
                  {busy === 'line' ? 'Adding…' : 'Add line'}
                </button>
              </form>
            </>
          )}
        </>
      )}

      {tab === 'Grammar' && (
        <>
          {unit.grammar_points.length === 0 ? (
            <p className="ed-empty">No grammar points yet.</p>
          ) : (
            unit.grammar_points.map((p) => (
              <div className="ed-group" key={p.id}>
                <div className="ed-group-head">
                  <p className="ed-group-title">{p.title}</p>
                  <span className="ed-group-actions">
                    <button
                      type="button"
                      className="ed-btn-ghost"
                      onClick={() => {
                        if (editingPointId === p.id) return setEditingPointId(null)
                        setEditingPointId(p.id)
                        setPointDraft({
                          title: p.title || '',
                          description: p.description || '',
                          structure: p.structure || '',
                        })
                      }}
                    >
                      {editingPointId === p.id ? 'Cancel' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      className="ed-remove"
                      onClick={() => deletePoint(p.id)}
                      aria-label={`Delete ${p.title}`}
                    >
                      &times;
                    </button>
                  </span>
                </div>

                {editingPointId === p.id && (
                  <form className="ed-form" onSubmit={(e) => savePoint(e, p.id)}>
                    {field('Title', pointDraft.title, (v) => setPointDraft({ ...pointDraft, title: v }), {
                      required: true,
                    })}
                    {field(
                      'Description',
                      pointDraft.description,
                      (v) => setPointDraft({ ...pointDraft, description: v }),
                      { rows: 4 }
                    )}
                    {field('Structure', pointDraft.structure, (v) =>
                      setPointDraft({ ...pointDraft, structure: v })
                    )}
                    <button
                      type="submit"
                      className="ed-btn-primary"
                      disabled={busy === `point-${p.id}`}
                    >
                      {busy === `point-${p.id}` ? 'Saving…' : 'Save point'}
                    </button>
                  </form>
                )}

                {p.examples.length > 0 && (
                  <ul className="ed-list">
                    {p.examples.map((ex) => (
                      <li className="ed-item" key={ex.id}>
                        <div>
                          <p className="ed-item-title">{ex.chinese}</p>
                          <p className="ed-item-meta">
                            {[ex.pinyin, ex.english].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="ed-remove"
                          onClick={() => deleteExample(p.id, ex.id)}
                          aria-label="Delete example"
                        >
                          &times;
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <form className="ed-form ed-sub" onSubmit={(e) => addExample(e, p.id)}>
                  {field(
                    'Example — Chinese',
                    exampleDrafts[p.id]?.chinese || '',
                    (v) =>
                      setExampleDrafts((prev) => ({
                        ...prev,
                        [p.id]: { ...EMPTY_EXAMPLE, ...prev[p.id], chinese: v },
                      })),
                    { placeholder: '我们可以走着去。', required: true }
                  )}
                  <div className="ed-row">
                    {field(
                      'Pinyin',
                      exampleDrafts[p.id]?.pinyin || '',
                      (v) =>
                        setExampleDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...EMPTY_EXAMPLE, ...prev[p.id], pinyin: v },
                        })),
                      { placeholder: 'Auto' }
                    )}
                    {field(
                      'English',
                      exampleDrafts[p.id]?.english || '',
                      (v) =>
                        setExampleDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...EMPTY_EXAMPLE, ...prev[p.id], english: v },
                        })),
                      { placeholder: 'We can go there.' }
                    )}
                  </div>
                  <button
                    type="submit"
                    className="ed-btn-ghost"
                    disabled={busy === `example-${p.id}`}
                  >
                    {busy === `example-${p.id}` ? 'Adding…' : 'Add example'}
                  </button>
                </form>
              </div>
            ))
          )}

          <form className="ed-form ed-add" onSubmit={addPoint}>
            <p className="ed-group-title">Add a grammar point</p>
            {field('Title', point.title, (v) => setPoint({ ...point, title: v }), {
              required: true,
            })}
            {field('Description', point.description, (v) => setPoint({ ...point, description: v }), {
              rows: 4,
            })}
            {field('Structure', point.structure, (v) => setPoint({ ...point, structure: v }))}
            <p className="ed-hint">Examples are added per point, above.</p>
            <button type="submit" className="ed-btn-primary" disabled={busy === 'point'}>
              {busy === 'point' ? 'Adding…' : 'Add grammar point'}
            </button>
          </form>
        </>
      )}

      {tab === 'Culture' && (
        <>
          <form className="ed-form" onSubmit={saveCulture}>
            {field('Title', culture.culture_title, (v) =>
              setCulture({ ...culture, culture_title: v })
            )}
            {field(
              'Key term',
              culture.culture_term,
              (v) => setCulture({ ...culture, culture_term: v }),
              { placeholder: '农家乐 — pinyin is generated' }
            )}
            {field('Body', culture.culture_body, (v) => setCulture({ ...culture, culture_body: v }), {
              rows: 8,
            })}
            <button type="submit" className="ed-btn-primary" disabled={busy === 'culture'}>
              {busy === 'culture' ? 'Saving…' : 'Save culture note'}
            </button>
          </form>

          <div className="ed-group ed-add">
            <p className="ed-group-title">Photos</p>
            <div className="ed-thumbs">
              {images.map((img, i) => (
                <span className="ed-thumb" key={img.id}>
                  <img src={img.url} alt="" />
                  <button
                    type="button"
                    onClick={() => deleteImage(img.id)}
                    aria-label={`Delete photo ${i + 1}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
              <label className="ed-btn-ghost">
                {busy === 'image' ? 'Uploading…' : '+ Add photo'}
                <input type="file" accept="image/*" disabled={busy === 'image'} onChange={addImage} />
              </label>
            </div>
            {/* Photos hit their own endpoint on pick, so Save above is not what
                commits them. Say so, or the button looks like it is. */}
            <p className="ed-hint">
              Photos upload as soon as you pick them, and delete right away too — the Save button
              above only covers the text fields.
            </p>
          </div>
        </>
      )}

      {tab === 'Quiz' && (
        <>
          <div className="ed-group">
            <p className="ed-group-title">Questions ({unit.quiz_questions.length})</p>
            {unit.quiz_questions.length === 0 ? (
              <p className="ed-empty">Nothing here yet.</p>
            ) : (
              <ul className="ed-list">
                {unit.quiz_questions.map((q) => (
                  <li className="ed-item" key={q.id}>
                    <div>
                      <p className="ed-item-title">{q.question}</p>
                      <p className="ed-item-meta">
                        {OPTIONS.map((o) => q[`option_${o}`])
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ed-remove"
                      onClick={() => deleteQuestion(q.id)}
                      aria-label="Delete question"
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* correct_option is $hidden on the model, so it never comes back
                from the API — there is nothing to show here, by design. */}
            <p className="ed-hint">
              The correct answer is never returned by the API, so it cannot be listed here.
            </p>
          </div>

          <form className="ed-form ed-add" onSubmit={addQuestion}>
            <p className="ed-group-title">Add a question</p>
            {field('Question', question.question, (v) => setQuestion({ ...question, question: v }), {
              required: true,
            })}
            {/* All four are required server-side — the quiz is fixed 4-option
                multiple choice. The old page form left C and D optional, which
                just produced a 422 on submit. */}
            <div className="ed-row">
              {field('Option A', question.option_a, (v) => setQuestion({ ...question, option_a: v }), {
                required: true,
              })}
              {field('Option B', question.option_b, (v) => setQuestion({ ...question, option_b: v }), {
                required: true,
              })}
            </div>
            <div className="ed-row">
              {field('Option C', question.option_c, (v) => setQuestion({ ...question, option_c: v }), {
                required: true,
              })}
              {field('Option D', question.option_d, (v) => setQuestion({ ...question, option_d: v }), {
                required: true,
              })}
            </div>
            <label className="ed-field ed-narrow">
              <span>Correct option</span>
              <select
                value={question.correct_option}
                onChange={(e) => setQuestion({ ...question, correct_option: e.target.value })}
              >
                {OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ed-btn-primary" disabled={busy === 'quiz'}>
              {busy === 'quiz' ? 'Adding…' : 'Add question'}
            </button>
          </form>
        </>
      )}
    </EditDrawer>
  )
}
