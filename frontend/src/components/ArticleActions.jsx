import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import {
  BookmarkIcon,
  CommentIcon,
  HeartIcon,
  ShareIcon,
} from "./ArticleIcons";

/** Where a share can go. Kept short — this is not a social network. */
const TARGETS = [
  {
    key: "telegram",
    label: "Telegram",
    href: (url, title) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
  {
    key: "facebook",
    label: "Facebook",
    href: (url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    key: "x",
    label: "X",
    href: (url, title) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
  },
];

/**
 * Like / Save / Share under an article.
 *
 * Every toggle takes its new state from the SERVER's response rather than
 * flipping a local boolean — the endpoint returns the fresh counts plus this
 * viewer's own state, so the button and the database cannot drift apart.
 */
export default function ArticleActions({
  articleId,
  title,
  initial,
  onChange,
}) {
  const { token, user } = useAuth();
  const [state, setState] = useState(
    initial || { likes: 0, liked: false, bookmarked: false, comments: 0 },
  );
  const [busy, setBusy] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState(null);
  const shareRef = useRef(null);

  useEffect(() => {
    if (initial) setState(initial);
  }, [initial]);

  useEffect(() => {
    if (!shareOpen) return;
    function away(e) {
      if (!shareRef.current?.contains(e.target)) setShareOpen(false);
    }
    function esc(e) {
      if (e.key === "Escape") setShareOpen(false);
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [shareOpen]);

  const url = typeof window !== "undefined" ? window.location.href : "";

  async function run(key, work) {
    if (!user) {
      setNote("Please log in to use this feature.");
      return;
    }
    setBusy(key);
    try {
      const next = await work();
      setState(next);
      // The card list behind this page shows the same counts.
      if (onChange) onChange(next);
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      // Reverts on a timer rather than on blur — blur never fires if focus
      // never landed on the button.
      setTimeout(() => setCopied(false), 2000);
      api.recordArticleShare(token, articleId, "copy").catch(() => {});
    } catch {
      setNote(
        "Could not copy the link — you can select it from the address bar.",
      );
    }
  }


  return (
    <div className="rd-actions">
      <button
        type="button"
        className={`rd-act${state.liked ? " liked" : ""}`}
        onClick={() =>
          run("like", () => api.toggleArticleLike(token, articleId))
        }
        disabled={busy === "like"}
        aria-pressed={state.liked}
      >
        <HeartIcon filled={state.liked} />
        <span>{state.likes}</span>
        <span className="rd-act-label">
          {state.likes === 1 ? "Like" : "Likes"}
        </span>
      </button>

      <button
        type="button"
        className={`rd-act${state.bookmarked ? " saved" : ""}`}
        onClick={() =>
          run("save", () => api.toggleArticleBookmark(token, articleId))
        }
        disabled={busy === "save"}
        aria-pressed={state.bookmarked}
      >
        <BookmarkIcon filled={state.bookmarked} />
        <span className="rd-act-label">
          {state.bookmarked ? "Saved" : "Save"}
        </span>
      </button>

      <div className="rd-share-wrap" ref={shareRef}>
        <button
          type="button"
          className={`rd-act${shareOpen ? " open" : ""}`}
          onClick={() => setShareOpen((v) => !v)}
          aria-expanded={shareOpen}
        >
          <ShareIcon />
          <span className="rd-act-label">Share</span>
        </button>

        {shareOpen && (
          <div className="rd-share">
            <p className="rd-share-title">Share this article</p>

            <div className="rd-share-link">
              <input value={url} readOnly onFocus={(e) => e.target.select()} />
              <button type="button" onClick={copyLink}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="rd-share-row">
              {/* No "Device share" button. It handed the page off to the OS share
                  sheet, which then offered the same three destinations listed
                  right here plus a list of apps that have nothing to do with
                  this article — a row that led to another row. The named
                  targets below are the whole of what it was for. */}
              {TARGETS.map((t) => (
                <a
                  key={t.key}
                  className="rd-share-btn"
                  href={t.href(url, title)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    api
                      .recordArticleShare(token, articleId, t.key)
                      .catch(() => {})
                  }
                >
                  {t.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <span className="rd-act-count">
        <CommentIcon />
        {state.comments} {state.comments === 1 ? "comment" : "comments"}
      </span>

      {note && <p className="rd-act-note">{note}</p>}
    </div>
  );
}
