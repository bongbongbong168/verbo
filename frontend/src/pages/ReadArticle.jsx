import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import SentenceSavePopover from "../components/SentenceSavePopover";
import PremiumBadge from "../components/PremiumBadge";
import "./Read.css";
import ReaderSwitch from '../components/ReaderSwitch'
import { englishSentences, sentencesOf } from "../sentences";
import proOwl from '../assets/assistant/graduate-bot.png';

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
  /* Pinyin and translation are INDEPENDENT switches, not one EN/CN swap: the
     Chinese is the learning content and must stay on screen while either aid
     is showing. */
  const [showPinyin, setShowPinyin] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [generatedTranslation, setGeneratedTranslation] = useState({
    articleId: null,
    pairs: [],
    busy: false,
    error: null,
  });
  const [readerScale, setReaderScale] = useState(100);
  const [interactions, setInteractions] = useState(null);
  const hoveredWordRef = useRef(null);
  /* The Alt+1 listener is subscribed once (deps `[token]`) so it does not
     re-attach on every hover, which means the handler it holds closes over the
     FIRST render — where `article` is still null. The word itself came from the
     hovered token and saved fine, so this was invisible until the save started
     carrying the article's id and every card silently lost its source. Same
     ref trick as `hoveredWordRef`, for the same reason. */
  const articleRef = useRef(null);
  const sentenceScopeRef = useRef(null);

  // Switching Pinyin or Translation can replace the current token DOM before
  // the browser emits mouseleave. Clear the fixed popover first so it cannot
  // stay stranded over the newly-rendered sentence.
  function clearHoveredWord() {
    hoveredWordRef.current = null;
    setHovered(null);
  }

  // Translation has a second render when the API result arrives. Without this
  // cleanup, a word hovered before the switch can reappear as a fixed card
  // after that later render even though the pointer is now on the controls.
  useEffect(() => {
    clearHoveredWord();
  }, [showTranslation, generatedTranslation.busy]);

  /* The drawer holds the fields now — it is seeded from `article` when it
     opens, so there is no second copy of the article on this page to keep in
     step with the one being displayed behind it. */
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // A cached response belongs to one entitlement level. Clear the previous
    // viewer's article before loading, so changing accounts can never flash a
    // Pro body to a free reader while their own response is in flight.
    articleRef.current = null;
    setArticle(null);
    loadArticle();
    setShowTranslation(false);
    setGeneratedTranslation({ articleId: null, pairs: [], busy: false, error: null });
  }, [token, id, user?.id, user?.is_admin, user?.is_pro]);

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
    const access = user?.is_admin ? 'admin' : user?.is_pro ? 'pro' : 'free';
    const cacheKey = `article:${id}:viewer:${user?.id || 'anonymous'}:${access}`;
    const cached = readCache(cacheKey);
    if (cached) {
      setArticle(cached);
      articleRef.current = cached;
      setLoading(false);
      // Fresh enough that refetching buys nothing — but the VIEW is still
      // recorded, because opening it again is a real read.
      if (isFresh(cacheKey)) {
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
        writeCache(cacheKey, data);
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
    // A click on a reader control has to dismiss the card immediately. The
    // token itself is the one exception, so hovering and Alt+1 remain intact.
    function dropOnOutsideClick(event) {
      if (event.target instanceof Element && event.target.closest('.rd-word')) return;
      drop();
    }

    window.addEventListener('pointerdown', dropOnOutsideClick, true);
    return () => {
      window.removeEventListener("scroll", drop, true);
      window.removeEventListener('pointerdown', dropOnOutsideClick, true);
    };
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

  /* Computed every render rather than memoised: the token list is a few
     hundred entries and this runs once per paint, which is nothing beside
     the render it feeds. */
  const cnSentences = sentencesOf(article.tokens || []);
  const enSentences = englishSentences(article.body_en);
  const authoredTranslationFits =
    cnSentences.length > 0 && cnSentences.length === enSentences.length;
  const generatedEnglish =
    generatedTranslation.articleId === article.id
      ? generatedTranslation.pairs.map((pair) => pair.translation)
      : [];
  const visibleEnglish = authoredTranslationFits ? enSentences : generatedEnglish;
  const paired =
    showTranslation &&
    cnSentences.length > 0 &&
    cnSentences.length === visibleEnglish.length;
  const premiumLocked = article.premium_locked === true;
  const translationUsage = article.translation_usage;
  const translationNeedsAllowance = !authoredTranslationFits
    && generatedEnglish.length !== cnSentences.length
    && !article.translation_cached;
  const translationLimitReached = translationNeedsAllowance && translationUsage?.available === false;

  async function toggleTranslation() {
    clearHoveredWord();

    if (showTranslation) {
      setShowTranslation(false);
      return;
    }

    setShowTranslation(true);
    if (authoredTranslationFits || generatedEnglish.length === cnSentences.length) return;

    setGeneratedTranslation({ articleId: article.id, pairs: [], busy: true, error: null });
    try {
      const result = await api.translateArticle(token, article.id);
      if (result.usage) {
        const nextArticle = { ...article, translation_usage: result.usage, translation_cached: true };
        setArticle(nextArticle);
        articleRef.current = nextArticle;
      }
      setGeneratedTranslation({
        articleId: article.id,
        pairs: result.pairs || [],
        busy: false,
        error: null,
      });
    } catch (err) {
      if (err.data?.usage) {
        const nextArticle = { ...article, translation_usage: err.data.usage };
        setArticle(nextArticle);
        articleRef.current = nextArticle;
      }
      setGeneratedTranslation({
        articleId: article.id,
        pairs: [],
        busy: false,
        error: err.message || "Translation is unavailable. Please try again.",
      });
    }
  }

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
        <nav className="rd-breadcrumb" aria-label="Breadcrumb">
          <Link to="/read">Read</Link>
          <span className="rd-breadcrumb-sep" aria-hidden="true">/</span>
          <span className="rd-breadcrumb-current" aria-current="page" title={article.title}>
            {article.title}
          </span>
        </nav>
        <div className="rd-topbar-icons">
          <PageTools />
        </div>
      </div>

      <hr className="rd-divider" />

      {user?.is_admin && (
        <div className="rd-heading-row rd-heading-row-end">
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
        </div>
      )}

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
              {article.is_premium && (
                <PremiumBadge inline />
              )}
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
                onChange={() => {
                  clearHoveredWord();
                  setShowPinyin((v) => !v);
                }}
              />

              <label className="rd-size" htmlFor="rd-text-size">
                <span>A</span>
                <input id="rd-text-size" type="range" min="80" max="120" step="1"
                  value={readerScale} onChange={(event) => {
                    const next = Number(event.target.value);
                    // The normal size is the centre and has a small magnetic
                    // zone, so it is easy to return to while dragging.
                    setReaderScale(Math.abs(next - 100) <= 3 ? 100 : next);
                  }}
                  aria-label="Reading text size" />
                <span className="rd-size-large">A</span>
              </label>

              <ReaderSwitch
                label={generatedTranslation.busy
                  ? "Translating..."
                  : `Translation · ${translationUsage?.remaining == null ? "Unlimited" : `${translationUsage.remaining} left`}`}
                on={showTranslation}
                onChange={toggleTranslation}
                disabled={premiumLocked || translationLimitReached}
                title={premiumLocked
                  ? "Full translation is included with Verbo Pro"
                  : showTranslation ? "Hide the English translation" : "Show the English translation"}
              />

              {generatedTranslation.error && showTranslation && (
                <span className="rd-controls-note" role="alert">
                  {generatedTranslation.error}
                </span>
              )}
              {translationLimitReached && (
                <span className="rd-controls-note rd-translation-limit">
                  Full-text translations reset {new Date(`${translationUsage.reset_date}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}. Pinyin and vocabulary tools remain available. {!translationUsage.is_pro && <Link to="/upgrade">Get Verbo Pro</Link>}
                </span>
              )}
            </div>

            {lastSaved && (
              <p className="rd-saved-note">
                Saved &ldquo;{lastSaved}&rdquo; to flashcards.
              </p>
            )}

            <div
              ref={sentenceScopeRef}
              className={'rd-reader' + (premiumLocked ? ' rd-reader-preview' : '')}
              style={{ "--rd-reader-scale": readerScale / 100 }}
            >
              <p className="rd-hint">
                Hover a word and press Alt+1 to save it. Select Chinese text to save a sentence.
              </p>
              <div className="rd-reader-copy">
              {paired ? (
              /* Translation sits directly below its Chinese sentence only
                 when the two sides genuinely line up. If they do not, the
                 English remains one passage below rather than being paired
                 incorrectly. */
              cnSentences.map((sentence, i) => (
                <div className="rd-pair" key={`pair-${i}`}>
                  <p
                    className={
                      "rd-body rd-body-cn" + (showPinyin ? " rd-body-ruby" : "")
                    }
                  >
                    {renderTokens(sentence, `s${i}-`)}
                  </p>
                  <p className="rd-pair-en">{visibleEnglish[i]}</p>
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
              </div>

              {premiumLocked && (
                <>
                  <div className="rd-pro-tease" aria-hidden="true">
                    <span /><span /><span /><span /><span />
                  </div>
                  <section className="rd-paywall" aria-labelledby="rd-paywall-title">
                    <img className="rd-paywall-owl" src={proOwl} alt="" aria-hidden="true" />
                    <div className="rd-paywall-copy">
                      <span className="rd-paywall-eyebrow">Verbo Pro</span>
                      <h3 id="rd-paywall-title">Keep reading without breaking your flow</h3>
                      <p>Unlock the full article, its translation, and every Pro read.</p>
                    </div>
                    <Link className="rd-paywall-cta" to="/upgrade">
                      Unlock with Verbo Pro
                      <span aria-hidden="true">→</span>
                    </Link>
                  </section>
                </>
              )}
            </div>
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
      <SentenceSavePopover
        scopeRef={sentenceScopeRef}
        token={token}
        sourceModule="read"
        sourceType="article"
        sourceId={article.id}
        tokens={article.tokens}
        onSaved={setLastSaved}
      />
    </div>
  );
}
