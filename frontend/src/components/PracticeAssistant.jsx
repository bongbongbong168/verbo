import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import graduateBot from '../assets/assistant/graduate-bot.png'
import './PracticeAssistant.css'

/**
 * The floating Chinese practice assistant.
 *
 * Mounted once in `Layout`, which is what makes it follow the learner: the
 * component never unmounts as you move between Read, a podcast and a study
 * unit, so the conversation is still there when you reopen it. That is the
 * whole point of a floating panel rather than a page — you ask "is this
 * sentence right?" without leaving the thing you were reading.
 *
 * THE KEY IS NOT HERE. The widget posts to Laravel, Laravel calls Gemini.
 * Nothing in this file knows an API key exists.
 */

/* Matches PracticeChatController::TOPICS. Held here as a floor for the first
   paint; the real list rides along in the status response, so the server's
   validator and these chips cannot drift. */
const FALLBACK_TOPICS = ['Daily Chat', 'Travel', 'Food', 'Work', 'HSK', 'Free Chat']

const GREETING = {
  role: 'model',
  text: '你好！I can practise Chinese with you, fix your grammar, or explain a word.\nNǐ hǎo! Type anything — Chinese or English.',
}

function AiIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v2.2" />
      <rect x="4" y="5.2" width="16" height="13" rx="4" />
      <path d="M9.2 10.5v1.6M14.8 10.5v1.6" />
      <path d="M9.5 14.6c1.6 1 3.4 1 5 0" />
      <path d="M2.6 11v2.4M21.4 11v2.4" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 12 16-8-6 16-2.6-6.2z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <rect x="9.2" y="3" width="5.6" height="10" rx="2.8" />
      <path d="M5.5 11.2a6.5 6.5 0 0 0 13 0M12 17.7V21" />
    </svg>
  )
}

export default function PracticeAssistant() {
  const { token } = useAuth()

  const [available, setAvailable] = useState(false)
  const [topics, setTopics] = useState(FALLBACK_TOPICS)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([GREETING])
  const [draft, setDraft] = useState('')
  const [topic, setTopic] = useState(null)
  const [sending, setSending] = useState(false)
  /* How far the panel has been nudged from its CSS corner, in `#root`'s own
     pixels. Null until it is moved, so it sits in the default corner via CSS
     rather than needing a position measured on first paint. */
  const [pos, setPos] = useState(null)

  const panelRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const dragRef = useRef(null)

  /* Asked once. An install with no GEMINI_API_KEY renders nothing at all —
     a button that can only ever error is worse than no button. */
  useEffect(() => {
    if (!token) return
    let live = true
    api
      .getPracticeChatStatus(token)
      .then((s) => {
        if (!live) return
        setAvailable(Boolean(s.available))
        if (Array.isArray(s.topics) && s.topics.length) setTopics(s.topics)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [token])

  // Newest message in view, and the caret ready, whenever either changes.
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, open, sending])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  /*
   * THE DRAG IS A TRANSFORM, NOT `left`/`top`, and that is deliberate.
   *
   * `#root` carries `zoom`, and the first version wrote absolute `left`/`top`
   * with everything divided by `--app-scale` — the conversion `WordPopover`
   * needs. Measured, it was right sideways and wrong downwards: the painted
   * rect came back at 1.1045x the written `left` but 1.1837x the written
   * `top`, so the panel lagged the pointer by ~12px vertically. A zoomed
   * ancestor is a containing block for a fixed child, so those offsets are not
   * simply the viewport scaled, and guessing the origin is how that drift
   * appears.
   *
   * A translation has no origin to get wrong. The panel keeps its CSS corner
   * anchoring and is nudged from it, so only the DELTA is converted — one
   * divide by the scale, nothing assumed about what the offsets resolve
   * against. Clamping is done in painted pixels, where the rect and the
   * viewport are already in the same units, and solved back into the
   * translation.
   */
  const scale = () => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--app-scale')
    const n = parseFloat(raw)
    return Number.isFinite(n) && n > 0 ? n : 1
  }

  const onDragStart = (e) => {
    // Never start a drag from the buttons living in the same bar.
    if (e.target.closest('button')) return
    const panel = panelRef.current
    if (!panel) return

    const box = panel.getBoundingClientRect()
    dragRef.current = {
      pointer: { x: e.clientX, y: e.clientY },
      from: pos ?? { x: 0, y: 0 },
      box, // painted pixels, for the clamp
    }
    /* Capture keeps the drag alive when the pointer outruns the header, but
       it throws if that pointer is already gone — and an uncaught throw here
       would abandon the drag before it started. The drag works without
       capture; it just stops tracking outside the element, which is strictly
       better than not moving at all. */
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* no capture available — the move handler still runs */
    }
  }

  const onDragMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const s = scale()

    // How far the pointer has travelled, in painted pixels.
    let movedX = e.clientX - d.pointer.x
    let movedY = e.clientY - d.pointer.y

    /* Keep the panel on screen. Rect and viewport are both painted pixels
       here, so this comparison needs no conversion at all — which is exactly
       why the clamp lives on this side of the divide. */
    movedX = Math.min(Math.max(movedX, -d.box.left), window.innerWidth - d.box.right)
    movedY = Math.min(Math.max(movedY, -d.box.top), window.innerHeight - d.box.bottom)

    // One divide, at the last moment: a CSS length inside #root is scaled up.
    setPos({ x: d.from.x + movedX / s, y: d.from.y + movedY / s })
  }

  const onDragEnd = (e) => {
    dragRef.current = null
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* nothing to release */
    }
  }

  const send = useCallback(
    async (text) => {
      const body = text.trim()
      if (!body || sending) return

      const next = [...messages, { role: 'user', text: body }]
      setMessages(next)
      setDraft('')
      setSending(true)

      try {
        /* The greeting is ours, not the model's — sending it back would have
           the assistant answering a line it never wrote. */
        const history = next.filter((m) => m !== GREETING).slice(-12)
        const res = await api.sendPracticeChat(token, { messages: history, topic })
        setMessages((prev) => [...prev, { role: 'model', text: res.reply }])
      } catch (err) {
        /* Shown as a bubble rather than a banner: it is a reply to what was
           just asked, and it belongs in the thread beside it. */
        setMessages((prev) => [
          ...prev,
          { role: 'model', text: err.message || 'Something went wrong. Try again.', failed: true },
        ])
      } finally {
        setSending(false)
      }
    },
    [messages, sending, token, topic],
  )

  if (!token || !available) return null

  /* Always a transform, even at rest.
     The drag offset and the open animation are two different transforms, so
     they get two different elements: the anchor is nudged, the card inside it
     is animated. One element doing both meant the FIRST drag changed which
     kind of transform the element had — measured, it landed 11.7px below the
     pointer on that drag alone while every later one was exact. */
  const anchorStyle = { transform: `translate(${pos?.x ?? 0}px, ${pos?.y ?? 0}px)` }

  /* Minimised and closed are the same resting state on purpose: both put the
     learner back at one small button, which is the thing the brief asks for
     ("reduce it back to a small floating AI button"). What differs is the
     thread — closing keeps it too, so reopening never loses the conversation. */
  if (!open) {
    return (
      <button
        type="button"
        className="pa-fab"
        onClick={() => setOpen(true)}
        aria-label="Open the Chinese practice assistant"
        title="Practice Chinese with AI"
      >
        {/* The supplied graduate bot is decorative; the button already names
            the action for assistive technology. */}
        <img className="pa-fab-bot" src={graduateBot} alt="" />
      </button>
    )
  }

  return (
    <div ref={panelRef} className="pa-anchor" style={anchorStyle}>
    <section
      className="pa"
      role="dialog"
      aria-label="AI Chinese Practice"
    >
      <header
        className="pa-head"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span className="pa-head-mark" aria-hidden="true">
          <AiIcon />
        </span>
        <span className="pa-head-text">
          <strong>AI Chinese Practice</strong>
          <em>Practice Chinese with AI</em>
        </span>
        <span className="pa-head-actions">
          <button
            type="button"
            className="pa-icon-btn"
            onClick={() => setOpen(false)}
            aria-label="Minimise the assistant"
            title="Minimise"
          >
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 12h12" />
            </svg>
          </button>
          <button
            type="button"
            className="pa-icon-btn"
            onClick={() => {
              setOpen(false)
              setMessages([GREETING])
              setTopic(null)
            }}
            aria-label="Close the assistant and clear the chat"
            title="Close"
          >
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>
      </header>

      {/* Topics steer the practice; picking the active one again clears it,
          so there is no separate "off" chip to explain. */}
      <div className="pa-topics" role="group" aria-label="Practice topic">
        {topics.map((t) => (
          <button
            key={t}
            type="button"
            className={'pa-topic' + (topic === t ? ' on' : '')}
            aria-pressed={topic === t}
            onClick={() => setTopic((cur) => (cur === t ? null : t))}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="pa-list" ref={listRef}>
        {messages.map((m, i) => (
          <p
            key={i}
            className={
              'pa-msg pa-msg-' + (m.role === 'user' ? 'user' : 'ai') + (m.failed ? ' failed' : '')
            }
          >
            {m.text}
          </p>
        ))}

        {sending && (
          /* Three dots that are VISIBLE at frame 0 and only bob after that.
             An indicator whose keyframes start invisible shows nothing at all
             in a tab that is not compositing — the same rule every `*-in`
             animation in this app follows. */
          <p className="pa-typing" aria-label="The assistant is typing">
            <i /><i /><i />
          </p>
        )}
      </div>

      <form
        className="pa-compose"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <textarea
          ref={inputRef}
          className="pa-input"
          rows={1}
          value={draft}
          placeholder="Type in Chinese..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — a textarea rather
            // than an input so a two-line question is possible at all.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(draft)
            }
          }}
        />
        {/* Dictation is the browser's own, and it is only offered where the
            browser actually has it — a mic that does nothing on Firefox would
            be a button that lies. */}
        <DictateButton onText={(t) => setDraft((d) => (d ? d + ' ' + t : t))} />
        <button
          type="submit"
          className="pa-send"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          title="Send"
        >
          <SendIcon />
        </button>
      </form>
    </section>
    </div>
  )
}

/**
 * Speech-to-text, using whatever the browser ships.
 *
 * Renders NOTHING where `SpeechRecognition` is missing. `lang` is set to
 * Mandarin because that is what this box is for; the result is dropped into
 * the draft rather than sent, so a misheard sentence can be fixed before it
 * goes.
 */
function DictateButton({ onText }) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)

  const Supported =
    typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => () => recRef.current?.stop(), [])

  if (!Supported) return null

  const toggle = () => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new Supported()
    rec.lang = 'zh-CN'
    rec.interimResults = false
    rec.onresult = (e) => onText(e.results[0][0].transcript)
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  return (
    <button
      type="button"
      className={'pa-mic' + (listening ? ' on' : '')}
      onClick={toggle}
      aria-label={listening ? 'Stop dictating' : 'Dictate in Chinese'}
      title={listening ? 'Stop' : 'Speak'}
    >
      <MicIcon />
    </button>
  )
}
