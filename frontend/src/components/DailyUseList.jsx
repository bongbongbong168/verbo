import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import './DailyUseList.css'

/**
 * Daily Use: real-life situations, chosen freely.
 *
 * Deliberately NOT the rotating carousel the HSK tab uses. That motion suits a
 * ladder — HSK 1 through 6 is an order, and the carousel says "you are here on
 * it". Daily Use is the opposite: there is no sequence, you pick the situation
 * you are about to be in. A moving card that has to be caught would fight that,
 * so this is a still, scannable library. Same cards, same palette, same
 * spacing — only the arrangement differs, which is what keeps the two tabs
 * feeling like one product.
 *
 * Nothing here is locked. Progression lives INSIDE a topic (lesson to lesson),
 * never across the library.
 *
 * The search + filter + shelves arrangement is the same one the Read page
 * uses, on purpose: both are "browse a library" pages, and a learner who has
 * learned one should not have to learn the other.
 */

/* The three the filter offers, in order of difficulty. A topic whose
   `level_label` is something else (the HSK tab's labels, or an older value)
   simply never matches a level filter — it is still reachable by search and by
   its shelf, so nothing becomes unreachable. */
const LEVELS = ['Beginner', 'Intermediate', 'Advanced']

/* Fallback marks, keyed by the shelf a topic sits on.
 *
 * A topic carries its own `emoji`; this is what an unfilled one wears so the
 * card still looks finished. Keyed on `topic_group`, which is a whitelist in
 * the model — NOT on the title, which is admin-authored free text and would
 * silently stop matching the first time somebody renamed a situation. */
const GROUP_MARKS = {
  'Daily Life': '🏠',
  'Food & Restaurants': '🍜',
  Travel: '✈️',
  Shopping: '🛍️',
  Social: '💬',
  Work: '💼',
  Education: '📚',
  Health: '🏥',
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  )
}

export default function DailyUseList() {
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('all')

  useEffect(() => {
    if (!token) return
    let live = true
    setLoading(true)
    api
      .getDailyUse(token)
      .then((d) => live && setData(d))
      // A failed shelf must not blank the page — the tab still renders its
      // header and says there is nothing to show.
      .catch(() => live && setData(null))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [token])

  const groups = useMemo(() => data?.groups || [], [data])
  const recommended = data?.recommended || []
  const popular = data?.popular || []

  /* One flat list of every situation, for searching and for the level filter.
     Derived from the shelves rather than fetched separately — the endpoint
     already sends each topic exactly once, filed under its group. */
  const all = useMemo(
    () => groups.flatMap((g) => g.topics.map((t) => ({ ...t, group: g.name }))),
    [groups],
  )

  /* Only offer a level that something is actually filed under. A pill leading
     to an empty page is worse than no pill. */
  const levels = useMemo(() => {
    const present = new Set(all.map((t) => t.level_label))
    return LEVELS.filter((l) => present.has(l))
  }, [all])

  const searching = query.trim().length > 0 || level !== 'all'

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((t) => {
      if (level !== 'all' && t.level_label !== level) return false
      if (!q) return true
      /* The group is searched too: someone typing "travel" is looking for the
         shelf, and they should not have to know that the situation is called
         "At the Airport". */
      return [t.title, t.description, t.group]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    })
  }, [all, query, level])

  if (loading) return <p className="du-empty">Loading situations…</p>

  if (!groups.length) {
    return (
      <p className="du-empty">
        No Daily Use topics yet. Add one from the New level button above and set its
        situation — Food &amp; Restaurants, Travel, Work and so on.
      </p>
    )
  }

  return (
    <div className="du">
      <div className="du-bar">
        <label className="du-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to learn?"
            aria-label="Search situations"
          />
        </label>

        {levels.length > 1 && (
          <div className="du-pills">
            <button
              type="button"
              className={'du-pill' + (level === 'all' ? ' active' : '')}
              onClick={() => setLevel('all')}
            >
              All
            </button>
            {levels.map((l) => (
              <button
                key={l}
                type="button"
                className={'du-pill' + (level === l ? ' active' : '')}
                onClick={() => setLevel(l)}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Searching or picking a level drops the shelves for one flat grid —
          the same swap the Read page makes, and for the same reason: shelves
          answer "show me around", a search answers "find me this", and shelving
          would hide matches from someone who has already said what they want. */}
      {searching ? (
        <section className="du-shelf">
          <div className="du-shelf-head">
            <h2 className="du-shelf-title">
              {query.trim() ? `Results for “${query.trim()}”` : level}
            </h2>
            <button
              type="button"
              className="du-clear"
              onClick={() => {
                setQuery('')
                setLevel('all')
              }}
            >
              Back to browsing
            </button>
          </div>
          {results.length === 0 ? (
            <p className="du-empty">
              Nothing matches that yet. Try another word, or browse the shelves.
            </p>
          ) : (
            <div className="du-grid">
              {results.map((t) => (
                <TopicCard key={t.id} topic={t} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Only rendered when the learner's own preferences actually pointed
              somewhere. A "Recommended for you" shelf built from nothing is
              worse than no shelf — see the endpoint, which returns an empty
              list rather than padding it. */}
          {recommended.length > 0 && (
            <Shelf title="Recommended for you">
              {recommended.map((t) => (
                <TopicCard key={t.id} topic={t} reason={t.reason} />
              ))}
            </Shelf>
          )}

          {/* Counted from real opens, so this stays quiet until the app has
              been used rather than claiming popularity on day one. */}
          {popular.length > 0 && (
            <Shelf title="Popular right now">
              {popular.map((t) => (
                <TopicCard key={t.id} topic={t} />
              ))}
            </Shelf>
          )}

          {/* One heading over all the shelves, so the page reads as two parts —
              what we picked for you, and everything there is — rather than as
              eight sibling shelves of equal weight. */}
          <p className="du-section">Browse by situation</p>

          {groups.map((g) => (
            <Shelf key={g.name} title={g.name} mark={GROUP_MARKS[g.name]}>
              {g.topics.map((t) => (
                <TopicCard key={t.id} topic={t} />
              ))}
            </Shelf>
          ))}
        </>
      )}
    </div>
  )
}

function Shelf({ title, mark, children }) {
  return (
    <section className="du-shelf">
      <div className="du-shelf-head">
        <h2 className="du-shelf-title">
          {mark && <span aria-hidden="true">{mark} </span>}
          {title}
        </h2>
      </div>
      <div className="du-grid">{children}</div>
    </section>
  )
}

/**
 * One situation.
 *
 * Named for the thing you are about to do, never "Lesson 14" — the learner is
 * thinking "I need to order coffee", not "I need to finish lesson 14". The
 * lesson count is the honest version of a progress bar: nothing in the app
 * records a lesson as finished, so "3 lessons" is a fact where "2 of 3
 * complete" would be a claim the data cannot support.
 *
 * There is deliberately no "5 min" on the card. Nothing measures how long a
 * conversation takes to work through, and a number invented to look like the
 * mockup would be the one piece of information here that is not true.
 */
function TopicCard({ topic, reason }) {
  /* Coerced: SQLite returns aggregate counts as STRINGS, so `units_count` is
     "0" and a strict comparison against 0 silently fails — the card read
     "0 lessons" instead of "Coming soon". Same trap the FK comparisons on this
     project hit. */
  const lessons = Number(topic.units_count ?? 0)
  const mark = topic.emoji || GROUP_MARKS[topic.topic_group] || '💬'

  return (
    <Link className="du-card" to={`/study/${topic.id}`}>
      <span className="du-card-top">
        <span className="du-card-mark" aria-hidden="true">
          {mark}
        </span>
        <span className="du-card-title">{topic.title}</span>
      </span>

      <span className="du-card-meta">
        {topic.level_label && <span className="du-chip">{topic.level_label}</span>}
        <span className="du-card-count">
          {/* An empty topic says so rather than reading "0 lessons", which
              looks like a loading state. */}
          {lessons === 0 ? 'Coming soon' : `${lessons} ${lessons === 1 ? 'lesson' : 'lessons'}`}
        </span>
      </span>

      {topic.description && <span className="du-card-desc">{topic.description}</span>}

      {reason && <span className="du-card-reason">{reason}</span>}

      {/* A span, not a button: the whole card is already the link, and a real
          button inside an anchor is a nested interactive control that keyboard
          and screen-reader users cannot reach sensibly. This is the affordance
          the mockup draws, without the trap. */}
      <span className="du-card-go">
        Start
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  )
}
