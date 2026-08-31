import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import PageTools from "../components/PageTools";
import "./Read.css";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * "My Saved Articles" — everything the reader bookmarked, newest save first.
 *
 * Ordered by when it was SAVED rather than when it was written: this list is a
 * record of what you put aside, so the thing you saved last belongs at the top.
 */
export default function SavedArticles() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .getBookmarks(token)
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function unsave(id) {
    setBusy(id);
    // Removed from the list immediately — the row is gone either way, and
    // waiting on the round-trip makes the click feel broken.
    setItems((list) => list.filter((a) => a.id !== id));
    try {
      await api.toggleArticleBookmark(token, id);
    } catch (err) {
      setError(err.message);
      api
        .getBookmarks(token)
        .then(setItems)
        .catch(() => {});
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rd">
      <div className="rd-topbar">
        <h1 className="rd-page-title">My Saved Articles</h1>
        <div className="rd-topbar-icons">
          <PageTools />
        </div>
      </div>

      <hr className="rd-divider" />

      {error && <p className="rd-error">{error}</p>}

      <div className="rd-panel">
        {loading && <p className="rd-empty">Loading your saved articles…</p>}

        {!loading && items.length === 0 && (
          <div className="rd-saved-empty">
            <p className="rd-empty">
              Nothing saved yet. Open an article and press <strong>Save</strong>{" "}
              to keep it here.
            </p>
            <Link className="rd-btn-primary" to="/read">
              Browse articles
            </Link>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="rd-grid">
            {items.map((a) => (
              <div className="rd-card rd-card-saved-row" key={a.id}>
                <Link className="rd-card-link" to={`/read/${a.id}`}>
                  <div className="rd-card-body">
                    {/* Same card as the Read list, so it drops the chips with
                        it — the two must not drift apart. */}
                    <p className="rd-card-title">{a.title}</p>
                    {a.excerpt && (
                      <p className="rd-card-excerpt">{a.excerpt}</p>
                    )}
                    <p className="rd-card-savedat">
                      Saved {formatDate(a.saved_at)}
                    </p>
                  </div>

                  <div className="rd-thumb">
                    {a.image_url && <img src={a.image_url} alt="" />}
                  </div>
                </Link>

                <button
                  type="button"
                  className="rd-unsave"
                  onClick={() => unsave(a.id)}
                  disabled={busy === a.id}
                  title="Remove from saved"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
