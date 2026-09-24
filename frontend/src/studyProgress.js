import { api } from './api'
import { invalidate, readCache, writeCache } from './dataCache'

/**
 * Mark a lesson finished for the signed-in learner.
 *
 * One helper because the listening and quiz completion paths must leave the
 * caches agreeing: the lesson's copy gets the new flag, and its level's
 * module list is dropped so the completed row is current next time it opens.
 *
 * Fire-and-forget from the automatic triggers: a failed write costs a grey
 * row, never the lesson the learner is in the middle of.
 */
export async function completeLesson(token, unitId) {
  const result = await api.completeStudyUnit(token, unitId)

  const key = `study-unit:${unitId}`
  const cached = readCache(key)
  if (cached) {
    writeCache(key, { ...cached, completed: result.completed })
    if (cached.level?.id) invalidate(`study-level:${cached.level.id}`)
  }

  return result.completed
}
