import { useCallback, useEffect, useRef, useState } from 'react'
import './ImageCropper.css'

/**
 * Drag-and-zoom cropper for a fixed aspect ratio.
 *
 * The image is laid over the frame at `scale`, offset by `pos`. Both are kept
 * in CSS pixels against the frame's own box, which makes the export a direct
 * mapping: the visible frame is exactly the source rectangle drawn to canvas.
 * Offsets are clamped so the image can never be dragged off the frame and
 * leave a transparent edge.
 */
export default function ImageCropper({
  file,
  aspect = 13 / 15,
  outputWidth = 600,
  onCancel,
  onCrop,
}) {
  const [url, setUrl] = useState(null)
  const [natural, setNatural] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)

  const frameRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  // Smallest scale that still covers the frame — the zoom floor.
  const baseScale = useCallback(() => {
    const frame = frameRef.current
    if (!frame || !natural) return 1
    const { width: fw, height: fh } = frame.getBoundingClientRect()
    return Math.max(fw / natural.w, fh / natural.h)
  }, [natural])

  const clamp = useCallback(
    (next, scale) => {
      const frame = frameRef.current
      if (!frame || !natural) return next
      const { width: fw, height: fh } = frame.getBoundingClientRect()
      const dw = natural.w * scale
      const dh = natural.h * scale
      return {
        x: Math.min(0, Math.max(fw - dw, next.x)),
        y: Math.min(0, Math.max(fh - dh, next.y)),
      }
    },
    [natural]
  )

  // Centre the image once its size is known.
  useEffect(() => {
    if (!natural) return
    const frame = frameRef.current
    if (!frame) return
    const { width: fw, height: fh } = frame.getBoundingClientRect()
    const s = baseScale()
    setZoom(1)
    setPos({ x: (fw - natural.w * s) / 2, y: (fh - natural.h * s) / 2 })
  }, [natural, baseScale])

  function onPointerDown(e) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pos }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    const d = dragRef.current
    if (!d) return
    const next = {
      x: d.origin.x + (e.clientX - d.startX),
      y: d.origin.y + (e.clientY - d.startY),
    }
    setPos(clamp(next, baseScale() * zoom))
  }

  function onPointerUp() {
    dragRef.current = null
  }

  function onZoomChange(e) {
    const nextZoom = Number(e.target.value)
    const frame = frameRef.current
    if (!frame || !natural) return setZoom(nextZoom)

    // Zoom about the frame's centre so the subject does not drift away.
    const { width: fw, height: fh } = frame.getBoundingClientRect()
    const s0 = baseScale()
    const prev = s0 * zoom
    const next = s0 * nextZoom
    const cx = (fw / 2 - pos.x) / prev
    const cy = (fh / 2 - pos.y) / prev
    setZoom(nextZoom)
    setPos(clamp({ x: fw / 2 - cx * next, y: fh / 2 - cy * next }, next))
  }

  async function handleConfirm() {
    const frame = frameRef.current
    if (!frame || !natural) return
    setBusy(true)
    try {
      const { width: fw, height: fh } = frame.getBoundingClientRect()
      const scale = baseScale() * zoom

      // The frame, expressed in the image's own pixels.
      const sx = -pos.x / scale
      const sy = -pos.y / scale
      const sw = fw / scale
      const sh = fh / scale

      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = Math.round(outputWidth / aspect)
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'

      const img = new Image()
      img.src = url
      await img.decode()
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
      // Hand back a File, not a bare Blob, so the upload keeps a real filename.
      const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
      onCrop(new File([blob], name, { type: 'image/jpeg' }))
    } finally {
      setBusy(false)
    }
  }

  if (!file) return null

  return (
    <div className="cr-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="cr" role="dialog" aria-modal="true" aria-label="Adjust photo">
        <h3 className="cr-title">Adjust your photo</h3>
        <p className="cr-sub">Drag to reposition, and zoom to fill the frame.</p>

        <div
          className="cr-frame"
          ref={frameRef}
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {url && (
            <img
              className="cr-img"
              src={url}
              alt=""
              draggable="false"
              onLoad={(e) =>
                setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
              style={
                natural
                  ? {
                      width: natural.w * baseScale() * zoom,
                      height: natural.h * baseScale() * zoom,
                      transform: `translate(${pos.x}px, ${pos.y}px)`,
                    }
                  : { opacity: 0 }
              }
            />
          )}
        </div>

        <label className="cr-zoom">
          <span>Zoom</span>
          <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={onZoomChange} />
        </label>

        <div className="cr-actions">
          <button type="button" className="cr-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="cr-btn primary" onClick={handleConfirm} disabled={busy || !natural}>
            {busy ? 'Saving…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  )
}
