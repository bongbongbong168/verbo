import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import MenuDotsIcon from "../components/MenuDotsIcon";
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
 * The word, picked out of the sentence around it.
 *
 * Seeing WHERE a word sits is most of what an example teaches — which
 * characters belong to it, what comes before and after. An unmarked sentence
 * makes the reader hunt for the word they just clicked.
 *
 * Splits on the literal word rather than using a regex, so a word containing
 * regex metacharacters cannot break the render.
 */
function Marked({ text, word }) {
  if (!word || !text?.includes(word)) return text || null;

  const parts = text.split(word);

  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && <mark className="vb-mark">{word}</mark>}
    </span>
  ));
}

/**
 * Sentences from elsewhere in the library.
 *
 * Renders nothing at all while loading and nothing when there are none AND the
 * card already carries a saved example — a "no examples found" line under a
 * word that already shows one is noise. It speaks up only when the panel would
 * otherwise be empty.
 */
function Examples({ state, word, hasSaved }) {
  if (!state || state.loading) return null;

  const items = state.items || [];

  if (!items.length) {
    return hasSaved ? null : (
      <p className="vb-detail-none">
        This word does not appear anywhere else in your library yet.
      </p>
    );
  }

  return (
    <div className="vb-ex">
      <p className="vb-detail-label">
        {hasSaved ? "Also used in" : "Used in"}
      </p>
      <ul className="vb-ex-list">
        {items.map((ex, i) => (
          <li className="vb-ex-item" key={i}>
            <p className="vb-ex-cn">
              <Marked text={ex.text} word={word} />
            </p>
            {ex.pinyin && <p className="vb-ex-py">{ex.pinyin}</p>}
            {/* Only study lines carry a human translation. Nothing here is
                machine-translated, so most sentences show none rather than a
                guess. */}
            {ex.english && <p className="vb-ex-en">{ex.english}</p>}
            <p className="vb-ex-src">
              {ex.source.link ? (
                <Link to={ex.source.link}>
                  {ex.source.label} · {ex.source.title}
                </Link>
              ) : (
                <span>
                  {ex.source.label} · {ex.source.title}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
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
  /* Keyed by card id and kept for the session: reopening a word you were just
     looking at should not re-run four table scans, and the sentences cannot
     change while you sit on this page. */
  const [examples, setExamples] = useState({});
  const askedRef = useRef(new Set());

  /* The per-row ⋮ menu — `rowMenuFor` holds a card id, distinct from `menuOpen`
     above, which is the Review dropdown in the header. */
  const [rowMenuFor, setRowMenuFor] = useState(null);
  const [menuUp, setMenuUp] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null);

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

  /* Dismiss the row menu on any click outside it. The toggle button lives
     inside `.vb-row-actions`, so it keeps handling its own open/close — the
     same arrangement Scan's document rows use. */
  useEffect(() => {
    if (rowMenuFor === null) return;

    function onDocClick(e) {
      if (!e.target.closest(".vb-row-actions")) {
        setRowMenuFor(null);
        setConfirmingDelete(null);
      }
    }

    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [rowMenuFor]);

  /* An armed Delete disarms after 4s. On a timer rather than on blur, because
     blur never fires if focus never landed on the button — the same reason
     Scan's page-level delete uses one. */
  useEffect(() => {
    if (confirmingDelete === null) return;
    const t = setTimeout(() => setConfirmingDelete(null), 4000);
    return () => clearTimeout(t);
  }, [confirmingDelete]);

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

  /* Fetched when a word is opened, not with the list. A bank grows without
     bound and nobody opens every row, so scanning four tables per card up
     front would be almost entirely wasted work.

     A failure sets `items: []` rather than surfacing an error: this is
     supporting material under the word, and a red message here would be louder
     than the thing it is attached to. The panel simply says none were found. */
  /* The "already asked" set is a REF, not the state above.
     Listing `examples` as a dependency made this effect cancel its own
     request: writing `{loading: true}` changed `examples`, which re-ran the
     effect, whose cleanup flipped the first run's `live` flag to false — so the
     200 that came back was discarded and the panel stayed empty forever.

     A ref is read without subscribing to it, so the deps stay down to what
     actually decides whether to fetch. No `live` flag is needed either: the
     result is written under its own card's id, so a response arriving after
     that word was closed just fills the cache, which is exactly what should
     happen. */
  useEffect(() => {
    if (!openId || askedRef.current.has(openId)) return;

    askedRef.current.add(openId);
    setExamples((e) => ({ ...e, [openId]: { loading: true } }));

    api
      .getFlashcardExamples(token, openId)
      .then((items) => setExamples((e) => ({ ...e, [openId]: { items } })))
      .catch(() => setExamples((e) => ({ ...e, [openId]: { items: [] } })));
  }, [openId, token]);

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

  /* Arms on the first click and acts on the second — the pattern Scan's delete
     and the classroom item's use. A saved word is not recoverable: the bank is
     the only record that this learner ever met it, and the example sentence was
     captured at save time and cannot be found again. */
  async function remove(id) {
    if (confirmingDelete !== id) {
      setConfirmingDelete(id);
      return;
    }

    setError(null);
    try {
      await api.deleteFlashcard(token, id);
      setCards((prev) => prev.filter((c) => c.id !== id));
      setTotal((t) => Math.max(t - 1, 0));
      // The panel belongs to a row that no longer exists.
      setOpenId((cur) => (cur === id ? null : cur));
      loadStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setRowMenuFor(null);
      setConfirmingDelete(null);
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
                {/* The row button and the ⋮ are SIBLINGS, not nested: a button
                    inside a button is invalid and the inner one never gets its
                    own click. `.vb-row-top` is what keeps them on one line. */}
                <div className="vb-row-top">
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

                <div className="vb-row-actions">
                  <button
                    type="button"
                    className="vb-row-menu"
                    aria-label={`Options for ${card.word}`}
                    aria-expanded={rowMenuFor === card.id}
                    onClick={(e) => {
                      /* Flip the menu above the button when it would open off
                         the bottom of the screen — the last row of a long list
                         sits at the viewport's edge, and a menu nobody can see
                         is the same as no menu. Both numbers are painted
                         viewport pixels, so they compare directly; this is only
                         a class, never a px value written back inside `#root`,
                         which is where the zoom would double-apply. */
                      const r = e.currentTarget.getBoundingClientRect();
                      const below = window.innerHeight - r.bottom;
                      setMenuUp(below < 180 && r.top > below);
                      setRowMenuFor((cur) => (cur === card.id ? null : card.id));
                      setConfirmingDelete(null);
                    }}
                  >
                    <MenuDotsIcon />
                  </button>

                  {rowMenuFor === card.id && (
                    <div
                      className={
                        "vb-rowmenu " +
                        (menuUp ? "vb-rowmenu-up" : "vb-rowmenu-down")
                      }
                    >
                      {/* Only offered where the card actually points at
                          something. A card whose source was deleted keeps its
                          module label and loses the link — an item that
                          navigates nowhere would be worse than its absence. */}
                      {card.source && (
                        <Link className="vb-rowmenu-item" to={card.source.link}>
                          Open {card.source.label.toLowerCase()}
                        </Link>
                      )}
                      <button
                        type="button"
                        className="vb-rowmenu-item"
                        onClick={() => {
                          setOpenId(open ? null : card.id);
                          setRowMenuFor(null);
                        }}
                      >
                        {open ? "Hide details" : "Show details"}
                      </button>
                      <button
                        type="button"
                        className="vb-rowmenu-item vb-rowmenu-danger"
                        onClick={() => remove(card.id)}
                      >
                        {confirmingDelete === card.id
                          ? "Confirm delete"
                          : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
                </div>

                {/* "Where you learned this" — the sentence the word was met in
                    and a way back to the content it came from. */}
                {open && (
                  <div className="vb-detail">
                    {card.example ? (
                      <>
                        <p className="vb-detail-label">Where you met it</p>
                        <p className="vb-detail-example">
                          <Marked text={card.example} word={card.word} />
                        </p>
                      </>
                    ) : (
                      <p className="vb-detail-none">
                        No example sentence was captured for this word.
                      </p>
                    )}

                    {/* Sentences found across everything else in the library.
                        Distinct from the one above, which is the passage this
                        learner actually read — so it keeps its own heading
                        rather than being folded into one undifferentiated
                        list. */}
                    <Examples
                      state={examples[card.id]}
                      word={card.word}
                      hasSaved={!!card.example}
                    />

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

                      {/* Removing a word lives in the row's ⋮ menu now, not
                          here. It was reachable only after opening a panel,
                          which is why it could not be found — and it deleted on
                          a single click, the one delete in the app that did. */}
                      <span className="vb-detail-stats">
                        {card.review_count
                          ? `Reviewed ${card.review_count}× · ${card.correct_streak} in a row`
                          : "Not reviewed yet"}
                      </span>
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
