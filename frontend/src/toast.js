/* The on-screen toast store. A plain module rather than a context, so any
   code (a page, a hook, an api helper) can call toast.show() without being
   inside a provider. <ToastStack> in Layout subscribes and renders.

   Toasts are temporary visibility only. The Notifications page and Bookings
   are the lasting record, so nothing here is persisted. */

export const MAX_TOASTS = 5
export const DEFAULT_DURATION = 5000
const TYPES = ['success', 'error', 'warning', 'info', 'loading']

let toasts = []
let nextId = 1
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn(toasts))
}

export function subscribe(fn) {
  listeners.add(fn)
  fn(toasts)
  return () => listeners.delete(fn)
}

export const toast = {
  /** Returns the new toast's id. A sixth toast pushes the oldest out. */
  show({ type = 'info', title, message = '', duration = DEFAULT_DURATION, actionLabel, onAction, avatar } = {}) {
    const id = nextId++
    const item = {
      id,
      type: TYPES.includes(type) ? type : 'info',
      title: String(title || ''),
      message: String(message || ''),
      duration: Number(duration) > 0 ? Number(duration) : DEFAULT_DURATION,
      actionLabel,
      onAction,
      // Optional face of whoever caused it; the type then shows as a badge.
      avatar: avatar || null,
      // Bumped by update(): restarts the clock and the countdown strip.
      rev: 0,
    }
    // Newest first. The oldest live ones beyond the cap are dropped; ones
    // already leaving do not count against it.
    const live = toasts.filter((t) => !t.leaving)
    const overflow = live.length + 1 - MAX_TOASTS
    const dropped = overflow > 0 ? new Set(live.slice(-overflow).map((t) => t.id)) : new Set()
    toasts = [item, ...toasts.filter((t) => !dropped.has(t.id))]
    emit()
    return id
  },

  /** Plays the exit, then removes. A timer (not animationend) does the
      removal, so a tab that never composites still clears it. */
  dismiss(id) {
    const t = toasts.find((x) => x.id === id)
    if (!t || t.leaving) return
    toasts = toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x))
    emit()
    setTimeout(() => {
      toasts = toasts.filter((x) => x.id !== id)
      emit()
    }, 260)
  },
}

/** Change a toast in place (a "Saving…" one becoming "Saved"). */
toast.update = (id, patch = {}) => {
  let found = false
  toasts = toasts.map((t) => {
    if (t.id !== id || t.leaving) return t
    found = true
    return {
      ...t,
      ...patch,
      type: TYPES.includes(patch.type) ? patch.type : t.type,
      message: patch.message == null ? '' : String(patch.message),
      duration: Number(patch.duration) > 0 ? Number(patch.duration) : DEFAULT_DURATION,
      rev: t.rev + 1,
    }
  })
  if (found) emit()
  return found
}

/**
 * A save in progress: a spinner toast now, and handles that turn THAT toast
 * into the result, so one card goes "Saving…" -> "Saved" instead of two
 * stacking. done() with no result just removes it (nothing worth saying).
 */
toast.saving = (title = 'Saving…') => {
  const id = toast.show({ type: 'loading', title })
  let settled = false
  const settle = (type, t, message, duration) => {
    if (settled) return
    settled = true
    if (!toast.update(id, { type, title: t, message, duration })) {
      toast.show({ type, title: t, message, duration })
    }
  }
  return {
    success: (t = 'Saved', message) => settle('success', t, message, 3000),
    error: (t = "Couldn't save", message) => settle('error', t, message, 5000),
    done: () => {
      if (!settled) {
        settled = true
        toast.dismiss(id)
      }
    },
  }
}

export default toast
