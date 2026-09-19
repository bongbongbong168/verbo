import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * The matching round: drag a wire from a word to its meaning.
 *
 * Nothing is judged while wiring. A link can be pulled off and moved as often
 * as the learner likes. Nothing is marked here at all: the page marks the
 * whole run at the end, the same as the multiple-choice rounds.
 *
 * Two ways in, because a wire must never be the only way: DRAG from any tile
 * to one on the other side, or TAP one tile then its partner (the keyboard
 * and screen-reader path, since tiles are real buttons). Either side can
 * start. Connecting to a tile that already has a wire moves that wire.
 *
 * GEOMETRY IS MEASURED, NOT ASSUMED. The dots' positions come from their own
 * rects, converted into the container's CSS pixels: `#root` carries a zoom,
 * so a rect is in painted pixels while the SVG draws in CSS pixels, and the
 * ratio of the container's painted width to its offsetWidth is the exact
 * scale - the same conversion WordPopover and the practice assistant need.
 * Re-measured on resize and whenever the links change.
 *
 * Wires are static strokes, never drawn in by an animation: a stroke that
 * only appeared while frames arrived would leave a link invisible in a tab
 * that is not compositing.
 *
 * `links` maps a left pair id to the right pair id it is wired to.
 */

/* One colour per wire, from hues the app already owns, so crossing wires can
   be told apart and each pair of dots wears its wire's colour. */
const WIRE_COLOURS = ['#a89ce3', '#3d3857', '#7e68c8', '#7d76a0', '#c3a6f0', '#5f49cb']

function curve(a, b) {
  const dx = Math.max(24, (b.x - a.x) * 0.5)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

export default function MatchWires({ question, links, onChange }) {
  const boxRef = useRef(null)
  const dots = useRef(new Map()) // `${side}-${id}` -> element
  const [points, setPoints] = useState({}) // same keys -> {x, y}
  const [held, setHeld] = useState(null) // {side, id}
  const [drag, setDrag] = useState(null) // {side, id, x, y}
  const dragRef = useRef(null)

  const scaleOf = () => {
    const box = boxRef.current
    return box && box.offsetWidth ? box.getBoundingClientRect().width / box.offsetWidth : 1
  }

  const toLocal = useCallback((clientX, clientY) => {
    const box = boxRef.current
    const r = box.getBoundingClientRect()
    const s = scaleOf()
    return { x: (clientX - r.left) / s, y: (clientY - r.top) / s }
  }, [])

  const measure = useCallback(() => {
    if (!boxRef.current) return
    const next = {}
    dots.current.forEach((el, key) => {
      const r = el.getBoundingClientRect()
      next[key] = toLocal(r.left + r.width / 2, r.top + r.height / 2)
    })
    setPoints(next)
  }, [toLocal])

  useLayoutEffect(() => {
    measure()
  }, [measure, question, links])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return undefined
    const ro = new ResizeObserver(() => measure())
    ro.observe(box)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  /* Wire `leftId` to `rightId`, taking the right tile off whatever it was on
     before - one wire per tile on both sides. */
  function connect(leftId, rightId) {
    const next = {}
    Object.entries(links).forEach(([l, r]) => {
      if (Number(l) !== leftId && r !== rightId) next[l] = r
    })
    next[leftId] = rightId
    onChange(next)
  }

  function unlink(side, id) {
    const next = {}
    Object.entries(links).forEach(([l, r]) => {
      if (side === 'left' ? Number(l) !== id : r !== id) next[l] = r
    })
    onChange(next)
  }

  function finish(from, to) {
    if (from.side === to.side) return false
    const leftId = from.side === 'left' ? from.id : to.id
    const rightId = from.side === 'right' ? from.id : to.id
    connect(leftId, rightId)
    return true
  }

  /* Tap path: first tap holds, a tap on the other side links. Tapping a tile
     that is already wired (with nothing held) pulls its wire off, so a wrong
     link is one tap to undo. */
  function tap(side, id) {
    if (held) {
      if (held.side === side && held.id === id) return setHeld(null)
      if (held.side !== side) {
        finish(held, { side, id })
        return setHeld(null)
      }
      return setHeld({ side, id })
    }
    const wired =
      side === 'left' ? links[id] != null : Object.values(links).includes(id)
    if (wired) unlink(side, id)
    setHeld({ side, id })
  }

  /* Drag path. A press that never moves is left to the click handler (tap);
     once it travels a few pixels it becomes a wire following the pointer. */
  function pointerDown(e, side, id) {
    if (e.button > 0) return
    const start = { side, id, sx: e.clientX, sy: e.clientY, moved: false }
    dragRef.current = start

    const move = (ev) => {
      const d = dragRef.current
      if (!d) return
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 6) return
      d.moved = true
      setHeld(null)
      setDrag({ side: d.side, id: d.id, ...toLocal(ev.clientX, ev.clientY) })
    }
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d || !d.moved) return
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-wire]')
      if (target) {
        const [tSide, tId] = target.getAttribute('data-wire').split(':')
        finish({ side: d.side, id: d.id }, { side: tSide, id: Number(tId) })
      }
      // Swallow the click that follows a real drag, or it would count as a tap.
      const swallow = (ce) => {
        ce.stopPropagation()
        ce.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const colourOf = {}
  question.left.forEach((id, i) => {
    colourOf[id] = WIRE_COLOURS[i % WIRE_COLOURS.length]
  })
  const rightOwner = {}
  Object.entries(links).forEach(([l, r]) => {
    rightOwner[r] = Number(l)
  })

  const pair = (id) => question.pairs.find((p) => p.id === id)

  function tile(side, id) {
    const key = `${side}-${id}`
    const owner = side === 'left' ? (links[id] != null ? id : null) : rightOwner[id] ?? null
    const colour = owner != null ? colourOf[owner] : null
    const isHeld = held?.side === side && held?.id === id
    const p = pair(id)
    return (
      <button
        key={key}
        type="button"
        data-wire={`${side}:${id}`}
        className={`qp-wtile qp-wtile-${side}${owner != null ? ' linked' : ''}${isHeld ? ' held' : ''}`}
        style={colour ? { '--wire': colour } : undefined}
        onClick={() => tap(side, id)}
        onPointerDown={(e) => pointerDown(e, side, id)}
        aria-pressed={isHeld}
        aria-label={
          side === 'left'
            ? `${p.hanzi}${links[id] != null ? `, linked to ${pair(links[id]).answer}` : ''}`
            : p.answer
        }
      >
        <span className={side === 'left' ? 'qp-wtile-hanzi' : 'qp-wtile-text'}>
          {side === 'left' ? p.hanzi : p.answer}
        </span>
        <span
          className="qp-wdot"
          ref={(el) => {
            if (el) dots.current.set(key, el)
            else dots.current.delete(key)
          }}
        />
      </button>
    )
  }

  const wires = []
  Object.entries(links).forEach(([l, r]) => {
    const a = points[`left-${l}`]
    const b = points[`right-${r}`]
    if (!a || !b) return
    wires.push(
      <path key={`w-${l}`} className="qp-wire" d={curve(a, b)} style={{ '--wire': colourOf[Number(l)] }} />,
    )
  })

  let ghost = null
  if (drag) {
    const a = points[`${drag.side}-${drag.id}`]
    if (a) {
      const b = { x: drag.x, y: drag.y }
      ghost = <path className="qp-wire ghost" d={drag.side === 'left' ? curve(a, b) : curve(b, a)} />
    }
  }

  return (
    <div className="qp-wires" ref={boxRef}>
      <svg className="qp-wires-svg" aria-hidden="true">
        {wires}
        {ghost}
      </svg>
      <div className="qp-wires-col">{question.left.map((id) => tile('left', id))}</div>
      <div className="qp-wires-gap" />
      <div className="qp-wires-col">{question.right.map((id) => tile('right', id))}</div>
    </div>
  )
}
