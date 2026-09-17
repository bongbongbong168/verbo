import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { exampleFor } from "../sentence";
import { invalidate, isFresh, readCache, writeCache } from "../dataCache";
import { noteRecentView } from '../recentViews';
import Skeleton, { SkeletonText } from "../components/Skeleton";
import WordPopover from "../components/WordPopover";
import PageTools from "../components/PageTools";
import ArticleActions from "../components/ArticleActions";
import ArticleComments from "../components/ArticleComments";
import RecommendedArticles from "../components/RecommendedArticles";
import ArticleEditDrawer from "../components/ArticleEditDrawer";
import "./Read.css";
import ReaderSwitch from '../components/ReaderSwitch'

/**
 * Break the annotated token stream into paragraphs.
 *
 * `annotate()` hands back one flat list for the whole body, with the
 * original whitespace preserved in its `text` tokens — so a paragraph break
 * is a blank line sitting INSIDE one of them. Splitting therefore has to cut
 * those tokens in half rather than just grouping between them, or the
 * punctuation that ends a paragraph would be orphaned onto the next.
 *
 * Word tokens are never split: they carry the pinyin and the translation the
 * hover popover reads, and are what Alt+1 saves.
 */
function paragraphsOf(tokens) {
  /* WHICH NEWLINE COUNTS AS A BREAK IS PER ARTICLE, not a fixed rule. Some
     bodies separate paragraphs with a blank line and some with a single one —
     `white-space: pre-wrap` renders both as separated, so the two look
     identical on screen and differ only in the source. Splitting on blank
     lines alone therefore read a four-paragraph article as ONE paragraph and
     quietly refused to pair it. Each text is asked what it actually uses. */
  const whole = tokens.map((t) => String(t.text)).join("");
  const splitter = /\n[ \t]*\n+/.test(whole) ? /\n[ \t]*\n+/ : /\n+/;

  const paras = [];
  let current = [];

  for (const tok of tokens) {
    if (tok.type === "word") {
      current.push(tok);
      continue;
    }

    /* A break lives INSIDE a text token, so the token has to be cut rather
       than merely grouped between — otherwise the punctuation ending a
       paragraph is orphaned onto the next one. Word tokens are never split:
       they carry the pinyin and translation the popover reads. */
    const pieces = String(tok.text).split(splitter);
    pieces.forEach((piece, i) => {
      if (i > 0) {
        paras.push(current);
        current = [];
      }
      if (piece !== "") current.push({ type: "text", text: piece });
    });
  }

  paras.push(current);
  return paras.filter((p) => p.some((t) => String(t.text).trim() !== ""));
}

/** The English side, asked the same question about its own newlines. */
function englishParagraphs(text) {
  const whole = String(text || "");
  const splitter = /\n[ \t]*\n+/.test(whole) ? /\n[ \t]*\n+/ : /\n+/;
  return whole.split(splitter).map((p) => p.trim()).filter(Boolean);
}
function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ReadArticle() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [article, setArticle] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [saved, setSaved] = useState({});
  const [hovered, setHovered] = useState(null);
  const [lang, setLang] = useState("cn");
  /* Pinyin and translation are INDEPENDENT switches, not one EN/CN swap: the
     Chinese is the learning content and must stay on screen while either aid
     is showing. */
  const [showPinyin, setShowPinyin] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [interactions, setInteractions] = useState(null);
  const hoveredWordRef = useRef(null);
  /* The Alt+1 listener is subscribed once (deps `[token]`) so it does not
     re-attach on every hover, which means the handler it holds closes over the
     FIRST render — where `article` is still null. The word itself came from the
     hovered token and saved fine, so this was invisible until the save started
     carrying the article's id and every card silently lost its source. Same
     ref trick as `hoveredWordRef`, for the same reason. */
  const articleRef = useRef(null);

  /* The drawer holds the fields now — it is seeded from `article` when it
     opens, so there is no second copy of the article on this page to keep in
     step with the one being displayed behind it. */
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    loadArticle();
  }, [token, id]);

  /* Opening an article is recorded TWICE, into two tables that answer two
     different questions, and both calls belong here:
       - article_views  feeds the recommender ("has this person read things
                        like this?") — one row per user per article, counted.
       - recent_views   feeds the Dashboard's "Pick up where you left off"
                        ("what did I touch most recently?") — one recency order
                        shared with study units and podcasts.
     Neither can answer the other's question, which is why the second is not a
     duplicate of the first. Both are fire-and-forget: failing to record a visit
     must never stop the article rendering, and there is nothing useful to tell
     the reader about it. */
  function recordVisit(a) {
    api.recordArticleView(token, id).catch(() => {});
    /* Moves this article to the front of the Dashboard's cached recency row
       when the article is in hand - see recentViews.js for why this replaced
       an invalidate. */
    noteRecentView(
      token,
      'article',
      id,
      a && {
        kind: 'article',
        article: {
          id: a.id,
          title: a.title,
          type: a.type,
          category: a.category,
          hsk_level: a.hsk_level,
          image_url: a.image_url,
          reading_minutes: a.reading_minutes,
        },
      },
    );
  }

  /* Seeded from the shared cache rather than converted to `useApiData`: this
     page keeps the article in BOTH state and a ref (the Alt+1 listener reads
     the ref to dodge a stale closure) and rewrites it from half a dozen places,
     so the surgical change is to prime the initial value and write through on
     load. Reopening an article you have already read then paints immediately
     instead of waiting on a request that may stall for seconds. */
  function loadArticle() {
    const cached = readCache(`article:${id}`);
    if (cached) {
      setArticle(cached);
      articleRef.current = cached;
      setLoading(false);
      // Fresh enough that refetching buys nothing — but the VIEW is still
      // recorded, because opening it again is a real read.
      if (isFresh(`article:${id}`)) {
        recordVisit(cached);
        return;
      }
    } else {
      setLoading(true);
    }

    api
      .getArticle(token, id)
      .then((data) => {
        setArticle(data);
        articleRef.current = data;
        writeCache(`article:${id}`, data);
        recordVisit(data);
      })
      // Only surface a failure that leaves the reader with nothing — a stalled
      // refresh behind an article already on screen is not worth an error.
      .catch((err) => !articleRef.current && setError(err.message))
      .finally(() => setLoading(false));
  }

  async function handleSaveWord(word) {
    // Read off the ref, not the state — see the note on `articleRef`.
    const current = articleRef.current;
    try {
      await api.addFlashcard(token, {
        word: word.text,
        pinyin: word.pinyin,
        translation: word.translation,
        source_module: "read",
        // Which article, and the line it was in. Captured HERE rather than
        // derived later in the bank: the body can be edited or the article
        // deleted, and a sentence recovered afterwards might not be the one
        // this learner actually read.
        source_type: "article",
        source_id: current?.id,
        example: exampleFor(current?.tokens, word),
      });
      setLastSaved(word.text);
      setSaved((prev) => ({ ...prev, [word.text]: true }));
    } catch (err) {
      setError(err.message);
    }
  }

  // The popover is positioned `fixed` against a rect captured on hover, so a
  // scroll would leave it stranded next to the wrong word. Drop it instead.
  useEffect(() => {
    if (!hovered) return;

    function drop() {
      hoveredWordRef.current = null;
      setHovered(null);
    }

    window.addEventListener("scroll", drop, true);
    return () => window.removeEventListener("scroll", drop, true);
  }, [hovered]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.altKey && e.key === "1") {
        const word = hoveredWordRef.current;
        if (word) {
          e.preventDefault();
          handleSaveWord(word);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [token]);

  /* Throws on failure rather than swallowing: the drawer stays open and shows
     the message against the fields that caused it. Reloading afterwards is
     what re-runs the annotation, so the hover tokens match the new body. */
  async function handleUpdate(values) {
    await api.updateArticle(token, id, values);
    /* Drop every cached copy BEFORE reloading, or the freshness window would
       hand back the pre-edit article. The list and recommendations carry the
       title and excerpt, so they are stale now too. */
    invalidate(`article:${id}`, "articles", "articles:recommended:");
    loadArticle();
  }

  async function handleDelete() {
    try {
      await api.deleteArticle(token, id);
      // The article is gone; nothing may keep serving it from cache.
      invalidate(`article:${id}`, "articles", "articles:recommended:");
      navigate("/read");
    } catch (err) {
      setError(err.message);
    }
  }

  /* A skeleton shaped like the article, so the reader's eye lands where the
     text will actually be. */
  if (loading)
    return (
      <div className="rd-panel">
        <Skeleton style={{ height: 15, width: 180, marginBottom: "1.4rem" }} />
        <Skeleton style={{ height: 34, width: "70%", marginBottom: "0.8rem" }} />
        <Skeleton style={{ height: 15, width: 240, marginBottom: "1.6rem" }} />
        <Skeleton style={{ height: 220, borderRadius: 14, marginBottom: "1.6rem" }} />
        <SkeletonText lines={9} />
      </div>
    );
  if (error && !article) return <p className="rd-error">{error}</p>;
  if (!article) return null;

  const hasEnglish = Boolean(article.body_en && article.body_en.trim());

  /* Computed every render rather than memoised: the token list is a few
     hundred entries and this runs once per paint, which is nothing beside
     the render it feeds. */
  const cnParas = paragraphsOf(article.tokens || []);
  const enParas = englishParagraphs(article.body_en);
  /* The one condition that allows pairing. Two or more paragraphs on each
     side and the same number of them — a single block against a single
     block is just the passage, and any mismatch means the alignment would
     be invented. */
  const paired =
    showTranslation &&
    hasEnglish &&
    cnParas.length > 1 &&
    cnParas.length === enParas.length;

  /* One renderer for both layouts — the interleaved one and the plain
     passage — so the hover, the saved highlight and the pinyin ruby cannot
     drift between them. */
  function renderTokens(tokens, keyPrefix = "") {
    return tokens.map((tok, idx) =>
                tok.type === "word" ? (
                  <span
                    key={`${keyPrefix}${idx}`}
                    className={
                      "rd-word" +
                      // Keyed by the WORD, not the token, so every occurrence
                      // of a saved word in the passage is marked — not just
                      // the one you happened to press Alt+1 on.
                      (saved[tok.text] ? " saved" : "") +
                      (hovered?.tok === tok ? " active" : "")
                    }
                    onMouseEnter={(e) => {
                      hoveredWordRef.current = tok;
                      setHovered({
                        tok,
                        rect: e.currentTarget.getBoundingClientRect(),
                      });
                    }}
                    onMouseLeave={() => {
                      if (hoveredWordRef.current === tok)
                        hoveredWordRef.current = null;
                      setHovered((cur) => (cur?.tok === tok ? null : cur));
                    }}
                  >
                    {/* Pinyin sits ABOVE the character, the way a textbook
                          prints it. The hover handlers stay on this outer
                          span, so Alt+1 keeps working either way. */}
                    {showPinyin && tok.pinyin && (
                      <span className="rd-word-py">{tok.pinyin}</span>
                    )}
                    <span className="rd-word-hz">{tok.text}</span>
                  </span>
                ) : (
                  <span key={`${keyPrefix}${idx}`}>{tok.text}</span>
                ),
              );
  }

  return (
    <div className="rd">
      <div className="rd-topbar">
        <div className="rd-topbar-icons">
          <PageTools />
        </div>
      </div>

      <hr className="rd-divider" />

      <div className="rd-heading-row">
        <h1 className="rd-heading">Read Station</h1>
        {user?.is_admin && (
          <div className="rd-admin-actions">
            <button
              type="button"
              className="rd-new-btn"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Cancel edit" : "Edit"}
            </button>
            <button
              type="button"
              className="rd-danger-btn"
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {error && <p className="rd-error">{error}</p>}

      <div className="rd-panel">
        <div className="rd-featured rd-featured-static">
          <div className="rd-featured-body">
            <h2 className="rd-featured-title">{article.title}</h2>
            {article.body_en && (
              <p className="rd-featured-excerpt">
                {article.body_en.slice(0, 140)}
              </p>
            )}
            {/* Learning metadata. Each chip renders only when the article
                actually carries that field — the five articles written before
                this existed show none rather than a row of blanks. */}
            <div className="rd-meta">
              {article.hsk_level && (
                <span className="rd-chip rd-chip-level">
                  {article.hsk_level}
                </span>
              )}
              {article.category && (
                <span className="rd-chip">{article.category}</span>
              )}
              {article.difficulty && (
                <span className="rd-chip">{article.difficulty}</span>
              )}
              {/* Deduped by VALUE: an article tagged "Travel" as both a goal
                  and an interest is one idea to the reader, and two identical
                  chips just look like a mistake. Also drops anything already
                  said by the category chip above. */}
              {[
                ...new Set(
                  (article.tags || [])
                    .map((t) => t.value)
                    .filter(
                      (v) => v !== article.category && v !== article.difficulty,
                    ),
                ),
              ].map((value) => (
                <span key={value} className="rd-chip">
                  {value}
                </span>
              ))}
              <span className="rd-chip rd-chip-time">
                {article.reading_minutes} min read
              </span>
            </div>
          </div>
          <div className="rd-thumb rd-thumb-lg">
            {article.image_url && <img src={article.image_url} alt="" />}
            <span className="rd-thumb-date">
              {formatDate(article.created_at)}
            </span>
          </div>
        </div>

        {(
          <>
            {/* Two switches, each independent. The Chinese never leaves the
                page — turning an aid on adds to it rather than replacing it. */}
            <div className="rd-controls">
              <ReaderSwitch
                label="Pinyin"
                on={showPinyin}
                onChange={() => setShowPinyin((v) => !v)}
              />

              <ReaderSwitch
                label="Translation"
                on={showTranslation}
                onChange={() => setShowTranslation((v) => !v)}
                disabled={!hasEnglish}
                title={
                  hasEnglish
                    ? "Show the English translation"
                    : "No English translation for this article yet"
                }
              />

              {!hasEnglish && (
                <span className="rd-controls-note">
                  No English translation for this article yet.
                </span>
              )}
            </div>

            {lastSaved && (
              <p className="rd-saved-note">
                Saved &ldquo;{lastSaved}&rdquo; to flashcards.
              </p>
            )}

            <p className="rd-hint">
              Hover a word and press Alt+1 to save it to your flashcard bank.
            </p>
            {paired ? (
              /* THE TRANSLATION SITS UNDER ITS OWN PARAGRAPH, but only when
                 the two sides genuinely line up. `body_en` is one free-text
                 block, not per-sentence data, so this counts the paragraphs
                 on each side and interleaves ONLY if the counts match. When
                 they do not — and for most of the library they do not, since
                 the English is often a single summary — it falls back to the
                 passage below rather than pairing line 3 with line 1 and
                 calling it a translation. Nothing is aligned that was not
                 written aligned. */
              cnParas.map((para, i) => (
                <div className="rd-pair" key={`pair-${i}`}>
                  <p
                    className={
                      "rd-body rd-body-cn" + (showPinyin ? " rd-body-ruby" : "")
                    }
                  >
                    {renderTokens(para, `p${i}-`)}
                  </p>
                  <p className="rd-pair-en">{enParas[i]}</p>
                </div>
              ))
            ) : (
              <p
                className={
                  "rd-body rd-body-cn" + (showPinyin ? " rd-body-ruby" : "")
                }
              >
                {renderTokens(article.tokens)}
              </p>
            )}

            {/* body_en is one free-text block, not per-sentence data, so the
                  translation sits UNDER the Chinese as its own passage rather
                  than pretending to be aligned line by line. */}
            {showTranslation && hasEnglish && !paired && (
              <div className="rd-translation">
                <span className="rd-translation-label">English</span>
                <p className="rd-translation-body">{article.body_en}</p>
              </div>
            )}
          </>
        )}
      </div>

      {!editing && (
        <>
          <ArticleActions
            articleId={article.id}
            title={article.title}
            initial={interactions || article.interactions}
            onChange={setInteractions}
          />

          <ArticleComments
            articleId={article.id}
            /* Returning `cur` unchanged when the count already matches is what
               lets React bail out of the re-render. Building a fresh object
               every time it reported meant the parent always re-rendered, which
               handed the child a new callback — the other half of the refetch
               loop fixed in ArticleComments. Either fix alone stops it; both
               together mean neither side can reopen it. */
            onCountChange={(n) =>
              setInteractions((cur) => {
                const base = cur || article.interactions;
                if (base && base.comments === n) return cur;
                return { ...base, comments: n };
              })
            }
          />

          <RecommendedArticles exclude={article.id} limit={3} />
        </>
      )}

      {/* Editing happens OVER the article rather than in place of it: the
          admin can see what they are changing while they change it, which the
          old inline form — which replaced the whole reading view — could not
          do. `key` seeds the drawer from the article each time it opens, so a
          cancelled edit leaves no stale draft behind. */}
      {editing && user?.is_admin && (
        <ArticleEditDrawer
          key={article.updated_at || article.id}
          article={article}
          onSave={handleUpdate}
          onClose={() => setEditing(false)}
        />
      )}

      <WordPopover
        word={hovered?.tok}
        rect={hovered?.rect}
        saved={!!saved[hovered?.tok?.text]}
      />
    </div>
  );
}
