import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

export default function StudyLevel() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const [level, setLevel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadLevel()
  }, [token, id])

  function loadLevel() {
    setLoading(true)
    api
      .getStudyLevel(token, id)
      .then(setLevel)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.createStudyUnit(token, id, { title, description })
      setTitle('')
      setDescription('')
      loadLevel()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p>Loading...</p>
  if (error && !level) return <p role="alert">{error}</p>
  if (!level) return null

  return (
    <div>
      <p>
        <Link to="/study">Study</Link> / {level.title}
      </p>
      <h1>{level.title}</h1>
      {level.description && <p>{level.description}</p>}

      {error && <p role="alert">{error}</p>}

      {user?.is_admin && (
        <div>
          <h2>New unit</h2>
          <form onSubmit={handleCreate}>
            <div>
              <label>
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Unit 1"
                  required
                />
              </label>
            </div>
            <div>
              <label>
                Description
                <br />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  cols={60}
                />
              </label>
            </div>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create unit'}
            </button>
          </form>
        </div>
      )}

      <h2>Units</h2>
      {level.units.length === 0 ? (
        <p>No units yet.</p>
      ) : (
        <ul>
          {level.units.map((u) => (
            <li key={u.id}>
              <Link to={`/study/units/${u.id}`}>{u.title}</Link>
              {u.description && <> - {u.description}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
