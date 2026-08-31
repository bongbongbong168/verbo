import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import PageTools from "../components/PageTools";
import VocabReview from "../components/VocabReview";
import { SOURCE_MARKS, ManualMark } from "../components/SourceIcons";
import "./VocabularyBank.css";

/* The filter strip. `key` is the `source_module` value the API filters on, so
   the strip and the query can never drift apart. Order runs from the modules a
   learner meets most words in down to the manual add. */
const SOURCES = [
  { key: "", label: "All" },
  { key: "podcast", label: "Podcasts" },
  { key: "read", label: "Reading" },
  { key: "study", label: "Modules" },
  { key: "scan", label: "Scanned" },
  { key: "manual", label: "Added by you" },
];

/* The stat cards, in the reference's order. Every one is a real count —
   the reference's fourth slot was "Categories", which flashcards do not have,
   so it carries the number of distinct places words came from instead.

   The reference puts a tinted square in each card's corner; it was built and
   then removed at the user's request. Four different accent colours across one
   row read as four categories when they are just four counts of the same kind
   of thing. */
const STATS = [
  { key: "words", label: "Words" },
  { key: "learning", label: "Learning" },
  { key: "sources", label: "Sources" },
  { key: "mastered", label: "Mastered" },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}


function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * The Vocabulary Bank.
 *
 * Not a dictionary and not a deck: a record of every word this learner has met
 * anywhere in Verbo, in the order they met them, each one still pointing back
 * at the article, episode, unit or scan it came from. Reviewing is something
 * you do inside it, which is why there is no separate flashcard collection to
 * curate — everything saved is already a card.
 */
export default function VocabularyBank() {
  const { token } = useAuth();

  const [stats, setStats] = useState(null);
  const [cards, setCards] = useState([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ word: "", pinyin: "", translation: "" });

  // Debounced so a search does not fire a request per keystroke against the
  // shared 300/min bucket.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadStats = useCallback(() => {
    api
      .getFlashcardStats(token)
      .then(setStats)
      .catch(() => {});
  }, [token]);

  useEffect(loadStats, [loadStats]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api
      .getFlashcards(token, 1, { source, q: search })
      .then((res) => {
        if (!live) return;
        setCards(res.data);
        setPage(res.current_page);
        setLastPage(res.last_page);
        setTotal(res.total);
        setOpenId(null);
      })
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [token, source, search]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await api.getFlashcards(token, page + 1, { source, q: search });
      // Append rather than replace, so earlier pages stay on screen.
      setCards((prev) => [...prev, ...res.data]);
      setPage(res.current_page);
      setLastPage(res.last_page);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function startReview(bucket, title) {
    setMenuOpen(false);
    setStarting(true);
    setError(null);
    try {
      const run = await api.getReviewCards(token, { bucket, source });
      if (!run.length) {
        setError("No words in that group yet.");
        return;
      }
      setSession({ title, cards: run });
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      const card = await api.addFlashcard(token, draft);
      setCards((prev) => [card, ...prev.filter((c) => c.id !== card.id)]);
      setTotal((t) => t + 1);
      setDraft({ word: "", pinyin: "", translation: "" });
      setAdding(false);
      loadStats();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    try {
      await api.deleteFlashcard(token, id);
      setCards((prev) => prev.filter((c) => c.id !== id));
      setTotal((t) => Math.max(t - 1, 0));
      loadStats();
    } catch (err) {
      setError(err.message);
    }
  }

  /* NEW / LEARNING / MASTERED, derived from what the card actually records —
     "new" is genuinely never reviewed, not merely recent. */
  function state(card) {
    if (card.is_mastered) return { key: "mastered", label: "Mastered" };
    if (!card.review_count) return { key: "new", label: "New" };
    if (card.is_difficult) return { key: "hard", label: "Difficult" };
    return { key: "learning", label: "Learning" };
  }

  const activeSource = SOURCES.find((s) => s.key === source);

  const runs = [
    { bucket: "all", label: "Review all", count: stats?.words },
    { bucket: "today", label: "Saved today", count: stats?.today },
    { bucket: "difficult", label: "Difficult words", count: stats?.difficult },
  ];

  return (
    <div className="vb">
      <div className="vb-top">
        <h1 className="vb-title">Vocabulary Bank</h1>
        <div className="vb-tools">
          <PageTools />
        </div>
      </div>

      <p className="vb-lede">
        Every word you save anywhere in Verbo lands here, still pointing back at
        where you found it.
      </p>

      {/* ---- the four counters ---- */}
      <div className="vb-stats">
        {STATS.map(({ key, label }) => (
          <div className="vb-stat" key={key}>
            <span className="vb-stat-num">{stats ? stats[key] : "—"}</span>
            <span className="vb-stat-label">{label}</span>
          </div>
        ))}
      </div>

      {/* ---- search + review ---- */}
      <div className="vb-controls">
        <label className="vb-search">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words, meanings, example sentences…"
          />
        </label>

        <div className="vb-review-wrap">
          <button
            type="button"
            className={"vb-review" + (menuOpen ? " open" : "")}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            disabled={starting}
          >
            <PlayIcon />
            {starting ? "Starting…" : "Review"}
          </button>

          {/* Shown by state, not by animation: a panel that fades in is
              invisible when the tab never composites a frame. */}
          {menuOpen && (
            <div className="vb-menu">
              <p className="vb-menu-title">What would you like to review?</p>
              {runs.map((r) => (
                <button
                  type="button"
                  key={r.bucket}
                  className="vb-menu-item"
                  onClick={() => startReview(r.bucket, r.label)}
                  disabled={r.count === 0}
                >
                  <span>{r.label}</span>
                  <span className="vb-menu-count">{r.count ?? "—"}</span>
                </button>
              ))}
              {/* Only offered when a source filter is actually on — an entry
                  reading "From All" would say nothing. */}
              {source && (
                <button
                  type="button"
                  className="vb-menu-item"
                  onClick={() =>
                    startReview("all", `From ${activeSource.label}`)
                  }
                >
                  <span>From {activeSource.label}</span>
                  <span className="vb-menu-count">
                    {stats?.by_source?.[source] ?? "—"}
                  </span>
                </button>
              )}
              <p className="vb-menu-foot">
                {stats
                  ? `A word counts as mastered after ${stats.mastered_streak} correct answers in a row.`
                  : ""}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---- where the words came from ---- */}
      <div className="vb-filters">
        {SOURCES.map((s) => {
          const n = s.key ? stats?.by_source?.[s.key] : stats?.words;
          return (
            <button
              type="button"
              key={s.key || "all"}
              className={"vb-filter" + (source === s.key ? " active" : "")}
              onClick={() => setSource(s.key)}
            >
              {s.label}
              {n != null && <span className="vb-filter-n">{n}</span>}
            </button>
          );
        })}
      </div>

      {error && <p className="vb-error">{error}</p>}

      <div className="vb-list-head">
        <h2 className="vb-list-title">
          {search
            ? `Results for “${search}”`
            : source
              ? activeSource.label
              : "Recently saved"}
          {!loading && <span className="vb-list-n">{total}</span>}
        </h2>
        <button
          type="button"
          className="vb-add-toggle"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Cancel" : "+ Add a word"}
        </button>
      </div>

      {adding && (
        <form className="vb-add" onSubmit={add}>
          <input
            required
            value={draft.word}
            onChange={(e) => setDraft({ ...draft, word: e.target.value })}
            placeholder="Word"
          />
          <input
            value={draft.pinyin}
            onChange={(e) => setDraft({ ...draft, pinyin: e.target.value })}
            placeholder="Pinyin"
          />
          <input
            value={draft.translation}
            onChange={(e) => setDraft({ ...draft, translation: e.target.value })}
            placeholder="Meaning"
          />
          <button type="submit" className="vb-add-btn">
            Save
          </button>
        </form>
      )}

      {loading ? (
        <p className="vb-empty">Loading your words…</p>
      ) : cards.length === 0 ? (
        <p className="vb-empty">
          {search || source
            ? "Nothing here yet. Try another filter."
            : "No words saved yet. Hover any Chinese word in Read, Podcast, Scan or Study and press Alt+1 to keep it."}
        </p>
      ) : (
        <ul className="vb-list">
          {cards.map((card) => {
            const st = state(card);
            const open = openId === card.id;

            return (
              <li className={"vb-row" + (open ? " open" : "")} key={card.id}>
                <button
                  type="button"
                  className="vb-row-main"
                  onClick={() => setOpenId(open ? null : card.id)}
                  aria-expanded={open}
                >
                  <span className="vb-row-body">
                    <span className="vb-row-head">
                      <span className="vb-word">{card.word}</span>
                      {card.pinyin && (
                        <span className="vb-pinyin">{card.pinyin}</span>
                      )}
                    </span>

                    <span className="vb-meaning">
                      {card.translation || "No meaning saved yet"}
                    </span>

                    {/* The source line is what makes this a history rather
                        than a word list. */}
                    <span className="vb-src">
                      {(() => {
                        const Mark =
                          SOURCE_MARKS[card.source_module] || ManualMark;
                        return <Mark />;
                      })()}
                      {card.source
                        ? `${card.source.label} · ${card.source.title}`
                        : activeLabel(card.source_module)}
                      <span className="vb-src-date">
                        {formatDate(card.created_at)}
                      </span>
                    </span>
                  </span>

                  <span className={"vb-state vb-state-" + st.key}>
                    {st.label}
                  </span>
                </button>

                {/* "Where you learned this" — the sentence the word was met in
                    and a way back to the content it came from. */}
                {open && (
                  <div className="vb-detail">
                    {card.example ? (
                      <>
                        <p className="vb-detail-label">Example sentence</p>
                        <p className="vb-detail-example">{card.example}</p>
                      </>
                    ) : (
                      <p className="vb-detail-none">
                        No example sentence was captured for this word.
                      </p>
                    )}

                    <div className="vb-detail-foot">
                      {card.source ? (
                        <Link className="vb-detail-link" to={card.source.link}>
                          You found this in {card.source.title} →
                        </Link>
                      ) : (
                        <span className="vb-detail-none">
                          {activeLabel(card.source_module)}
                        </span>
                      )}

                      <span className="vb-detail-stats">
                        {card.review_count
                          ? `Reviewed ${card.review_count}× · ${card.correct_streak} in a row`
                          : "Not reviewed yet"}
                      </span>

                      <button
                        type="button"
                        className="vb-remove"
                        onClick={() => remove(card.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && page < lastPage && (
        <button
          type="button"
          className="vb-more"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading…" : `Load more (${cards.length} of ${total})`}
        </button>
      )}

      {session && (
        <VocabReview
          title={session.title}
          cards={session.cards}
          onClose={() => setSession(null)}
          onFinished={loadStats}
        />
      )}
    </div>
  );
}

/* The module name on its own, for a card whose specific source was never
   recorded (saved before this existed) or has since been deleted. */
function activeLabel(module) {
  const found = SOURCES.find((s) => s.key === module);
  return found ? found.label : "Added by you";
}
