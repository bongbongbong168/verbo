import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { exampleFor } from "../sentence";
import SectionToggle from "../components/SectionToggle";
import WordPopover from "../components/WordPopover";
import PageTools from "../components/PageTools";
import ArticleActions from "../components/ArticleActions";
import ArticleComments from "../components/ArticleComments";
import RecommendedArticles from "../components/RecommendedArticles";
import "./Read.css";

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

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("article");
  const [body, setBody] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadArticle();
  }, [token, id]);

  function loadArticle() {
    setLoading(true);
    api
      .getArticle(token, id)
      .then((data) => {
        setArticle(data);
        articleRef.current = data;
        setTitle(data.title);
        setType(data.type);
        setBody(data.body);
        setBodyEn(data.body_en || "");
        /* Reading history feeds the recommender. Fire-and-forget: failing to
           record a view must never stop the article rendering. */
        api.recordArticleView(token, id).catch(() => {});
      })
      .catch((err) => setError(err.message))
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

  async function handleUpdate(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.updateArticle(token, id, {
        title,
        type,
        body,
        body_en: bodyEn,
        image,
      });
      setEditing(false);
      setImage(null);
      loadArticle();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    try {
      await api.deleteArticle(token, id);
      navigate("/read");
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="rd-empty">Loading...</p>;
  if (error && !article) return <p className="rd-error">{error}</p>;
  if (!article) return null;

  const hasEnglish = Boolean(article.body_en && article.body_en.trim());

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

        {editing ? (
          <form className="rd-form" onSubmit={handleUpdate}>
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
              <label>Replace image</label>
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
              {submitting ? "Saving..." : "Save changes"}
            </button>
          </form>
        ) : (
          <>
            {/* Two switches, each independent. The Chinese never leaves the
                page — turning an aid on adds to it rather than replacing it. */}
            <div className="rd-controls">
              <button
                type="button"
                className={"rd-switch" + (showPinyin ? " on" : "")}
                onClick={() => setShowPinyin((v) => !v)}
                aria-pressed={showPinyin}
              >
                <span className="rd-switch-track">
                  <span className="rd-switch-knob" />
                </span>
                Pinyin
              </button>

              <button
                type="button"
                className={"rd-switch" + (showTranslation ? " on" : "")}
                onClick={() => setShowTranslation((v) => !v)}
                disabled={!hasEnglish}
                aria-pressed={showTranslation}
                title={
                  hasEnglish
                    ? "Show the English translation"
                    : "No English translation for this article yet"
                }
              >
                <span className="rd-switch-track">
                  <span className="rd-switch-knob" />
                </span>
                Translation
              </button>

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
            <p
              className={
                "rd-body rd-body-cn" + (showPinyin ? " rd-body-ruby" : "")
              }
            >
              {article.tokens.map((tok, idx) =>
                tok.type === "word" ? (
                  <span
                    key={idx}
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
                  <span key={idx}>{tok.text}</span>
                ),
              )}
            </p>

            {/* body_en is one free-text block, not per-sentence data, so the
                  translation sits UNDER the Chinese as its own passage rather
                  than pretending to be aligned line by line. */}
            {showTranslation && hasEnglish && (
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
            onCountChange={(n) =>
              setInteractions((cur) => ({
                ...(cur || article.interactions),
                comments: n,
              }))
            }
          />

          <RecommendedArticles exclude={article.id} limit={3} />
        </>
      )}

      <WordPopover
        word={hovered?.tok}
        rect={hovered?.rect}
        saved={!!saved[hovered?.tok?.text]}
      />
    </div>
  );
}
