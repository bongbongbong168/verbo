import { readCache, writeCache } from './dataCache.js'

export const USAGE_ALLOWANCES_KEY = 'usage:allowances'
export const TRANSLATION_FEATURE = 'full_text_translations'

export function mergeUsageAllowance(current, allowance) {
  if (!allowance?.feature) return current

  return {
    ...(current || {}),
    usage: {
      ...(current?.usage || {}),
      [allowance.feature]: allowance,
    },
  }
}

/** Keep a late GET response from rolling a just-mutated balance backward. */
export function reconcileUsageAllowances(fresh, current) {
  if (!current?.usage) return fresh

  const usage = { ...(fresh?.usage || {}) }
  Object.entries(current.usage).forEach(([feature, known]) => {
    const incoming = usage[feature]
    if (
      known
      && incoming
      && known.period_start === incoming.period_start
      && Number(known.used) > Number(incoming.used)
    ) {
      usage[feature] = known
    }
  })

  return { ...(fresh || {}), usage }
}

/** Write one mutation result into the user-wide allowance cache. */
export function writeUsageAllowance(allowance) {
  if (!allowance?.feature) return
  writeCache(
    USAGE_ALLOWANCES_KEY,
    mergeUsageAllowance(readCache(USAGE_ALLOWANCES_KEY), allowance),
  )
}

/**
 * Keep a detail cache in step with a successful translation without making
 * that detail row the authority for the user's global allowance.
 */
export function writeTranslationContentCache(cacheKey, current, allowance, { translated = false } = {}) {
  const cached = current || readCache(cacheKey)
  if (!cached) return current

  const next = {
    ...cached,
    ...(allowance ? { translation_usage: allowance } : {}),
    ...(translated ? { translation_cached: true } : {}),
  }
  writeCache(cacheKey, next)
  return next
}

export function translationNeedsProvider({ authored = false, loaded = false, cached = false } = {}) {
  return !authored && !loaded && !cached
}

