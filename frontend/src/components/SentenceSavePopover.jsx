import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import './SentenceSavePopover.css'

const WIDTH = 300
const GAP = 10
const EDGE = 12

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 4.5h11v15l-5.5-3.4-5.5 3.4z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

/* Browser selection text includes visible pinyin children. Clone the selected
   DOM and remove only those annotation nodes, preserving real mixed text such
   as “AI 数字人” rather than guessing that every Latin letter is pinyin. */
function selectedContent(range) {
  const fragment = range.cloneContents()
  const pinyinSelector =
    '.rd-word-py, .pe-word-py, .sd-token-py, .tt-py, .un-line-pinyin, .un-vocab-pinyin, .un-newword-pinyin'
  const pinyinNodes = [...(fragment.querySelectorAll?.(pinyinSelector) || [])]
  const pinyin = pinyinNodes
    .map((node) => node.textContent?.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  pinyinNodes.forEach((node) => node.remove())

  return {
    text: (fragment.textContent || '').replace(/\s+/g, ' ').trim(),
    pinyin,
  }
}

function pinyinFromTokens(text, tokens) {
  const compact = (value) => String(value || '').replace(/\s+/g, '')
  const target = compact(text)
  const list = Array.isArray(tokens) ? tokens.flat(Infinity).filter(Boolean) : []
  if (!target || !list.length) return ''

  const pieces = list.map((item) => compact(item.text))
  const whole = pieces.join('')
  const start = whole.indexOf(target)
  if (start < 0) return ''

  const end = start + target.length
  const readings = []
  let offset = 0
  list.forEach((item, index) => {
    const next = offset + pieces[index].length
    if (next > start && offset < end && item.pinyin) readings.push(item.pinyin)
    offset = next
  })

  return readings.join(' ').replace(/\s+/g, ' ').trim()
}

export default function SentenceSavePopover({
  scopeRef,
  token,
  sourceModule,
  sourceType,
  sourceId,
  tokens,
  onSaved,
}) {
  const [selection, setSelection] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState(false)
  const [translation, setTranslation] = useState('')
  const [translating, setTranslating] = useState(false)
  const [translationFailed, setTranslationFailed] = useState(false)
  const popoverRef = useRef(null)
  const tokensRef = useRef(tokens)
  const translationRequestRef = useRef(null)

  useEffect(() => {
    tokensRef.current = tokens
  }, [tokens])

  useEffect(() => {
    function readSelection(event) {
      if (popoverRef.current?.contains(event.target)) return

      const selected = window.getSelection()
      const scope = scopeRef.current
      if (!scope || !selected || selected.isCollapsed || !selected.rangeCount) {
        setSelection(null)
        return
      }

      const range = selected.getRangeAt(0)
      if (!scope.contains(range.commonAncestorContainer)) {
        setSelection(null)
        return
      }

      const content = selectedContent(range)
      const { text } = content
      const pinyin = content.pinyin || pinyinFromTokens(text, tokensRef.current)
      const hanCount = (text.match(/\p{Script=Han}/gu) || []).length
      if (hanCount === 0 || text.length < 2 || text.length > 255) {
        setSelection(null)
        return
      }

      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) return

      const scale =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--app-scale'),
        ) || 1
      const viewportWidth = window.innerWidth / scale
      const centre = (rect.left + rect.width / 2) / scale
      const half = WIDTH / 2
      const x = Math.min(
        Math.max(centre, EDGE + half),
        viewportWidth - EDGE - half,
      )
      const below = rect.top < 170

      setSaved(false)
      setFailed(false)
      setSelection({
        text,
        pinyin,
        x,
        y: below ? rect.bottom / scale + GAP : rect.top / scale - GAP,
        below,
        arrow: centre - x,
      })
    }

    function dismiss(event) {
      if (!popoverRef.current?.contains(event.target)) setSelection(null)
    }

    const close = () => setSelection(null)
    document.addEventListener('mouseup', readSelection)
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mouseup', readSelection)
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [scopeRef])

  useEffect(() => {
    document.body.classList.toggle('sentence-selection-active', !!selection)
    return () => document.body.classList.remove('sentence-selection-active')
  }, [selection])

  useEffect(() => {
    if (!selection?.text) {
      setTranslation('')
      setTranslating(false)
      setTranslationFailed(false)
      translationRequestRef.current = null
      return undefined
    }

    let active = true
    setTranslation('')
    setTranslationFailed(false)
    setTranslating(true)

    const request = api.translateSentence(token, selection.text)
    translationRequestRef.current = request
    request
      .then((result) => {
        if (active) setTranslation(result.translation || '')
        return result
      })
      .catch(() => {
        if (active) setTranslationFailed(true)
      })
      .finally(() => {
        if (active) setTranslating(false)
      })

    return () => { active = false }
  }, [selection?.text, token])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!selection) return null

  async function saveSentence() {
    if (busy || saved) return
    setBusy(true)
    try {
      let finalTranslation = translation
      if (!finalTranslation && translationRequestRef.current) {
        try {
          const result = await translationRequestRef.current
          finalTranslation = result.translation || ''
        } catch {
          // Translation should not prevent someone from keeping the sentence.
        }
      }

      await api.addFlashcard(token, {
        word: selection.text,
        card_type: 'sentence',
        pinyin: selection.pinyin || null,
        translation: finalTranslation || null,
        source_module: sourceModule,
        source_type: sourceType,
        source_id: sourceId,
      })
      setSaved(true)
      onSaved?.(selection.text)
      window.getSelection()?.removeAllRanges()
      setTimeout(() => setSelection(null), 800)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={popoverRef}
      className={'ssp' + (selection.below ? ' ssp-below' : '') + (saved ? ' ssp-saved' : '')}
      style={{
        left: selection.x,
        top: selection.y,
        width: WIDTH,
        '--ssp-arrow': `${selection.arrow}px`,
      }}
      role="dialog"
      aria-label="Save selected sentence"
    >
      <div className="ssp-head">
        <span className="ssp-text">{selection.text}</span>
        {selection.pinyin && <span className="ssp-pinyin">{selection.pinyin}</span>}
      </div>
      {translating ? (
        <p className="ssp-translation ssp-translation-pending">Translating…</p>
      ) : translation ? (
        <p className="ssp-translation">{translation}</p>
      ) : translationFailed ? (
        <p className="ssp-translation ssp-translation-pending">Translation unavailable</p>
      ) : null}
      <button
        type="button"
        onPointerDown={(event) => event.preventDefault()}
        onClick={saveSentence}
        disabled={busy || saved}
        aria-live="polite"
      >
        <span className="ssp-save-icon">
          {saved ? <CheckIcon /> : <BookmarkIcon />}
        </span>
        <span className="ssp-save-label">
          {saved ? 'Saved' : failed ? 'Try again' : busy ? 'Saving…' : 'Save sentence'}
        </span>
      </button>
    </div>
  )
}
