import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

/* Always relative, however old - "3 months ago", "1 year ago" - as the
   review cards this list is built to do. The exact date sits in the hover
   title for anyone who needs it. */
const UNITS = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "Just now";
  for (const [unit, size] of UNITS) {
    const n = Math.floor(secs / size);
    if (n >= 1) return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  }
  return "Just now";
}

function fullDate(iso) {
  return iso
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(iso))
    : undefined;
}

/* Five soft tints for the initial circle, picked from the name so the same
   person always wears the same one - the review-card look, where a list of
   circles in one colour reads as one person talking to themselves. */
const TONES = 5;

function toneFor(name) {
  let h = 0;
  for (const ch of name || "?") h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % TONES;
}

function Face({ name, src }) {
  if (src) return <img className="rd-cm-face" src={src} alt="" />;
  return (
    <span className={`rd-cm-face rd-cm-initial rd-cm-tone-${toneFor(name)}`}>
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
  /* A CARD PER COMMENT: the face, name and time across the top, the words
     beneath at the card's full width, the actions last and quiet. */
  return (
    <div className={`rd-cm${isReply ? " rd-cm-reply" : ""}`}>
      <div className="rd-cm-head">
        <Face name={c.user?.name} src={c.user?.avatar_url} />
        <span className="rd-cm-name">{c.user?.name || "Someone"}</span>
        <span className="rd-cm-time" title={fullDate(c.created_at)}>
          {timeAgo(c.created_at)}
          {c.edited && " · edited"}
        </span>
      </div>

      <div className="rd-cm-body">

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
    </div>
  );
}

export default function ArticleComments({ articleId, onCountChange }) {
  const { token, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
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

  function post() {
    if (busy || !draft.trim()) return;
    run(async () => {
      await api.addArticleComment(token, articleId, draft);
      setDraft("");
      setComposing(false);
    });
  }

  const total = items.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  return (
    <section className="rd-comments">
      <div className="rd-sec-head">
        <h2 className="rd-sec-title">Comments</h2>
        <span className="rd-sec-count">{total}</span>
      </div>

      {user ? (
        /* THE COMPOSER IS A COMMENT CARD WAITING TO BE FILLED: the same box,
           the same face-and-name row, so what you write already looks like
           where it will land. The field has no frame of its own - the card
           is the frame, and it lights up while you are in it. */
        /* COLLAPSED UNTIL CLICKED: one slim row, the face and a one-line
           field. Focusing it opens the card to three lines with Cancel and
           Comment on the right. Cancel clears the draft and folds it back;
           posting folds it back too. No keyboard shortcut, at the user's
           request - Enter is always a new line. */
        <form
          className={`rd-cm-new${composing ? " open" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            post();
          }}
        >
          <div className="rd-cm-new-row">
            <Face name={user.name} src={user.avatar_url} />
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setComposing(true)}
              placeholder="Add a comment…"
              rows={1}
              aria-label="Write a comment"
            />
          </div>
          {composing && (
            <div className="rd-cm-new-foot">
              <button
                type="button"
                className="rd-cm-quiet"
                onClick={() => {
                  setDraft("");
                  setComposing(false);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rd-cm-send"
                disabled={busy || !draft.trim()}
              >
                Comment
              </button>
            </div>
          )}
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
          <li key={c.id} className="rd-cm-thread">
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
                  <li key={r.id}>
                  <Row
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
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
