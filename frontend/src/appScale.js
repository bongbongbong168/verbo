const KEY = 'app-scale'

export const SCALE_OPTIONS = [
  { value: 1, label: '100%', hint: 'True browser size' },
  { value: 1.1, label: '110%', hint: 'Default — a little larger' },
  { value: 1.25, label: '125%', hint: 'Easier to read' },
]

const DEFAULT_SCALE = 1.1

export function getAppScale() {
  const raw = Number(localStorage.getItem(KEY))
  // Only accept a value we actually offer — a hand-edited localStorage entry
  // should not be able to render the app at 40x.
  return SCALE_OPTIONS.some((o) => o.value === raw) ? raw : DEFAULT_SCALE
}

/**
 * Drives `#root { zoom: var(--app-scale) }`. Setting the variable is enough to
 * rescale everything, including `--app-vh` — which is defined as
 * `calc(100vh / var(--app-scale))`, so the sidebar's height correction follows
 * automatically instead of needing its own setting.
 */
export function applyAppScale(scale = getAppScale()) {
  document.documentElement.style.setProperty('--app-scale', String(scale))
  return scale
}

export function setAppScale(scale) {
  localStorage.setItem(KEY, String(scale))
  return applyAppScale(scale)
}
