import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import StudyQuizLauncher from '../components/StudyQuizLauncher'
import StudyUnitEditDrawer from '../components/StudyUnitEditDrawer'
import WordPopover from '../components/WordPopover'
import { buildVocabQuestions } from '../studyQuiz'
import sectionIcon from '../assets/study/section-icon.png'
import './StudyUnit.css'

const TABS = [
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'reading', label: 'Reading' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'culture', label: 'Culture' },
  { key: 'quiz', label: 'Quiz' },
]

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="m14.5 6.5 3 3" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  )
}

export default function StudyUnit() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const [unit, setUnit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSaved, setLastSaved] = useState(null)
  const hoveredWordRef = useRef(null)
  /* The word under the pointer, for the popover. Held in state as well as the
     ref because the ref must not trigger a render on every mouse move, while
     the popover has to. Same split ReadArticle uses. */
  const [hovered, setHovered] = useState(null)
  /* Keyed by the word itself, so every occurrence of a saved word in the
     conversation shows as saved — not only the one you pressed Alt+1 on. */
  const [savedWords, setSavedWords] = useState({})
  /* Independent reading aids, as on Read and Podcast. Pinyin defaults on
     because a dialogue is for saying out loud; translation defaults off so the
     Chinese is what you meet first. */
  const [showPinyin, setShowPinyin] = useState(true)
  const [showTranslation, setShowTranslation] = useState(false)
  /* The loaded unit, mirrored into a ref. The Alt+1 listener subscribes once
     (deps [token]) so it does not re-attach on every hover, which means its
     handler closes over the FIRST render — where `unit` is still null. Reading
     the state there sent `source_id: null` on every save, recording the word
     with no way back to the lesson it came from. */
  const unitRef = useRef(null)
  /* Whether the whole conversation is playing. Mirrored into a ref because the
     chain of `onend` callbacks is created once and cannot see later state —
     without it, pressing stop would be ignored and the dialogue would run to
     the end regardless. */
  const [playingAll, setPlayingAll] = useState(false)
  const playingAllRef = useRef(false)

  const [activeTab, setActiveTab] = useState('vocabulary')
  const [openExplanations, setOpenExplanations] = useState({})
  const [speakingId, setSpeakingId] = useState(null)

  const [showEdit, setShowEdit] = useState(false)

  // Which reading text is on screen. Selection is a reader concern, so it stays
  // on the page even though adding and deleting texts moved into the drawer.
  const [activeTextId, setActiveTextId] = useState(null)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    loadUnit()
  }, [token, id])

  function loadUnit() {
    setLoading(true)
    api
      .getStudyUnit(token, id)
      .then((data) => {
        setUnit(data)
        // Mirrored for the Alt+1 listener, which cannot see this state.
        unitRef.current = data

        /* A Daily Use lesson opens on its CONVERSATION, not on the word list.
           The situation is the point — you came here to learn how the exchange
           goes, and the vocabulary is what you pick up on the way. An HSK
           lesson is the other way round: the words are the syllabus and the
           passage is practice, so it keeps Vocabulary first.

           Set here rather than in an effect so it happens once, on load, and
           cannot fight a tab the reader has since chosen for themselves. */
        if (data.level?.category === 'daily' && (data.texts || []).length) {
          setActiveTab('reading')
        }
        // Record the visit so the Dashboard's "Pick up where you left off"
        // tile can point back here. Fire-and-forget: a failure must not stop
        // the page rendering, and there is nothing useful to tell the user.
        api.recordView(token, 'study_unit', id).catch(() => {})
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  /**
   * Pronunciation uses the browser's built-in speech synthesis, so there is
   * no audio to record or store. Falls back silently where unsupported.
   */
  function speak(word) {
    speakText(word.hanzi, word.id)
  }

  /**
   * Say one piece of Chinese aloud.
   *
   * The browser's own speech synthesis, which the vocabulary list already used
   * — deliberately not a cloud TTS service. Nothing has to be recorded, stored,
   * paid for or kept in step with the text: a line edited in the drawer is
   * spoken correctly the next time it is played, where a generated audio file
   * would silently go stale. The cost is that the voice depends on what the
   * reader's OS has installed, and a machine with no Chinese voice simply
   * stays quiet rather than mispronouncing it in English.
   */
  function speakText(text, id) {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return null
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.85
    utterance.onend = () => setSpeakingId(null)
    utterance.onerror = () => setSpeakingId(null)
    setSpeakingId(id)
    window.speechSynthesis.speak(utterance)
    return utterance
  }

  /** Is speech available at all? Used to hide the controls rather than offer
   *  buttons that would do nothing. */
  const canSpeak = typeof window !== 'undefined' && !!window.speechSynthesis

  /**
   * Read the whole conversation, line by line, highlighting the current one.
   *
   * Chained on each utterance's `onend` rather than queued all at once: the
   * queue would play correctly but there would be no way to know which line is
   * being spoken, and the highlight is most of the point. Pressing it again
   * while playing stops — a play button with no way to stop is a trap on a
   * long dialogue.
   */
  function playConversation() {
    if (!canSpeak || !currentText?.lines?.length) return

    if (playingAllRef.current) {
      playingAllRef.current = false
      window.speechSynthesis.cancel()
      setPlayingAll(false)
      setSpeakingId(null)
      return
    }

    const lines = currentText.lines.filter((l) => l.chinese)
    setPlayingAll(true)

    const sayFrom = (i) => {
      // Stopped, or ran off the end.
      if (i >= lines.length || !playingAllRef.current) {
        setPlayingAll(false)
        setSpeakingId(null)
        return
      }
      const u = speakText(lines[i].chinese, `line-${lines[i].id}`)
      if (!u) {
        setPlayingAll(false)
        return
      }
      u.onend = () => sayFrom(i + 1)
      u.onerror = () => {
        setPlayingAll(false)
        setSpeakingId(null)
      }
    }

    playingAllRef.current = true
    sayFrom(0)
  }

  function toggleExplanation(wordId) {
    setOpenExplanations((prev) => ({ ...prev, [wordId]: !prev[wordId] }))
  }

  async function handleSaveWord(word) {
    try {
      await api.addFlashcard(token, {
        word: word.text,
        pinyin: word.pinyin,
        translation: word.translation,
        source_module: 'study',
        /* The line the word was said in. This page used to send no example —
           it had no token stream to pull one from — but the conversation is
           annotated now, so the sentence is real and captured at SAVE time,
           the same rule Read and Podcast follow. */
        example: exampleForWord(word),
        source_type: 'study_unit',
        // From the ref, not the state — see the note where unitRef is declared.
        source_id: unitRef.current?.id,
      })
      setLastSaved(word.text)
      setSavedWords((prev) => ({ ...prev, [word.text]: true }))
    } catch (err) {
      setError(err.message)
    }
  }

  /* Which conversation line contains this token. Object identity first, so a
     word that appears twice is credited to the line it was actually hovered
     in; falls back to a text match for the New Words list's Save buttons,
     which hand over a vocabulary row rather than a token from the dialogue. */
  function exampleForWord(word) {
    const lines = unitRef.current?.texts?.flatMap((t) => t.lines || []) || []
    const byToken = lines.find((l) => (l.tokens || []).some((t) => t === word))
    const line = byToken || lines.find((l) => (l.chinese || '').includes(word.text))
    return line?.chinese || null
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.altKey && e.key === '1') {
        const word = hoveredWordRef.current
        if (word) {
          e.preventDefault()
          handleSaveWord(word)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [token])

  if (loading) return <p className="un-empty">Loading...</p>
  if (error && !unit) return <p className="un-error">{error}</p>
  if (!unit) return null

  const level = unit.level || {}
  const accent = level.accent_color || '#ee6d08'
  const images = unit.culture_images || []

  // Default to the first text so the Reading tab always opens with content.
  const texts = unit.texts || []
  const currentTextId = activeTextId ?? texts[0]?.id ?? null
  const currentText = texts.find((t) => t.id === currentTextId) || null
  /* Whether THIS conversation has any English at all. A Chinese-only dialogue
     is perfectly valid, so the toggle greys out rather than opening a blank
     pane — the same rule a Chinese-only podcast episode follows. */
  const hasEnglish = (currentText?.lines || []).some((l) => l.english)
  const quizCount = unit.quiz_questions?.length || 0
  /* What the quiz would ACTUALLY offer, which is not the same as the number of
     admin-authored questions: rounds are also generated from the vocabulary.
     The outro used the raw count, so a Daily Use lesson with five words and no
     hand-written questions hid its "Quick practice" link while the Quiz tab
     next to it happily built a real run out of those same five words.
     Counted by running the generator, exactly as StudyQuizLauncher does. */
  const practiceCount = quizCount + buildVocabQuestions(unit.vocabulary || []).length
  /* A Daily Use topic is a situation, an HSK level is a rung. The wording of
     the way out should say which one you came from rather than a generic
     "Back". */
  const isDaily = unit.level?.category === 'daily'
  const backTo = unit.level ? `/study/${unit.level.id}` : '/study'

  /* Same panel, different word for it. In an HSK lesson the passage is a
     reading exercise; in a Daily Use situation it is a conversation you are
     going to have, and calling that "Reading" describes the wrong activity.
     Derived at render rather than held as two constants, so there is one list
     of tabs and it cannot fall out of step with itself. */
  const tabs = TABS.map((t) =>
    isDaily && t.key === 'reading' ? { ...t, label: 'Conversation' } : t,
  )
  const activeLabel = tabs.find((t) => t.key === activeTab)?.label

  return (
    <div className="un">
      <nav className="un-breadcrumb">
        <Link to="/study">Study</Link>
        <span className="un-breadcrumb-sep">/</span>
        <Link to={`/study/${level.id}`}>{level.title}</Link>
        <span className="un-breadcrumb-sep">/</span>
        <span className="un-breadcrumb-current">{unit.title}</span>
      </nav>

      {error && <p className="un-error">{error}</p>}

      <section className="un-hero" style={{ '--hero-accent': accent }}>
        <span className="un-hero-pills">
          {level.level_label && <span className="un-hero-pill">{level.level_label}</span>}
          {/* Where this lesson sits in its topic. Derived from the sibling
              list, so it stays true when lessons are added or removed — and
              only shown when the topic has more than one, since "Lesson 1 of 1"
              tells nobody anything. */}
          {unit.lesson_total > 1 && (
            <span className="un-hero-pill un-hero-pill-quiet">
              Lesson {unit.lesson_position} of {unit.lesson_total}
            </span>
          )}
        </span>
        <h1 className="un-hero-title">{level.title}</h1>
        {level.description && <p className="un-hero-subtitle">{level.description}</p>}
        <span className="un-hero-ring" aria-hidden="true" />
      </section>

      <div className="un-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={'un-tab' + (activeTab === tab.key ? ' active' : '')}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="un-section-label">
        <img src={sectionIcon} alt="" />
        <span>{activeLabel}</span>
        {user?.is_admin && (
          <button type="button" className="un-edit" onClick={() => setShowEdit(true)}>
            <PencilIcon /> Edit unit
          </button>
        )}
      </div>

      {lastSaved && <p className="un-saved-note">Saved &ldquo;{lastSaved}&rdquo; to flashcards.</p>}

      {/* ---------- Vocabulary ---------- */}
      {activeTab === 'vocabulary' && (
        <>
          <div className="un-panel">
            {unit.vocabulary.length === 0 ? (
              <p className="un-empty">No words yet.</p>
            ) : (
              <ul className="un-vocab">
                {unit.vocabulary.map((w, index) => (
                  <li key={w.id} className="un-vocab-item">
                    <div className="un-vocab-row">
                      <span className="un-vocab-index">{String(index + 1).padStart(2, '0')}.</span>
                      <span className="un-vocab-hanzi">{w.hanzi}</span>
                      <span className="un-vocab-pinyin">{w.pinyin}</span>
                      <span className="un-vocab-translation">{w.translation}</span>

                      <button
                        type="button"
                        className="un-explain-btn"
                        onClick={() => toggleExplanation(w.id)}
                        disabled={!w.explanation}
                        aria-expanded={!!openExplanations[w.id]}
                        title={
                          w.explanation ? 'Show explanation' : 'No explanation for this word yet'
                        }
                      >
                        Explain
                      </button>

                      <button
                        type="button"
                        className={'un-speak-btn' + (speakingId === w.id ? ' speaking' : '')}
                        onClick={() => speak(w)}
                        aria-label={`Pronounce ${w.hanzi}`}
                      >
                        <SpeakerIcon />
                      </button>
                    </div>

                    {openExplanations[w.id] && w.explanation && (
                      <p className="un-vocab-explanation">{w.explanation}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ---------- Reading ---------- */}
      {activeTab === 'reading' && (
        <div className="un-reading-panel">
          <div className="un-text-tabs">
            {texts.map((t) => (
              <span key={t.id} className="un-text-pill-wrap">
                <button
                  type="button"
                  className={'un-text-pill' + (t.id === currentTextId ? ' active' : '')}
                  onClick={() => setActiveTextId(t.id)}
                >
                  {t.title}
                </button>
              </span>
            ))}

            {/* Two independent aids, the same pair Read and Podcast carry. The
                Chinese never leaves the page — turning one on adds to it.
                Translation renders disabled when the conversation has no
                English rather than toggling to a blank pane. */}
            <span className="un-aids">
              {/* Hidden entirely where the browser has no speech synthesis —
                  a play button that can only do nothing is worse than none. */}
              {canSpeak && (
                <button
                  type="button"
                  className={'un-aid un-aid-play' + (playingAll ? ' on' : '')}
                  onClick={playConversation}
                  aria-pressed={playingAll}
                >
                  {playingAll ? 'Stop' : 'Play conversation'}
                </button>
              )}
              <button
                type="button"
                className={'un-aid' + (showPinyin ? ' on' : '')}
                onClick={() => setShowPinyin((v) => !v)}
                aria-pressed={showPinyin}
              >
                Pinyin
              </button>
              <button
                type="button"
                className={'un-aid' + (showTranslation ? ' on' : '')}
                onClick={() => setShowTranslation((v) => !v)}
                aria-pressed={showTranslation}
                disabled={!hasEnglish}
                title={hasEnglish ? undefined : 'No English for this conversation yet'}
              >
                Translation
              </button>
            </span>
          </div>

          <div className="un-reading-body">
            <div className="un-dialogue">
              {!currentText ? (
                <p className="un-empty">No texts yet.</p>
              ) : currentText.lines.length === 0 ? (
                <p className="un-empty">No lines in this text yet.</p>
              ) : (
                currentText.lines.map((line, idx) => (
                  <div
                    key={line.id}
                    className={
                      'un-line' +
                      (idx % 2 === 1 ? ' alt' : '') +
                      // Marks the line being spoken during full playback, so
                      // the reader can follow along rather than guess.
                      (speakingId === `line-${line.id}` ? ' speaking' : '')
                    }
                  >
                    {line.speaker && <span className="un-line-speaker">{line.speaker}</span>}
                    {canSpeak && (
                      <button
                        type="button"
                        className="un-line-say"
                        onClick={() => speakText(line.chinese, `line-${line.id}`)}
                        aria-label={`Play this line`}
                        title="Play this line"
                      >
                        <SpeakerIcon />
                      </button>
                    )}
                    <p className="un-line-chinese">
                      {/* Real tokens now, not bare characters. The page's Alt+1
                          listener reads `hoveredWordRef`, and until the backend
                          annotated these lines nothing ever assigned to it — the
                          shortcut was dead on the one page built around dialogue.
                          Falls back to plain characters for a line the dictionary
                          could not tokenise, so a lesson never renders empty. */}
                      {(line.tokens?.length ? line.tokens : null)
                        ? line.tokens.map((tok, i) =>
                            tok.type === 'word' ? (
                              <span
                                key={i}
                                className={
                                  'un-word' +
                                  // Keyed by the WORD, so every occurrence in the
                                  // conversation marks itself, not just the one
                                  // you pressed the shortcut on.
                                  (savedWords[tok.text] ? ' saved' : '') +
                                  (hovered?.tok === tok ? ' active' : '')
                                }
                                onMouseEnter={(e) => {
                                  hoveredWordRef.current = tok
                                  setHovered({
                                    tok,
                                    rect: e.currentTarget.getBoundingClientRect(),
                                  })
                                }}
                                onMouseLeave={() => {
                                  if (hoveredWordRef.current === tok) hoveredWordRef.current = null
                                  setHovered(null)
                                }}
                              >
                                {tok.text}
                              </span>
                            ) : (
                              <span key={i}>{tok.text}</span>
                            ),
                          )
                        : [...line.chinese].map((ch, i) => <span key={i}>{ch}</span>)}
                    </p>
                    {showPinyin && line.pinyin && <p className="un-line-pinyin">{line.pinyin}</p>}
                    {/* Per-line, unlike Read's single block: a dialogue line has
                        one speaker saying one thing, so this really is aligned
                        rather than a guess. */}
                    {showTranslation && line.english && (
                      <p className="un-line-english">{line.english}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            <aside className="un-newwords">
              <div className="un-newwords-head">
                <span className="un-newwords-title">New Words</span>
                {/* The chip used to repeat the heading it sits next to —
                    "New Words" twice on one line, which reads as a mistake.
                    It carries the count instead, which is the thing a reader
                    would actually want from a second mark there. */}
                {unit.vocabulary.length > 0 && (
                  <span className="un-newwords-chip">{unit.vocabulary.length}</span>
                )}
              </div>
              <div className="un-newwords-body">
                {unit.vocabulary.length === 0 ? (
                  <p className="un-newwords-empty">Add words in the Vocabulary tab.</p>
                ) : (
                  unit.vocabulary.map((w, i) => (
                    <div key={w.id} className="un-newword">
                      <span className="un-newword-badge">{i + 1}</span>
                      <span className="un-newword-hanzi">{w.hanzi}</span>
                      <span className="un-newword-meaning">
                        <span className="un-newword-pinyin">{w.pinyin}</span>
                        {w.translation && (
                          <span className="un-newword-translation">{w.translation}</span>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>

          {/* ---------- after the conversation ----------
              The conversation is the lesson; this is what follows it. Kept
              inside the Reading panel rather than made a tab of its own,
              because the point is that finishing the dialogue leads somewhere
              — a tab would just be another thing to notice and ignore. */}
          <div className="un-outro">
            {practiceCount > 0 && (
              <Link className="un-outro-cta" to={`/study/units/${unit.id}/quiz`}>
                Quick practice
                <span className="un-outro-sub">
                  {practiceCount} {practiceCount === 1 ? 'question' : 'questions'} from this
                  lesson
                </span>
              </Link>
            )}

            <div className="un-outro-nav">
              {/* Next stays INSIDE this topic. Nothing pushes a learner from
                  Ordering Food into an unrelated situation — the topic is the
                  only place progression means anything. */}
              {unit.next_unit && (
                <Link className="un-outro-next" to={`/study/units/${unit.next_unit.id}`}>
                  Next lesson: {unit.next_unit.title}
                </Link>
              )}
              <Link className="un-outro-back" to={backTo}>
                {isDaily ? 'Back to Daily Use' : 'Back to lessons'}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Grammar ---------- */}
      {activeTab === 'grammar' && (
        <>
          <div className="un-panel">
            {unit.grammar_points.length === 0 ? (
              <p className="un-empty">No grammar points yet.</p>
            ) : (
              <ul className="un-grammar">
                {unit.grammar_points.map((p, index) => (
                  <li key={p.id} className="un-grammar-item">
                    <div className="un-grammar-head">
                      <span className="un-grammar-num">{index + 1}</span>
                      <h3 className="un-grammar-title">{p.title}</h3>
                    </div>

                    {p.description && (
                      <div className="un-grammar-card">
                        <p className="un-grammar-desc">{p.description}</p>
                      </div>
                    )}

                    {p.structure && (
                      <div className="un-grammar-card raised">
                        <span className="un-grammar-tag">Structure</span>
                        <p className="un-grammar-structure">{p.structure}</p>
                      </div>
                    )}

                    {p.examples.length > 0 && (
                      <div className="un-grammar-card">
                        <span className="un-grammar-tag">Examples</span>

                        {p.examples.length === 0 ? (
                          <p className="un-grammar-empty">No examples yet.</p>
                        ) : (
                          p.examples.map((ex) => (
                            <div key={ex.id} className="un-grammar-example">
                              <div className="un-grammar-ex-cn">
                                <p className="un-grammar-ex-hanzi">{ex.chinese}</p>
                                {ex.pinyin && <p className="un-grammar-ex-pinyin">{ex.pinyin}</p>}
                              </div>
                              {ex.english && <p className="un-grammar-ex-en">{ex.english}</p>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ---------- Culture ---------- */}
      {activeTab === 'culture' && (
        <>
          {unit.culture_body ? (
            <div className="un-panel un-cu-panel">
              <article className="un-cu-card">
                <div className="un-cu-top">
                  <div className="un-cu-media">
                    <div className="un-cu-frame">
                      {images.length > 0 ? (
                        <img src={images[Math.min(slide, images.length - 1)].url} alt="" />
                      ) : (
                        <span className="un-cu-frame-empty">No photos yet</span>
                      )}
                    </div>

                    {images.length > 1 && (
                      <div className="un-cu-dots" role="tablist" aria-label="Photos">
                        {images.map((img, i) => (
                          <button
                            key={img.id}
                            type="button"
                            role="tab"
                            aria-selected={i === slide}
                            aria-label={`Photo ${i + 1}`}
                            className={'un-cu-dot' + (i === slide ? ' active' : '')}
                            onClick={() => setSlide(i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="un-cu-heads">
                    {unit.culture_title && <h3 className="un-cu-title">{unit.culture_title}</h3>}
                    {unit.culture_term && (
                      <p className="un-cu-term">
                        {unit.culture_term}
                        {unit.culture_term_pinyin && <span> - {unit.culture_term_pinyin}</span>}
                      </p>
                    )}
                  </div>
                </div>

                <div className="un-cu-body">
                  {unit.culture_body
                    .split(/\n\s*\n/)
                    .filter((p) => p.trim())
                    .map((para, i) => (
                      <p key={i}>{para.trim()}</p>
                    ))}
                </div>
              </article>
            </div>
          ) : (
            <div className="un-panel">
              <p className="un-empty">No culture note for this unit yet.</p>
            </div>
          )}
        </>
      )}

      {/* ---------- Quiz ----------
           The quiz runs on its own page now (/study/units/:id/quiz): authored
           questions and generated vocabulary rounds go through as one run, so
           it needs the whole width rather than a tab panel. This is the way in. */}
      {activeTab === 'quiz' && (
        <div className="un-panel un-quiz-panel">
          <StudyQuizLauncher
            unitId={unit.id}
            questionCount={(unit.quiz_questions || []).length}
            vocabulary={unit.vocabulary || []}
          />
        </div>
      )}

      {showEdit && user?.is_admin && (
        <StudyUnitEditDrawer
          token={token}
          unit={unit}
          initialTab={activeLabel}
          onChange={(updated) => setUnit((prev) => ({ ...prev, ...updated }))}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* The shared popover, so a word means the same thing and looks the same
          whether it is met in an article, a podcast, a scan or a dialogue. */}
      <WordPopover
        word={hovered?.tok}
        rect={hovered?.rect}
        saved={!!savedWords[hovered?.tok?.text]}
      />
    </div>
  )
}
