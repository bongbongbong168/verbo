import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

export default function Flashcards() {
  const { token } = useAuth()
  const [flashcards, setFlashcards] = useState([])
  const [word, setWord] = useState('')
  const [pinyin, setPinyin] = useState('')
  const [translation, setTranslation] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setLoading(true)
    api
      .getFlashcards(token, 1)
      .then((res) => {
        setFlashcards(res.data)
        setPage(res.current_page)
        setLastPage(res.last_page)
        setTotal(res.total)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  async function handleLoadMore() {
    setError(null)
    setLoadingMore(true)
    try {
      const res = await api.getFlashcards(token, page + 1)
      // Append rather than replace, so earlier pages stay on screen.
      setFlashcards((prev) => [...prev, ...res.data])
      setPage(res.current_page)
      setLastPage(res.last_page)
      setTotal(res.total)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    try {
      const card = await api.addFlashcard(token, { word, pinyin, translation })
      setFlashcards((prev) => [card, ...prev])
      setTotal((t) => t + 1)
      setWord('')
      setPinyin('')
      setTranslation('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteFlashcard(token, id)
      setFlashcards((prev) => prev.filter((c) => c.id !== id))
      setTotal((t) => Math.max(t - 1, 0))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>Flashcard Bank</h1>

      <h2>Add a word</h2>
      <form onSubmit={handleAdd}>
        <div>
          <label>
            Word
            <input value={word} onChange={(e) => setWord(e.target.value)} required />
          </label>
        </div>
        <div>
          <label>
            Pinyin
            <input value={pinyin} onChange={(e) => setPinyin(e.target.value)} />
          </label>
        </div>
        <div>
          <label>
            Translation
            <input
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
            />
          </label>
        </div>
        <button type="submit">Add flashcard</button>
      </form>

      {error && <p role="alert">{error}</p>}

      <h2>Your words {total > 0 && <span>({total})</span>}</h2>
      {loading ? (
        <p>Loading...</p>
      ) : flashcards.length === 0 ? (
        <p>No flashcards yet.</p>
      ) : (
        <ul>
          {flashcards.map((card) => (
            <li key={card.id}>
              <strong>{card.word}</strong>
              {card.pinyin && ` (${card.pinyin})`}
              {card.translation && ` - ${card.translation}`}
              {' '}
              <em>[{card.source_module}]</em>{' '}
              <button type="button" onClick={() => handleDelete(card.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && page < lastPage && (
        <button type="button" onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : `Load more (${flashcards.length} of ${total})`}
        </button>
      )}
    </div>
  )
}
