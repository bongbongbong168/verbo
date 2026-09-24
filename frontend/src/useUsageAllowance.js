import { useCallback } from 'react'
import { api } from './api'
import { readCache } from './dataCache'
import { useApiData } from './useApiData'
import {
  USAGE_ALLOWANCES_KEY,
  reconcileUsageAllowances,
  writeUsageAllowance,
} from './usageAllowances'

export function useUsageAllowance(token, feature) {
  const { data, error, refreshing, refresh } = useApiData(
    token ? USAGE_ALLOWANCES_KEY : null,
    () => api.getUsageAllowances(token).then((fresh) => (
      reconcileUsageAllowances(fresh, readCache(USAGE_ALLOWANCES_KEY))
    )),
    { enabled: Boolean(token) },
  )

  const updateUsage = useCallback((allowance) => {
    writeUsageAllowance(allowance)
  }, [])

  return {
    usage: data?.usage?.[feature] || null,
    error,
    refreshing,
    refresh,
    updateUsage,
  }
}
