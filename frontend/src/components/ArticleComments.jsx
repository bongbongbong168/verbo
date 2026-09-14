import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function Face({ name, src }) {
  if (src) return <img className="rd-cm-face" src={src} alt="" />;
  return (
    <span className="rd-cm-face rd-cm-initial">
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Comments on an article, with one level of replies.
 *
 * The server flattens a reply-to-a-reply onto its top-level parent, so this
 * only ever renders two levels and needs no recursion.
 */
/* HOISTED OUT OF `ArticleComments`, AND THAT IS THE WHOLE FIX FOR "I type in
   the reply and it jumps".

   This was declared INSIDE the component, so every render produced a new
   function — a different component TYPE as far as React is concerned. The
   reply draft lives in the parent, so every keystroke re-rendered the parent,
   which unmounted this whole subtree and mounted a fresh one: the textarea
   was a brand-new DOM node on each letter, losing focus and the caret with
   it. Measured: the textarea`s bounding box went to 0x0 the moment a
   character was typed, because the element under test had been destroyed.

   Declared once at module scope it keeps one identity, so React updates the
   existing textarea instead of replacing it. Everything it used to close over
   is passed in — which is also why it can no longer quietly depend on parent
   state that changes as you type. */
function Row({
  c,
  isReply,
  token,
  articleId,
  busy,
  run,
  editing,
  setEditing,
  editDraft,
  setEditDraft,
  replyTo,
  setReplyTo,
  replyDraft,
  setReplyDraft,
}) {
  const isEditing = editing === c.id;
  return (
    <li className={`rd-cm${isReply ? " rd-cm-reply" : ""}`}>
      <Face name={c.user?.name} src={c.user?.avatar_url} />

      <div className="rd-cm-body">
        <div className="rd-cm-head">
          <span className="rd-cm-name">{c.user?.name || "Someone"}</span>
          <span className="rd-cm-time">
            {timeAgo(c.created_at)}
            {c.edited && " · edited"}
          </span>
        </div>

        {isEditing ? (
          <form
            className="rd-cm-edit"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.updateArticleComment(token, c.id, editDraft);
                setEditing(null);
              });
            }}
          >
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={2}
              autoFocus
            />
            <div className="rd-cm-edit-actions">
              <button
                type="submit"
                className="rd-cm-send"
                disabled={busy || !editDraft.trim()}
              >
                Save
              </button>
              <button
                type="button"
                className="rd-cm-quiet"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="rd-cm-text">{c.content}</p>
        )}

        {!isEditing && (
          <div className="rd-cm-tools">
            {/* Replies are one level deep, so a reply's button still targets
                the top-level comment — the server enforces the same rule. */}
            <button
              type="button"
              onClick={() => {
                setReplyTo(replyTo === c.id ? null : c.id);
                setReplyDraft("");
              }}
            >
              Reply
            </button>
            {c.mine && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(c.id);
                    setEditDraft(c.content);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rd-cm-danger"
                  onClick={() =>
                    run(() => api.deleteArticleComment(token, c.id))
                  }
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {replyTo === c.id && (
          <form
            className="rd-cm-edit"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.addArticleComment(
                  token,
                  articleId,
                  replyDraft,
                  c.id,
                );
                setReplyTo(null);
                setReplyDraft("");
              });
            }}
          >
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder={`Reply to ${c.user?.name || "this comment"}…`}
              rows={2}
              autoFocus
            />
            <div className="rd-cm-edit-actions">
              <button
                type="submit"
                className="rd-cm-send"
                disabled={busy || !replyDraft.trim()}
              >
                Reply
              </button>
              <button
                type="button"
                className="rd-cm-quiet"
                onClick={() => setReplyTo(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </li>
  );
}

export default function ArticleComments({ articleId, onCountChange }) {
  const { token, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  /* THE CALLBACK IS HELD IN A REF, AND IT MUST NOT BE A DEPENDENCY OF `load`.
     `ReadArticle` passes an inline arrow, so the prop is a new function on
     every parent render — and reporting the count sets parent state to a
     freshly built object, which React can never bail out of. So the chain ran
     load -> onCountChange -> parent renders -> new prop -> new `load` -> the
     effect below fires again -> load, without end: an infinite GET of this
     article's comments that burned the shared 300/min bucket and put "Too many
     requests" on screen. Typing only made it obvious, because a re-render
     while the loop ran surfaced the error beside the box.

     A ref is the fix rather than asking every caller to remember `useCallback`:
     the newest callback is always the one invoked, and `load` stays stable. */
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  });

  const load = useCallback(() => {
    setLoading(true);
    api
      .getArticleComments(token, articleId)
      .then((data) => {
        setItems(data);
        const report = onCountChangeRef.current;
        if (report) {
          report(data.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, articleId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(work) {
    if (!user) {
      setError("Please log in to use this feature.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await work();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const total = items.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  return (
    <section className="rd-comments">
      <div className="rd-sec-head">
        <h2 className="rd-sec-title">Comments</h2>
        <span className="rd-sec-count">{total}</span>
      </div>

      {/* Everything below the heading is one card, so the conversation has a
          visible beginning and end instead of floating on the page ground. */}
      <div className="rd-cm-panel">

      {user ? (
        <form
          className="rd-cm-new"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.addArticleComment(token, articleId, draft);
              setDraft("");
            });
          }}
        >
          <Face name={user.name} src={user.avatar_url} />
          <div className="rd-cm-new-body">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a question or share what you noticed…"
              rows={2}
            />
            <button
              type="submit"
              className="rd-cm-send"
              disabled={busy || !draft.trim()}
            >
              Post comment
            </button>
          </div>
        </form>
      ) : (
        <p className="rd-cm-locked">Please log in to join the discussion.</p>
      )}

      {error && <p className="rd-error">{error}</p>}

      {loading && items.length === 0 && (
        <p className="rd-cm-empty">Loading comments…</p>
      )}

      {!loading && items.length === 0 && (
        <p className="rd-cm-empty">
          No comments yet — be the first to ask something.
        </p>
      )}

      <ul className="rd-cm-list">
        {items.map((c) => (
          <div key={c.id}>
            <Row
              c={c}
              token={token}
              articleId={articleId}
              busy={busy}
              run={run}
              editing={editing}
              setEditing={setEditing}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              replyDraft={replyDraft}
              setReplyDraft={setReplyDraft}
            />
            {c.replies?.length > 0 && (
              <ul className="rd-cm-replies">
                {c.replies.map((r) => (
                  <Row
                    key={r.id}
                    c={r}
                    isReply
                    token={token}
                    articleId={articleId}
                    busy={busy}
                    run={run}
                    editing={editing}
                    setEditing={setEditing}
                    editDraft={editDraft}
                    setEditDraft={setEditDraft}
                    replyTo={replyTo}
                    setReplyTo={setReplyTo}
                    replyDraft={replyDraft}
                    setReplyDraft={setReplyDraft}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </ul>
      </div>
    </section>
  );
}
