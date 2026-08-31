import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import SectionToggle from "../components/SectionToggle";
import PageTools from "../components/PageTools";
import {
  BookmarkIcon,
  CommentIcon,
  HeartIcon,
} from "../components/ArticleIcons";
import "./Read.css";

const TYPE_LABELS = {
  article: "Article",
  story: "Story",
  funfact: "Fun fact",
};

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Read() {
  const { token, user } = useAuth();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeType, setActiveType] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [type, setType] = useState("article");
  const [body, setBody] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadArticles();
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

  // Only offer filters for types that actually have content.
  const availableTypes = useMemo(() => {
    const present = new Set(articles.map((a) => a.type));
    return Object.keys(TYPE_LABELS).filter((t) => present.has(t));
  }, [articles]);

  const visible = useMemo(
    () =>
      activeType === "all"
        ? articles
        : articles.filter((a) => a.type === activeType),
    [articles, activeType],
  );

  /* Counted off the list already on screen rather than fetched — `bookmarked`
     rides along on every row, so the badge costs nothing. */
  const savedCount = useMemo(
    () => articles.filter((a) => a.bookmarked).length,
    [articles],
  );

  const [featured, ...rest] = visible;

  return (
    <div className="rd">
      <div className="rd-topbar">
        <SectionToggle active="read" />
        <div className="rd-topbar-icons">
          <PageTools />
        </div>
      </div>

      <hr className="rd-divider" />

      <div className="rd-heading-row">
        <h1 className="rd-heading">Read Station</h1>
        {user?.is_admin && (
          <button
            type="button"
            className="rd-new-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "New article"}
          </button>
        )}
      </div>

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

      {/* Two different KINDS of control, so they sit at opposite ends rather
          than in one row of five lookalike pills.

          The type pills are filters: mutually exclusive, and they narrow the
          list in place. "Saved articles" is a destination — it navigates to a
          different page. Side by side they read as a fifth filter, which is
          exactly the wrong promise. Left/right separation is what makes the
          grouping say what each one does. */}
      <div className="rd-filters">
        <div className="rd-filter-group">
          {availableTypes.length > 1 && (
            <>
              <button
                type="button"
                className={"rd-filter" + (activeType === "all" ? " active" : "")}
                onClick={() => setActiveType("all")}
              >
                All
              </button>
              {availableTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={"rd-filter" + (activeType === t ? " active" : "")}
                  onClick={() => setActiveType(t)}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Soft at rest, filled on hover — the same treatment the Dashboard's
            "View all" gets, so a link out of a list looks the same wherever it
            appears. The count is real: it comes off the articles already
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
      </div>

      <div className="rd-panel">
        {loading ? (
          <p className="rd-empty">Loading...</p>
        ) : visible.length === 0 ? (
          <p className="rd-empty">No articles yet.</p>
        ) : (
          <>
            <Link className="rd-featured" to={`/read/${featured.id}`}>
              <div className="rd-featured-body">
                <h2 className="rd-featured-title">{featured.title}</h2>
                {featured.excerpt && (
                  <p className="rd-featured-excerpt">{featured.excerpt}</p>
                )}
              </div>
              <div className="rd-thumb rd-thumb-lg">
                {featured.image_url && <img src={featured.image_url} alt="" />}
                <span className="rd-thumb-date">
                  {formatDate(featured.created_at)}
                </span>
              </div>
            </Link>

            {rest.length > 0 && (
              <>
                <span className="rd-type-pill">
                  {TYPE_LABELS[featured.type] || featured.type}
                </span>
                <div className="rd-grid">
                  {rest.map((a) => (
                    <Link className="rd-card" key={a.id} to={`/read/${a.id}`}>
                      <div className="rd-card-body">
                        {/* No HSK / category / reading-time chips here. The
                            article's own page still carries them; on a card
                            they crowded the title, which is the thing someone
                            is actually choosing between. */}
                        <p className="rd-card-title">{a.title}</p>
                        {a.excerpt && (
                          <p className="rd-card-excerpt">{a.excerpt}</p>
                        )}

                        {/* Counts only, no buttons: the card is for choosing
                            what to read, and liking from here would mean
                            reacting to something you have not read yet. */}
                        <div className="rd-card-stats">
                          <span className={a.liked ? "on" : ""}>
                            <HeartIcon filled={!!a.liked} />
                            {a.likes_count ?? 0}
                          </span>
                          <span>
                            <CommentIcon />
                            {a.comments_count ?? 0}
                          </span>
                          {a.bookmarked && (
                            <span className="rd-card-saved">Saved</span>
                          )}
                        </div>
                      </div>
                      <div className="rd-thumb">
                        {a.image_url && <img src={a.image_url} alt="" />}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
