import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import SectionToggle from "../components/SectionToggle";
import PageTools from "../components/PageTools";
import { BookmarkIcon } from "../components/ArticleIcons";
import "./Read.css";

/* FORMAT, not topic. An article can be about culture and a story can be about
   travel, so the two answer different questions and are shown differently: the
   format is a small badge on the cover, the topic is the shelf the card sits
   on. Collapsing them into one list is what put "Grammar" beside
   "Entertainment" as if a reader were choosing between them. */
const TYPE_LABELS = {
  article: "Article",
  story: "Story",
  funfact: "Fun fact",
};

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

const SHELF_SIZE = 3;

/* A cover for every article without anyone uploading one.
 *
 * Photography is the one part of this page that cannot be derived from the
 * text, and 15 of 18 articles had none — so every shelf was a column of the
 * same lavender block and the page read as unfinished. These are not fake
 * photos: each topic gets its own gradient and the character it turns on, so a
 * cover says which shelf you are looking at rather than pretending to depict
 * something.
 *
 * An uploaded image still wins wherever one exists. This is the floor, not a
 * replacement — the moment a real photo is attached to an article it takes
 * over.
 *
 * The key is the topic, so a topic with no entry here still gets the default
 * pairing rather than a blank cover. */
const TOPIC_ART = {
  "Everyday Chinese": "日",
  Culture: "文",
  Entertainment: "乐",
  Stories: "事",
  Travel: "行",
  Business: "商",
};

function topicKey(category) {
  return TOPIC_ART[category] ? category.toLowerCase().replace(/\s+/g, "-") : "default";
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

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

/* One card everywhere — recommended, shelves, search results — so the same
   article never looks like two different things depending on where you met it.
   Cover, then format + topic + level, then the title, then how long it takes.
   Deliberately NO excerpt: this page is for choosing what to read, and four
   lines of body text per card is what made the old grid a wall. The reading is
   on the article's own page. */
function ArticleCard({ a }) {
  return (
    <Link className="rd-tile" to={`/read/${a.id}`}>
      <div className="rd-tile-media" data-topic={topicKey(a.category)}>
        {a.image_url ? (
          <img src={a.image_url} alt="" />
        ) : (
          /* aria-hidden: it is a texture standing in for a photograph, and a
             screen reader announcing a lone character here would be noise. */
          <span className="rd-tile-glyph" aria-hidden="true">
            {TOPIC_ART[a.category] || "读"}
          </span>
        )}
        <span className="rd-tile-format">
          {TYPE_LABELS[a.type] || a.type}
        </span>
      </div>
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
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [recommended, setRecommended] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("article");
  const [body, setBody] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadArticles();

    /* Fails soft and silently. The recommender needs learning preferences to
       score against, so a brand-new account legitimately gets nothing back —
       that is an empty shelf, not an error worth putting on screen above a page
       full of other things to read. */
    api
      .getRecommendedArticles(token, { limit: SHELF_SIZE })
      .then(setRecommended)
      .catch(() => setRecommended([]));
  }, [token]);

  function loadArticles() {
    setLoading(true);
    api
      .getArticles(token)
      .then(setArticles)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createArticle(token, {
        title,
        type,
        body,
        body_en: bodyEn,
        image,
      });
      setTitle("");
      setType("article");
      setBody("");
      setBodyEn("");
      setImage(null);
      setShowForm(false);
      loadArticles();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  /* Only the topics that have something published, in the order above. The
     dropdown and the shelves read from this one list, so they can never offer
     different sets. */
  const topics = useMemo(() => {
    const present = [
      ...new Set(articles.map((a) => a.category).filter(Boolean)),
    ];
    const known = TOPIC_ORDER.filter((t) => present.includes(t));
    const extra = present.filter((t) => !TOPIC_ORDER.includes(t)).sort();
    return [...known, ...extra];
  }, [articles]);

  /* Searching or picking a topic drops the shelves for one flat grid. Shelves
     answer "show me around"; a search answers "find me this", and three-at-a-
     time shelving actively hides matches from someone who has already said what
     they want. */
  const searching = query.trim().length > 0 || activeCategory !== "all";

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (activeCategory !== "all" && a.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      // Excerpt included: half of remembering an article is remembering a line
      // out of it rather than its title.
      return [a.title, a.category, a.hsk_level, a.excerpt]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));
    });
  }, [articles, activeCategory, query]);

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
        <SectionToggle active="read" />
        <div className="rd-topbar-icons">
          <PageTools />
        </div>
      </div>

      <hr className="rd-divider" />

      {/* No page title. The section toggle directly above already says Reads,
          and a heading that repeats it — with a line of copy under it telling
          the reader what a reading page is for — pushed the first article most
          of a screen down to say nothing they did not know. */}

      {error && <p className="rd-error">{error}</p>}

      {showForm && user?.is_admin && (
        <form className="rd-form" onSubmit={handleCreate}>
          <div>
            <label>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="article">Article</option>
              <option value="story">Story</option>
              <option value="funfact">Fun fact</option>
            </select>
          </div>
          <div>
            <label>Body (Chinese text)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              required
            />
          </div>
          <div>
            <label>
              English translation (optional — enables the EN toggle)
            </label>
            <textarea
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              rows={6}
            />
          </div>
          <div>
            <label>Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files[0])}
            />
          </div>
          <button
            type="submit"
            className="rd-btn-primary"
            disabled={submitting}
          >
            {submitting ? "Publishing..." : "Publish"}
          </button>
        </form>
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
        <div className="rd-bar-right">
          <label className="rd-search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles"
              aria-label="Search articles"
            />
          </label>

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

        <div className="rd-pills">
          <button
            type="button"
            className={"rd-pill" + (activeCategory === "all" ? " active" : "")}
            onClick={() => setActiveCategory("all")}
          >
            All
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
      </div>

      {loading ? (
        <p className="rd-empty">Loading...</p>
      ) : searching ? (
        <section className="rd-shelf">
          <div className="rd-shelf-head">
            {/* A typed query wins the heading. The topic is still applied and
                still shown in the dropdown, but naming the shelf after it while
                someone is searching reads as though the search had been
                ignored. */}
            <h2 className="rd-shelf-title">
              {query.trim() ? `Results for “${query.trim()}”` : activeCategory}
            </h2>
            <button
              type="button"
              className="rd-viewall"
              onClick={() => {
                setActiveCategory("all");
                setQuery("");
              }}
            >
              Back to browsing
            </button>
          </div>
          {results.length > 0 && (
            <p className="rd-shelf-note">
              {results.length} {results.length === 1 ? "article" : "articles"}
              {activeCategory !== "all" && ` in ${activeCategory}`}
            </p>
          )}
          {results.length === 0 ? (
            <p className="rd-empty">
              Nothing here yet. Try another topic or a different word.
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
