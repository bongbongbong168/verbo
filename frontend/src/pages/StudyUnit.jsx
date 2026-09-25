import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { isFresh, readCache, writeCache } from '../dataCache'
import { noteRecentView } from '../recentViews'
import { completeLesson } from '../studyProgress'
import Skeleton, { SkeletonText } from '../components/Skeleton'
import StudyQuizLauncher from '../components/StudyQuizLauncher'
import StudyUnitEditDrawer from '../components/StudyUnitEditDrawer'
import ReaderSwitch from '../components/ReaderSwitch'
import WordPopover from '../components/WordPopover'
import WordExplainer from '../components/WordExplainer'
import SentenceSavePopover from '../components/SentenceSavePopover'
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

/* The 24-grid, 1.7-stroke set the rest of the app uses. A plus for "add this",
   a tick once it is in — the state is the GLYPH, not a colour, so it survives
   being looked at in greyscale or by someone who cannot tell the two fills
   apart. */
function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  )
}

function TickIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}

/* The lesson footer's arrows. DRAWN, not the `&lsaquo;` / `&rsaquo;` glyphs
   they replaced: those sit on their own baseline and ride high beside a
   two-line label, they carry the font's weight rather than the icon set's,
   and they cannot be sized without changing the line box around them. */
function NavChevron({ dir }) {
  return (
    <svg
      className="un-lessonnav-chev"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === 'back' ? 'm14.5 5-7 7 7 7' : 'm9.5 5 7 7-7 7'} />
    </svg>
  )
}

/* Play / Stop for the whole conversation. Solid fills rather than the stroked
   set above, because at 16px a stroked triangle reads as an outline arrow
   rather than a play control. */
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5.603 5.14v13.72a1 1 0 0 0 1.53.85l10.79-6.86a1 1 0 0 0 0-1.7L7.133 4.29A1 1 0 0 0 5.603 5.14z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
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
  const sentenceScopeRef = useRef(null)
  /* Whether the whole conversation is playing. Mirrored into a ref because the
     chain of `onend` callbacks is created once and cannot see later state —
     without it, pressing stop would be ignored and the dialogue would run to
     the end regardless. */
  const [playingAll, setPlayingAll] = useState(false)
  const playingAllRef = useRef(false)

  const [activeTab, setActiveTab] = useState('vocabulary')
  /* Which word's explanation dialog is open, or null. Replaced a map of
     expanded rows: the panel now carries a paragraph, a character table and
     three example sentences, which pushed every word below it down the page
     when it opened inline. */
  const [explaining, setExplaining] = useState(null)
  const [speakingId, setSpeakingId] = useState(null)
  /* The playback that currently owns `speakingId` - see `speakText`. */
  const playbackRef = useRef(null)
  /* Clips made during this visit (`word-12` / `line-40` -> url), so a word
     played twice asks the server once. */
  const clipUrlsRef = useRef({})

  const [showEdit, setShowEdit] = useState(false)

  // Which reading text is on screen. Selection is a reader concern, so it stays
  // on the page even though adding and deleting texts moved into the drawer.
  const [activeTextId, setActiveTextId] = useState(null)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    loadUnit()
  }, [token, id])

  /* A NEW LESSON STARTS AT THE TOP. The router keeps this page mounted
     between lessons and does not reset scroll, so pressing Next - which lives
     at the bottom - landed you at the bottom of the next lesson, past its
     title and its tabs. Keyed on `id` alone so saving a word or switching a
     tab never jumps the page. */
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  /* Seeded from the shared cache rather than converted to `useApiData`: the
     unit lives in BOTH state and a ref (the Alt+1 listener reads the ref to
     dodge a stale closure) and is rewritten by the edit drawer, so priming the
     initial value is the surgical change. Reopening a lesson then paints
     immediately instead of waiting on a request that may stall for seconds. */
  function loadUnit() {
    const key = `study-unit:${id}`
    const cached = readCache(key)

    /* A Daily Use lesson opens on its CONVERSATION, not on the word list. The
       situation is the point — you came here to learn how the exchange goes,
       and the vocabulary is what you pick up on the way. An HSK lesson is the
       other way round: the words are the syllabus and the passage is practice,
       so it keeps Vocabulary first.

       Applied at most ONCE per load, which is why the flag exists: on the
       stale-cache path the unit arrives twice (cache, then the refetch), and
       setting the tab again on the second arrival would yank the reader off a
       tab they had since chosen for themselves. */
    let tabApplied = false
    const applyTab = (data) => {
      if (tabApplied) return
      tabApplied = true
      /* BOTH BRANCHES SET IT, not only the Daily Use one. Moving to the next
         lesson changes the URL but React keeps this same component mounted, so
         `activeTab` carried over from the lesson you left - finish lesson 1 on
         its Quiz tab, press Next, and lesson 2 opened on its Quiz too. Each
         lesson now opens on its own first tab. */
      setActiveTab(
        data.level?.category === 'daily' && (data.texts || []).length ? 'reading' : 'vocabulary',
      )
    }

    if (cached) {
      setUnit(cached)
      unitRef.current = cached
      applyTab(cached)
      setLoading(false)
      if (isFresh(key)) {
        // Opening it again is a real visit, and the Dashboard's recency row is
        // built from exactly this — so record it and drop that cached row.
        noteRecentView(token, 'study_unit', id)
        return
      }
    } else {
      setLoading(true)
    }

    api
      .getStudyUnit(token, id)
      .then((data) => {
        setUnit(data)
        // Mirrored for the Alt+1 listener, which cannot see this state.
        unitRef.current = data
        writeCache(key, data)
        applyTab(data)
        // Record the visit so the Dashboard's "Pick up where you left off"
        // tile can point back here. Fire-and-forget: a failure must not stop
        // the page rendering, and there is nothing useful to tell the user.
        noteRecentView(token, 'study_unit', id)
      })
      // Only a failure that leaves the page with nothing is worth showing.
      .catch((err) => !unitRef.current && setError(err.message))
      .finally(() => setLoading(false))
  }

  function speak(word) {
    speakText(word.hanzi, word.id, { kind: 'word', id: word.id, url: word.audio_url })
  }

  /** Stop whatever is playing, whichever voice it is using. */
  function stopVoice() {
    const current = playbackRef.current
    playbackRef.current = null
    current?.stop()
  }

  /**
   * Say one piece of Chinese aloud.
   *
   * A NATURAL VOICE FIRST, THE BROWSER'S AS A FALLBACK. The browser's own
   * speech synthesis sounded robotic and differed per device, so Study now
   * plays clips made by Gemini's TTS model (see SpeechService): a clip that
   * already exists arrives as `url` on the unit payload and is just a file;
   * one nobody has played yet is made on the server the first time (a few
   * seconds) and remembered here. No key, a quota refusal or a failed file
   * all drop to the browser's voice, so a word is never unplayable. A clip
   * never goes stale: editing a line changes its text, which changes the
   * clip the server looks up.
   *
   * `onDone(ok)` fires once, when THIS playback ends by itself - never after
   * it was replaced or stopped. That guard is the old utterance rule kept:
   * stopping one voice fires its end callback a moment LATER, after the next
   * word has been marked as speaking, and unguarded that late callback wiped
   * the new word's indicator (clicking quickly from word to word showed no
   * bars at all).
   */
  function speakText(text, id, source, onDone) {
    if (!text) return
    stopVoice()
    const handle = {
      stopped: false,
      audio: null,
      stop() {
        this.stopped = true
        if (this.audio) this.audio.pause()
        if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
      },
    }
    playbackRef.current = handle
    setSpeakingId(id)

    const finish = (ok) => {
      if (playbackRef.current !== handle) return
      playbackRef.current = null
      setSpeakingId(null)
      onDone?.(ok)
    }
    const browserVoice = () => {
      if (handle.stopped) return
      if (typeof window === 'undefined' || !window.speechSynthesis) return finish(false)
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      utterance.rate = 0.85
      utterance.onend = () => finish(true)
      utterance.onerror = () => finish(false)
      window.speechSynthesis.speak(utterance)
    }
    const playFile = (url) => {
      if (handle.stopped) return
      const audio = new Audio(url)
      handle.audio = audio
      audio.onended = () => finish(true)
      const fallback = () => {
        handle.audio = null
        browserVoice()
      }
      audio.onerror = fallback
      audio.play().catch(fallback)
    }

    const key = source && `${source.kind}-${source.id}`
    const known = source && (source.url || clipUrlsRef.current[key])
    if (known) return playFile(known)
    if (source && unitRef.current?.speech_available) {
      api
        .studySpeech(token, source.kind, source.id)
        .then((r) => {
          clipUrlsRef.current[key] = r.url
          playFile(r.url)
        })
        .catch(browserVoice)
      return
    }
    browserVoice()
  }

  // Leaving the page stops the voice rather than letting it talk over the next.
  useEffect(() => stopVoice, [])

  /** Is speech available at all? Used to hide the controls rather than offer
   *  buttons that would do nothing. */
  const canSpeak =
    Boolean(unit?.speech_available) || (typeof window !== 'undefined' && !!window.speechSynthesis)

  /**
   * Read the whole conversation, line by line, highlighting the current one.
   *
   * Chained on each utterance's `onend` rather than queued all at once: the
   * queue would play correctly but there would be no way to know which line is
   * being spoken, and the highlight is most of the point. Pressing it again
   * while playing stops — a play button with no way to stop is a trap on a
   * long dialogue.
   */
  /* Completing the full listening run updates the current lesson immediately;
     the persistence helper keeps the unit and level caches in step. */
  function completeCurrentLesson() {
    const current = unitRef.current
    if (!current || current.completed) return
    setUnit((prev) => {
      if (!prev) return prev
      const next = { ...prev, completed: true }
      unitRef.current = next
      return next
    })
    completeLesson(token, current.id).catch(() => {})
  }

  function stopConversation() {
    playingAllRef.current = false
    stopVoice()
    setPlayingAll(false)
    setSpeakingId(null)
  }

  function playConversation() {
    if (!canSpeak || !currentText?.lines?.length) return

    if (playingAllRef.current) {
      stopConversation()
      return
    }

    const lines = currentText.lines.filter((l) => l.chinese)
    setPlayingAll(true)

    const sayFrom = (i) => {
      // Stopped.
      if (!playingAllRef.current) return
      /* Played through to the last line: that is finishing the lesson's
         listening, so the lesson counts as done. Stopping part-way does not. */
      if (i >= lines.length) {
        completeCurrentLesson()
        playingAllRef.current = false
        setPlayingAll(false)
        setSpeakingId(null)
        return
      }
      const line = lines[i]
      /* `onDone` only fires when this line ends by itself (see speakText), so
         a line replaced or stopped mid-conversation cannot advance the chain. */
      speakText(line.chinese, `line-${line.id}`, { kind: 'line', id: line.id, url: line.audio_url }, (ok) => {
        if (!playingAllRef.current) return
        if (!ok) {
          playingAllRef.current = false
          setPlayingAll(false)
          return
        }
        sayFrom(i + 1)
      })
    }

    playingAllRef.current = true
    sayFrom(0)
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

  if (loading)
    return (
      <div className="un">
        <Skeleton style={{ height: 15, width: 210, marginBottom: '1.3rem' }} />
        <Skeleton style={{ height: 32, width: '52%', marginBottom: '1.2rem' }} />
        <Skeleton style={{ height: 40, borderRadius: 10, marginBottom: '1.4rem' }} />
        <SkeletonText lines={8} />
      </div>
    )
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
  /* A Daily Use topic is a situation, an HSK level is a rung. The wording of
     the way out should say which one you came from rather than a generic
     "Back". */
  const isDaily = unit.level?.category === 'daily'
  const backTo = unit.level ? `/study/${unit.level.id}` : '/study'

  /* The short name for a neighbouring lesson. Titles are authored as
     `中文 - English`, which is far too long for a footer button, so the lesson
     label (第三课) is preferred and the English half is the fallback for a
     topic whose lessons carry no labels — Daily Use situations mostly do not.
     The split only counts when the left side actually holds Han characters, or
     an English title with a hyphen in it would be cut in half. */
  const shortName = (u) => {
    if (!u) return ''
    if (u.lesson_label) return u.lesson_label
    const parts = (u.title || '').match(/^(.*?)\s*[-–—]\s*(.+)$/)
    return parts && /[一-鿿]/.test(parts[1]) ? parts[2].trim() : u.title || ''
  }

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
                        /* Always available now. It used to be disabled unless
                           an admin had written an explanation — which nobody
                           had, so every word on the page was greyed out. The
                           dialog it opens always has something real to say:
                           the meaning, what the characters contribute, and
                           sentences the word appears in. */
                        onClick={() => setExplaining(w)}
                        title="What it means and how it is used"
                      >
                        Explain
                      </button>

                      {/* Straight into the flashcard bank, through the same
                          handler Alt+1 uses on the conversation — so a word
                          saved here is deduped against one saved there, keeps
                          whichever source it was FIRST met in, and lands in the
                          same place. The shape it expects is {text, pinyin,
                          translation}, which is not what a vocabulary row is
                          called, hence the mapping. */}
                      <button
                        type="button"
                        className={
                          'un-save-btn' + (savedWords[w.hanzi] ? ' saved' : '')
                        }
                        onClick={() =>
                          handleSaveWord({
                            text: w.hanzi,
                            pinyin: w.pinyin,
                            translation: w.translation,
                          })
                        }
                        disabled={!!savedWords[w.hanzi]}
                        aria-label={
                          savedWords[w.hanzi]
                            ? `${w.hanzi} is in your flashcards`
                            : `Save ${w.hanzi} to your flashcards`
                        }
                        title={
                          savedWords[w.hanzi]
                            ? 'Saved to your flashcards'
                            : 'Save to your flashcards'
                        }
                      >
                        {savedWords[w.hanzi] ? <TickIcon /> : <PlusIcon />}
                      </button>

                      {/* Same playing indicator as a dialogue line's button, so
                          "this is talking" looks one way on the page: filled,
                          moving bars, and a second press stops it. */}
                      <button
                        type="button"
                        className={'un-speak-btn' + (speakingId === w.id ? ' speaking' : '')}
                        onClick={() => {
                          if (speakingId === w.id) {
                            stopVoice()
                            setSpeakingId(null)
                            return
                          }
                          speak(w)
                        }}
                        aria-label={speakingId === w.id ? `Stop ${w.hanzi}` : `Pronounce ${w.hanzi}`}
                        aria-pressed={speakingId === w.id}
                      >
                        {speakingId === w.id ? (
                          <span className="un-eq" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : (
                          <SpeakerIcon />
                        )}
                      </button>
                    </div>

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
                  a play button that can only do nothing is worse than none.

                  An ICON rather than a label: it sits beside two switches whose
                  words are the thing you read, and "Play conversation" was the
                  widest item in the row for an action whose glyph is universal.
                  The name survives in `aria-label` and the tooltip, so nothing
                  is lost to a screen reader or to a pointer that pauses. */}
              {canSpeak && (
                <button
                  type="button"
                  className={'un-play-all' + (playingAll ? ' on' : '')}
                  onClick={playConversation}
                  aria-pressed={playingAll}
                  aria-label={playingAll ? 'Stop the conversation' : 'Play the conversation'}
                  title={playingAll ? 'Stop' : 'Play conversation'}
                >
                  {playingAll ? <StopIcon /> : <PlayIcon />}
                </button>
              )}
              <ReaderSwitch
                label="Pinyin"
                on={showPinyin}
                onChange={() => setShowPinyin((v) => !v)}
              />
              <ReaderSwitch
                label="Translation"
                on={showTranslation}
                onChange={() => setShowTranslation((v) => !v)}
                disabled={!hasEnglish}
                title={
                  hasEnglish
                    ? 'Show the English translation'
                    : 'No English for this conversation yet'
                }
              />
            </span>
          </div>

          <div ref={sentenceScopeRef} className="un-reading-body">
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
                    {canSpeak && (() => {
                      const lineId = `line-${line.id}`
                      const playing = speakingId === lineId
                      return (
                        /* ON THE RIGHT OF THE LINE, and it says when it is
                           talking. It sat above the text on the left, where it
                           read as a label rather than a control, and nothing
                           changed while the line was being spoken - you pressed
                           it and had to listen to find out whether it worked.
                           While this line plays the button fills and its glyph
                           becomes moving bars; pressing it then stops the line.
                           The playing look is a CLASS, so it is right on the
                           first frame; the bars' motion is only decoration. */
                        <button
                          type="button"
                          className={'un-line-say' + (playing ? ' playing' : '')}
                          onClick={() => {
                            if (playing && !playingAllRef.current) {
                              stopVoice()
                              setSpeakingId(null)
                              return
                            }
                            /* A single line pressed mid-conversation takes
                               over: the conversation stops, this line plays. */
                            if (playingAllRef.current) {
                              playingAllRef.current = false
                              setPlayingAll(false)
                            }
                            speakText(line.chinese, lineId, {
                              kind: 'line',
                              id: line.id,
                              url: line.audio_url,
                            })
                          }}
                          aria-label={playing ? 'Stop this line' : 'Play this line'}
                          aria-pressed={playing}
                          title={playing ? 'Stop' : 'Play this line'}
                        >
                          {playing ? (
                            <span className="un-eq" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </span>
                          ) : (
                            <SpeakerIcon />
                          )}
                        </button>
                      )
                    })()}
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
                                  hoveredWordRef.current = null
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

          {/* The end-of-reading block that used to sit here is gone. Both of
              its jobs already had a home: practice is the Quiz tab at the top
              of this page, and the way back is the breadcrumb — plus the
              lesson footer below, which carries "Back to lessons" once there
              is no next lesson to offer. */}
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

      {/* ---------- lesson to lesson ----------
           Page-level, below whichever tab is open, because moving to the next
           lesson is a fact about the LESSON rather than about the panel you
           happen to be reading — burying it in one tab would hide it from
           someone who came for the vocabulary and finished there.

           Only rendered when the topic actually has more than one lesson, and
           each side only when that neighbour exists: the ends of a topic get a
           single button rather than a disabled one, since a control that
           cannot ever do anything is worse than its absence. `justify-content:
           space-between` on one child would pull it left, so the empty side
           holds a spacer and Next stays on the right at lesson 1. */}
      {/* The wrapper is only a size container: the bar stacks by its OWN
          width, which the sidebar makes very different from the window's. */}
      <div className="un-lessonnav-wrap">
        <nav className="un-lessonnav" aria-label="Lessons in this topic">
          {unit.previous_unit ? (
            <Link className="un-lessonnav-prev" to={`/study/units/${unit.previous_unit.id}`}>
              <NavChevron dir="back" />
              {/* TWO LINES, not "Previous: 第二课" on one. The label and the
                  lesson's name are different kinds of thing — one says which
                  way you are going, the other says where — and running them
                  together behind a colon read as a sentence that had been cut
                  in half. */}
              <span className="un-lessonnav-stack">
                <span className="un-lessonnav-way">Previous</span>
                <span className="un-lessonnav-name">{shortName(unit.previous_unit)}</span>
              </span>
            </Link>
          ) : (
            <span className="un-lessonnav-state">
              <span className="un-lessonnav-state-label">Lesson status</span>
              <strong>{unit.completed ? 'Complete' : 'In progress'}</strong>
            </span>
          )}

          {unit.next_unit ? (
            <Link className="un-lessonnav-next" to={`/study/units/${unit.next_unit.id}`}>
              <span className="un-lessonnav-stack">
                <span className="un-lessonnav-way">Next</span>
                <span className="un-lessonnav-name">{shortName(unit.next_unit)}</span>
              </span>
              <NavChevron dir="forward" />
            </Link>
          ) : (
            <Link className="un-lessonnav-next" to={backTo}>
              {/* The last lesson has nowhere further to go, so this one line
                  is the whole label — no "Next" eyebrow over it, because it
                  is not a next lesson. */}
              <span className="un-lessonnav-name un-lessonnav-name-solo">
                {isDaily ? 'Back to Daily Use' : 'Back to lessons'}
              </span>
              <NavChevron dir="forward" />
            </Link>
          )}
        </nav>
      </div>

      {showEdit && user?.is_admin && (
        <StudyUnitEditDrawer
          token={token}
          unit={unit}
          initialTab={activeLabel}
          /* Merged into the cache as well as the state, or leaving the page and
             coming back inside the freshness window would restore the
             pre-edit unit. `StudyUnitController::update` returns the bare
             model with no relations, which is why this merges rather than
             replaces — assigning it wholesale would wipe vocabulary/texts. */
          onChange={(updated) => {
            // An edit can change a speaker's voice; forget this visit's clips
            // so the next play asks the server for the right one.
            clipUrlsRef.current = {}
            setUnit((prev) => {
              const next = { ...prev, ...updated }
              unitRef.current = next
              writeCache(`study-unit:${id}`, next)
              return next
            })
          }}
          onClose={() => setShowEdit(false)}
        />
      )}

      {explaining && (
        <WordExplainer
          token={token}
          word={explaining}
          onClose={() => setExplaining(null)}
        />
      )}

      {/* The shared popover, so a word means the same thing and looks the same
          whether it is met in an article, a podcast, a scan or a dialogue. */}
      <WordPopover
        word={hovered?.tok}
        rect={hovered?.rect}
        saved={!!savedWords[hovered?.tok?.text]}
      />
      <SentenceSavePopover
        scopeRef={sentenceScopeRef}
        token={token}
        sourceModule="study"
        sourceType="study_unit"
        sourceId={unit.id}
        tokens={(currentText?.lines || []).flatMap((line) => line.tokens || [])}
        onSaved={setLastSaved}
      />
    </div>
  )
}
