import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { useApiData } from "../useApiData";
import { invalidate } from "../dataCache";
import { TRENDING, byTrending } from "../trending";
import PageTools from "../components/PageTools";
import ArticleEditDrawer from "../components/ArticleEditDrawer";
import { BookmarkIcon } from "../components/ArticleIcons";
import ArticleCover from "../components/ArticleCover";
import Skeleton, { SkeletonCards } from "../components/Skeleton";
import "./Read.css";

/* Stable identity for an absent list, so dependent `useMemo`s do not re-run on
   every render. */
const EMPTY = [];

/* FORMAT, not topic. An article can be about culture and a story can be about
   travel, so the two answer different questions and are shown differently: the
   format is a small badge on the cover, the topic is the shelf the card sits
   on. Collapsing them into one list is what put "Grammar" beside
   "Entertainment" as if a reader were choosing between them. */
/* TYPE_LABELS moved to components/ArticleCover.jsx along with the badge that
   renders it. */

/* The shelf order. Everyday Chinese leads because it is the one that answers
   "how is this language actually used", which is the reason most people are
   here; Business is last because it is the narrowest. Any topic not named here
   still gets a shelf, appended alphabetically — the page is driven by what has
   been published, never by this list alone, so adding a topic in the admin form
   never means editing the frontend. */
const TOPIC_ORDER = [
  "Everyday Chinese",
  "Culture",
  "Entertainment",
  "Stories",
  "Travel",
  "Business",
];

/* Four to a shelf, matching the Daily Use rows. Also what `auto-fill` settles
   on at the content column's width, so a full shelf fills its row exactly
   rather than leaving one empty track at the end. */
const SHELF_SIZE = 4;

/* The generated cover moved to components/ArticleCover.jsx, so the Dashboard's
   "Pick up where you left off" tile can wear the same one. Its glyph placement
   is still overridden here — see the `.rd-tile:nth-child` rules in Read.css —
   because alternating the offset only means anything inside a shelf. */

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/* One card everywhere — recommended, shelves, filtered results — so the same
   article never looks like two different things depending on where you met it.
   Cover, then format + topic + level, then the title, then how long it takes.
   Deliberately NO excerpt: this page is for choosing what to read, and four
   lines of body text per card is what made the old grid a wall. The reading is
   on the article's own page. */
function ArticleCard({ a }) {
  return (
    <Link className="rd-tile" to={`/read/${a.id}`}>
      <ArticleCover article={a} />
      <div className="rd-tile-body">
        <p className="rd-tile-meta">
          {[a.category, a.hsk_level].filter(Boolean).join(" · ")}
        </p>
        <p className="rd-tile-title">{a.title}</p>
        <p className="rd-tile-time">{a.reading_minutes || 1} min read</p>
      </div>
    </Link>
  );
}

function Shelf({ title, items, onViewAll, note }) {
  if (!items.length) return null;

  return (
    <section className="rd-shelf">
      <div className="rd-shelf-head">
        <h2 className="rd-shelf-title">{title}</h2>
        {onViewAll && (
          <button type="button" className="rd-viewall" onClick={onViewAll}>
            View all
            <ChevronIcon />
          </button>
        )}
      </div>
      {note && <p className="rd-shelf-note">{note}</p>}
      <div className="rd-row">
        {items.map((a) => (
          <ArticleCard key={a.id} a={a} />
        ))}
      </div>
    </section>
  );
}

export default function Read() {
  const { token, user } = useAuth();
  const [activeCategory, setActiveCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);

  /* Deliberately the SAME cache key the Dashboard uses for this list, so
     arriving here from the Dashboard paints instantly instead of refetching a
     list already in hand. */
  const articleQuery = useApiData("articles", () => api.getArticles(token));

  /* Fails soft and silently. The recommender needs learning preferences to
     score against, so a brand-new account legitimately gets nothing back —
     that is an empty shelf, not an error worth putting on screen above a page
     full of other things to read. */
  const recommendedQuery = useApiData(`articles:recommended:${SHELF_SIZE}`, () =>
    api.getRecommendedArticles(token, { limit: SHELF_SIZE }).catch(() => []),
  );

  const articles = articleQuery.data || EMPTY;
  const recommended = recommendedQuery.data || EMPTY;
  const loading = articleQuery.loading;
  const error = articleQuery.error?.message || null;

  /* The drawer owns the fields, the busy flag and the error; this only has to
     say what happens on success. It rethrows so the drawer can show the
     message against the form the admin is still looking at, rather than
     behind it on the page. */
  async function handleCreate(values) {
    await api.createArticle(token, values);
    setShowForm(false);
    /* Drop every cached view of the article library — the list, the
       recommendations and any single article — so the new piece cannot be
       missing from a page that still holds a pre-publish copy. */
    invalidate("articles", `articles:recommended:${SHELF_SIZE}`, "article:");
    articleQuery.refresh();
    recommendedQuery.refresh();
  }

  /* Only the topics that have something published, in the order above. The
     pills and the shelves read from this one list, so they can never offer
     different sets. */
  const topics = useMemo(() => {
    const present = [
      ...new Set(articles.map((a) => a.category).filter(Boolean)),
    ];
    const known = TOPIC_ORDER.filter((t) => present.includes(t));
    const extra = present.filter((t) => !TOPIC_ORDER.includes(t)).sort();
    return [...known, ...extra];
  }, [articles]);

  /* Picking a topic drops the shelves for one flat grid. Shelves answer "show
     me around"; a chosen topic answers "show me these", and three-at-a-time
     shelving would hide the rest from someone who has already said which they
     want. */
  const filtering = activeCategory !== "all";
  const isTrending = activeCategory === TRENDING;

  const results = useMemo(() => {
    /* Trending is the one pill here that is not a topic. It is a different CUT
       of the same library — "what are people actually reading" rather than
       "what is this about" — which is why it sits beside All, the other pill
       that is not a topic, instead of among the six that are. The ordering
       itself lives in src/trending.js, shared with the Dashboard. */
    if (isTrending) return byTrending(articles);
    return articles.filter((a) => a.category === activeCategory);
  }, [articles, activeCategory, isTrending]);

  const shelves = useMemo(
    () =>
      topics.map((topic) => ({
        topic,
        items: articles
          .filter((a) => a.category === topic)
          .slice(0, SHELF_SIZE),
      })),
    [topics, articles],
  );

  /* Counted off the list already on screen rather than fetched — `bookmarked`
     rides along on every row, so the badge costs nothing. */
  const savedCount = useMemo(
    () => articles.filter((a) => a.bookmarked).length,
    [articles],
  );

  return (
    <div className="rd">
      <div className="rd-topbar">
        <div className="rd-topbar-icons">
          <PageTools />
        </div>
      </div>

      <hr className="rd-divider" />

      {/* Still no page title, though the reason has changed: it used to be that
          the section toggle above already said Reads. The toggle is gone, so
          the sidebar — which keeps Explore > Read lit while you are here — is
          now what names the page. The original objection stands on its own
          anyway: a heading repeating the nav, with a line of copy under it
          telling the reader what a reading page is for, pushed the first
          article most of a screen down to say nothing they did not know. */}

      {error && <p className="rd-error">{error}</p>}

      {/* The publish form is the shared drawer now, not an inline block that
          pushed the whole library down the page while it was open. Same shell
          the tutor and study-unit editors use, so an admin meets one editing
          surface across the app rather than five. */}
      {showForm && user?.is_admin && (
        <ArticleEditDrawer onSave={handleCreate} onClose={() => setShowForm(false)} />
      )}

      {/* Categories left, search right.

          The two are not the same kind of control and they no longer look
          alike: the pills are the page's primary cut of the library, always
          visible and always showing which one you are on, while search is the
          escape hatch for when you already know what you want. A dropdown hid
          the topics behind a click — the whole list of what Verbo publishes was
          a thing you had to open — so it is a pill row now, which says what is
          here without being asked.

          Saved sits at the far right with the search: it is a DESTINATION, not
          a filter, and it has no business among controls that narrow in place. */}
      <div className="rd-bar">
        <div className="rd-pills">
          <button
            type="button"
            className={"rd-pill" + (activeCategory === "all" ? " active" : "")}
            onClick={() => setActiveCategory("all")}
          >
            All
          </button>
          {/* Beside All, not among the topics — see the note on `results`. */}
          <button
            type="button"
            className={"rd-pill" + (isTrending ? " active" : "")}
            onClick={() => setActiveCategory(TRENDING)}
          >
            Trending
          </button>
          {topics.map((t) => (
            <button
              key={t}
              type="button"
              className={"rd-pill" + (activeCategory === t ? " active" : "")}
              onClick={() => setActiveCategory(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="rd-bar-right">
          {/* Soft at rest, filled on hover — the same treatment the Dashboard's
              "View all" gets, so a link out of a list looks the same wherever
              it appears. The count is real: it comes off the articles already
              loaded, so it costs no request, and it is hidden at zero rather
              than showing a discouraging 0. */}
          <Link className="rd-saved-link" to="/saved">
            <BookmarkIcon />
            Saved
            {savedCount > 0 && (
              <span className="rd-saved-n">
                {savedCount}
                {/* The word is kept for screen readers — "Saved, 1" alone does
                    not say one what. */}
                <span className="rd-sr">
                  {savedCount === 1 ? " article" : " articles"}
                </span>
              </span>
            )}
          </Link>

          {user?.is_admin && (
            <button
              type="button"
              className="rd-new-btn"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Cancel" : "New"}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        /* Two shelves' worth of card shapes rather than the word "Loading" —
           the page keeps its height and rhythm, so nothing jumps when the real
           cards arrive in their place. */
        <>
          {[0, 1].map((i) => (
            <section className="rd-shelf" key={i}>
              <div className="rd-shelf-head">
                <Skeleton className="rd-shelf-title" style={{ width: 168, height: 20 }} />
              </div>
              <SkeletonCards className="rd-row" count={4} mediaHeight={132} />
            </section>
          ))}
        </>
      ) : filtering ? (
        <section className="rd-shelf">
          <div className="rd-shelf-head">
            <h2 className="rd-shelf-title">
              {isTrending ? "Trending" : activeCategory}
            </h2>
          </div>
          {results.length > 0 && (
            <p className="rd-shelf-note">
              {results.length} {results.length === 1 ? "article" : "articles"}
              {/* The ordering is stated, because it is not visible: the card
                  carries no like count, so without this the grid is just a
                  list in an order the reader cannot account for. */}
              {isTrending ? " · most liked first" : ` in ${activeCategory}`}
            </p>
          )}
          {results.length === 0 ? (
            <p className="rd-empty">
              {isTrending
                ? "No likes yet. Once readers start liking articles, the most liked appear here."
                : "Nothing here yet. Try another topic or a different word."}
            </p>
          ) : (
            <div className="rd-row">
              {results.map((a) => (
                <ArticleCard key={a.id} a={a} />
              ))}
            </div>
          )}
        </section>
      ) : articles.length === 0 ? (
        <p className="rd-empty">No articles yet.</p>
      ) : (
        <>
          {/* First, because the app already knows this reader's level, goals
              and interests — leading with anything else asks them to do the
              sorting Verbo could have done for them. No "View all": the
              recommender returns a ranked few, and there is no longer list
              behind them to open. */}
          <Shelf
            title="Recommended for You"
            items={recommended}
            note={
              recommended.length
                ? "Picked from your level, goals and interests."
                : null
            }
          />

          {shelves.map((s) => (
            <Shelf
              key={s.topic}
              title={s.topic}
              items={s.items}
              /* Filters the page rather than opening a route of its own: the
                 grid it would navigate to is the one the topic dropdown
                 already builds, and a second copy of it is a second thing to
                 keep true. */
              onViewAll={() => setActiveCategory(s.topic)}
            />
          ))}
        </>
      )}
    </div>
  );
}
