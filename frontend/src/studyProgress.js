import { api } from './api'
import { invalidate, readCache, writeCache } from './dataCache'

/**
 * Mark a lesson finished (or not) for the signed-in learner.
 *
 * One helper because three places do it - playing the conversation to the
 * end, finishing the practice run, and the lesson's own "Mark as done"
 * button - and every one of them must leave the caches agreeing: the
 * lesson's copy gets the new flag, and its level's module list is dropped so
 * the row greys out (or comes back) the next time it is shown.
 *
 * Fire-and-forget from the automatic triggers: a failed write costs a grey
 * row, never the lesson the learner is in the middle of.
 */
export async function setLessonDone(token, unitId, done) {
  const result = done
    ? await api.completeStudyUnit(token, unitId)
    : await api.uncompleteStudyUnit(token, unitId)

  const key = `study-unit:${unitId}`
  const cached = readCache(key)
  if (cached) {
    writeCache(key, { ...cached, completed: result.completed })
    if (cached.level?.id) invalidate(`study-level:${cached.level.id}`)
  }

  return result.completed
}
