import test from 'node:test'
import assert from 'node:assert/strict'
import { clearCache, readCache, writeCache } from './dataCache.js'
import {
  TRANSLATION_FEATURE,
  USAGE_ALLOWANCES_KEY,
  mergeUsageAllowance,
  reconcileUsageAllowances,
  translationNeedsProvider,
  writeTranslationContentCache,
  writeUsageAllowance,
} from './usageAllowances.js'

const usage = (remaining) => ({
  feature: TRANSLATION_FEATURE,
  used: 10 - remaining,
  limit: 10,
  remaining,
  available: remaining > 0,
})

test('a successful translation updates the shared balance immediately', () => {
  clearCache()
  writeCache(USAGE_ALLOWANCES_KEY, { usage: { scans: { remaining: 4 } } })
  writeUsageAllowance(usage(4))

  const cached = readCache(USAGE_ALLOWANCES_KEY)
  assert.equal(cached.usage.full_text_translations.remaining, 4)
  assert.equal(cached.usage.scans.remaining, 4)
})

test('article and scan detail caches retain the updated usage and cached flag', () => {
  clearCache()
  const articleKey = 'article:9:viewer:4:free'
  const scanKey = 'scan:12'
  writeCache(articleKey, { id: 9, title: 'Article', translation_cached: false })
  writeCache(scanKey, { id: 12, original_filename: 'scan.png', translation_cached: false })

  writeTranslationContentCache(articleKey, null, usage(3), { translated: true })
  writeTranslationContentCache(scanKey, null, usage(3), { translated: true })

  assert.equal(readCache(articleKey).translation_usage.remaining, 3)
  assert.equal(readCache(articleKey).translation_cached, true)
  assert.equal(readCache(scanKey).translation_usage.remaining, 3)
  assert.equal(readCache(scanKey).translation_cached, true)
})

test('loaded and server-cached translations never require another provider call', () => {
  assert.equal(translationNeedsProvider(), true)
  assert.equal(translationNeedsProvider({ loaded: true }), false)
  assert.equal(translationNeedsProvider({ cached: true }), false)
  assert.equal(translationNeedsProvider({ authored: true }), false)
})

test('merging an allowance preserves the other global feature balances', () => {
  const current = { usage: { scans: { remaining: 2 } } }
  const next = mergeUsageAllowance(current, usage(5))
  assert.equal(next.usage.scans.remaining, 2)
  assert.equal(next.usage.full_text_translations.remaining, 5)
})

test('a late allowance refresh cannot restore an older count from the same month', () => {
  const freshButLate = {
    usage: {
      [TRANSLATION_FEATURE]: { ...usage(5), period_start: '2026-09-01' },
    },
  }
  const current = {
    usage: {
      [TRANSLATION_FEATURE]: { ...usage(4), period_start: '2026-09-01' },
    },
  }

  const reconciled = reconcileUsageAllowances(freshButLate, current)
  assert.equal(reconciled.usage[TRANSLATION_FEATURE].remaining, 4)
})

test('a newer allowance period replaces the previous month', () => {
  const fresh = {
    usage: {
      [TRANSLATION_FEATURE]: { ...usage(10), period_start: '2026-10-01' },
    },
  }
  const current = {
    usage: {
      [TRANSLATION_FEATURE]: { ...usage(0), period_start: '2026-09-01' },
    },
  }

  const reconciled = reconcileUsageAllowances(fresh, current)
  assert.equal(reconciled.usage[TRANSLATION_FEATURE].remaining, 10)
})
