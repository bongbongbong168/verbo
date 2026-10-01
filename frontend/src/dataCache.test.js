import test from 'node:test'
import assert from 'node:assert/strict'
import { clearCache, fetchThrough, invalidate, readCache } from './dataCache.js'

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('a request from the previous session cannot populate the new session cache', async () => {
  clearCache()
  const previous = deferred()
  const oldRead = fetchThrough('dashboard', () => previous.promise)
  clearCache()

  const newRead = fetchThrough('dashboard', () => Promise.resolve('new account'))
  assert.equal(await newRead, 'new account')
  previous.resolve('previous account')
  assert.equal(await oldRead, 'previous account')
  assert.equal(readCache('dashboard'), 'new account')
})

test('an invalidated request cannot overwrite a newer response', async () => {
  clearCache()
  const previous = deferred()
  const oldRead = fetchThrough('article:1', () => previous.promise)
  invalidate('article:1')

  const newRead = fetchThrough('article:1', () => Promise.resolve('updated article'))
  assert.equal(await newRead, 'updated article')
  previous.resolve('stale article')
  await oldRead
  assert.equal(readCache('article:1'), 'updated article')
})

test('concurrent readers of the same key still share one request', async () => {
  clearCache()
  let calls = 0
  const first = fetchThrough('tutors', () => { calls += 1; return ['Ada'] })
  const second = fetchThrough('tutors', () => { calls += 1; return ['Other'] })
  assert.deepEqual(await Promise.all([first, second]), [['Ada'], ['Ada']])
  assert.equal(calls, 1)
})
