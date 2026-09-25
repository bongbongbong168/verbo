import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { exampleFor } from "../sentence";
import { invalidate, isFresh, readCache, writeCache } from "../dataCache";
import Skeleton, { SkeletonText } from "../components/Skeleton";
import WordPopover from "../components/WordPopover";
import swooshLarge from "../assets/scan/swoosh-large.png";
import swooshSmall from "../assets/scan/swoosh-small.png";
import fileIcon from "../assets/scan/file-icon.png";
import PageTools from "../components/PageTools";
import ReaderSwitch from "../components/ReaderSwitch";
import SentenceSavePopover from "../components/SentenceSavePopover";
import { AllowanceIndicator, UsageLimitState } from "../components/UsageAllowance";
import { useUsageAllowance } from "../useUsageAllowance";
import {
  TRANSLATION_FEATURE,
  translationNeedsProvider,
  writeTranslationContentCache,
} from "../usageAllowances";
import "./ScanDocument.css";

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4h12v16l-6-4-6 4V4z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

// Kept local, like formatDate below — this codebase duplicates small
// formatters per page rather than sharing a utils module.
function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function useScanTranslation(id, token, onSuccess, onUsage) {
  const key = `${id}:${token}`;
  const [state, setState] = useState({});
  const { pairs = [], busy = false, error = "", visible = false } = state.key === key ? state : {};
  async function toggle() {
    if (busy) return;
    if (pairs.length) { setState({ key, pairs, visible: !visible }); return; }
    setState({ key, busy: true });
    try {
      const result = await api.translateScan(token, id);
      onSuccess(result);
      setState((current) => current.key === key ? { key, pairs: result.pairs, visible: true } : current);
    } catch (err) {
      if (err.data?.usage) onUsage(err.data.usage);
      setState((current) => current.key === key ? { key, error: err.message || "Translation is unavailable. Please try again." } : current);
    }
  }
  return { pairs, busy, error, visible, toggle };
}

function tokenSentences(tokens) {
  const sentences = [];
  let sentence = [];
  tokens.forEach((token) => {
    sentence.push(token);
    if (token.type === "text" && (/[。！？!?][”’）】〕》\s]*$/u.test(token.text) || /\r?\n[\t ]*(?:\r?\n[\t ]*)+/u.test(token.text))) {
      sentences.push(sentence);
      sentence = [];
    }
  });
  if (sentence.length) sentences.push(sentence);
  return sentences.filter((parts) => parts.some((part) => part.text.trim()));
}

export default function ScanDocument() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const { usage: translationUsage, updateUsage: updateTranslationUsage } = useUsageAllowance(
    token,
    TRANSLATION_FEATURE,
  );

  const [scan, setScan] = useState(null);
  function syncScanTranslationUsage(usage, { translated = false } = {}) {
    if (!usage) return;
    updateTranslationUsage(usage);
    setScan((current) => {
      const next = writeTranslationContentCache(
        `scan:${id}`,
        current,
        usage,
        { translated },
      );
      scanRef.current = next;
      return next;
    });
  }
  const translation = useScanTranslation(
    id,
    token,
    (result) => syncScanTranslationUsage(result.usage, { translated: true }),
    (usage) => syncScanTranslationUsage(usage),
  );
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState({});
  const [savingAll, setSavingAll] = useState(false);
  /* The reading aid Read and Podcast both have. Adds pinyin above each word
     rather than replacing anything — the characters never leave the page. */
  const [showPinyin, setShowPinyin] = useState(false);
  const [readerScale, setReaderScale] = useState(100);
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  // Tracked in a ref, not state, so the single keydown listener always reads
  // the current word without re-subscribing on every hover. The state below is
  // only what the popover needs to paint.
  const hoveredWordRef = useRef(null);
  /* Same reason: the Alt+1 listener subscribes once (deps `[token]`) and its
     handler closes over the FIRST render, where `scan` is still null. Without
     this the saved word would lose the document it came from. */
  const scanRef = useRef(null);
  const sentenceScopeRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const translatedTokenSentences = useMemo(() => tokenSentences(scan?.tokens || []), [scan?.tokens]);

  function renderToken(tok, idx, prefix = "") {
    // OCR often inserts several blank lines between a title and its body.
    // Keep real line breaks, but never turn them into a large empty block.
    if (tok.type !== "word") return <span key={`${prefix}${idx}`}>{tok.text.replace(/\r?\n[\t ]*(?:\r?\n[\t ]*)+/g, "\n")}</span>;
    return <span key={`${prefix}${idx}`} className={"sd-token" + (saved[tok.text] ? " saved" : "") + (hovered?.tok === tok ? " active" : "")}
      onMouseEnter={(e) => { hoveredWordRef.current = tok; setHovered({ tok, rect: e.currentTarget.getBoundingClientRect() }); }}
      onMouseLeave={() => { hoveredWordRef.current = null; setHovered(null); }}>
      {showPinyin && tok.pinyin && <span className="sd-token-py">{tok.pinyin}</span>}
      <span className="sd-token-hz">{tok.text}</span>
    </span>;
  }

  /* Seeded from the shared cache: the scan lives in both state and a ref (the
     Alt+1 listener reads the ref to dodge a stale closure), and reopening a
     document you have already viewed should not wait on a request that may
     stall for seconds. A scan's text never changes after OCR, so a cached copy
     cannot go stale in the way a list can. */
  useEffect(() => {
    const key = `scan:${id}`;
    const cached = readCache(key);
    if (cached) {
      setScan(cached);
      scanRef.current = cached;
      setLoading(false);
      if (isFresh(key)) return;
    } else {
      setLoading(true);
    }

    api
      .getScan(token, id)
      .then((data) => {
        setScan(data);
        scanRef.current = data;
        writeCache(key, data);
      })
      .catch((err) => !scanRef.current && setError(err.message))
      .finally(() => setLoading(false));
  }, [token, id]);

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

  // Disarm on a timer rather than on blur: a destructive control must not stay
  // armed indefinitely, and blur never fires if focus never landed on it.
  useEffect(() => {
    if (!confirmingDelete) return;
    const t = setTimeout(() => setConfirmingDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingDelete]);

  // One saver for both entry points — the Save buttons in the aside and the
  // Alt+1 shortcut over the text — so `saved` is keyed by the word itself and
  // a hover-save also flips the matching row in the list to "Saved".
  async function saveWord(entry) {
    const { text, pinyin, translation } = entry;
    // Off the ref, not the state — see the note on `scanRef`.
    const current = scanRef.current;
    try {
      await api.addFlashcard(token, {
        word: text,
        pinyin,
        translation,
        source_module: "scan",
        // Which document, and the line it was in. `exampleFor` falls back to
        // matching by text, so the aside's Save buttons — which hand over a
        // row from the word LIST rather than a token from the text — keep
        // their context too.
        source_type: "scan",
        source_id: current?.id,
        example: exampleFor(current?.tokens, entry),
      });
      setSaved((prev) => ({ ...prev, [text]: true }));
      setLastSaved(text);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.altKey && e.key === "1") {
        const word = hoveredWordRef.current;
        if (word) {
          e.preventDefault();
          saveWord(word);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [token]);

  // Saved sequentially rather than with Promise.all: the flashcard endpoint
  // shares the 300/min bucket, and a long word list fired at once is exactly
  // the burst that used to trip it.
  async function handleSaveAll() {
    if (!scan) return;
    setSavingAll(true);
    setError(null);
    try {
      for (const word of scan.words) {
        if (saved[word.word]) continue;
        await saveWord({
          text: word.word,
          pinyin: word.pinyin,
          translation: word.translation,
        });
      }
    } finally {
      setSavingAll(false);
    }
  }

  // Two-step rather than a single click: a scan cannot be recovered once gone,
  // and the OCR pass that produced it is not cheap to repeat.
  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await api.deleteScan(token, id);
      // Neither this document nor the history list may keep serving it.
      invalidate(`scan:${id}`, "scans");
      navigate("/scan");
    } catch (err) {
      setError(err.message);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(scan?.raw_text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }

  if (loading)
    return (
      <div className="sd">
        <Skeleton style={{ height: 15, width: 190, marginBottom: "1.3rem" }} />
        <Skeleton style={{ height: 120, borderRadius: 14, marginBottom: "1.4rem" }} />
        <SkeletonText lines={8} />
      </div>
    );
  if (error && !scan) return <p className="sd-error">{error}</p>;
  if (!scan) return null;

  const name = scan.original_filename || `Scan #${scan.id}`;
  const text = scan.raw_text || "";
  const tokens = scan.tokens || [];
  const charCount = text.replace(/\s/g, "").length;
  const unsavedCount = scan.words.filter((w) => !saved[w.word]).length;
  const translationNeedsAllowance = translationNeedsProvider({
    loaded: translation.pairs.length > 0,
    cached: scan.translation_cached,
  });
  const translationRequestBlocked = translationNeedsAllowance && translationUsage?.available === false;

  return (
    <div className="sd">
      <div className="sd-topbar">
        <nav className="sd-breadcrumb">
          <Link to="/scan">Scan</Link>
          <span className="sd-breadcrumb-sep">/</span>
          <span className="sd-breadcrumb-current">{name}</span>
        </nav>

        <div className="sd-topbar-icons">
          <PageTools />
        </div>
      </div>

      {error && <p className="sd-error">{error}</p>}
      {lastSaved && (
        <p className="sd-saved-note">
          Saved &ldquo;{lastSaved}&rdquo; to flashcards.
        </p>
      )}

      {/* Dark hero, same shell as the upload card on the Scan index */}
      <header className="sd-hero">
        <div className="sd-hero-bg">
          <img className="sd-swoosh-large" src={swooshLarge} alt="" />
          <img className="sd-swoosh-small" src={swooshSmall} alt="" />
        </div>

        <div className="sd-hero-content">
          <span className="sd-hero-file">
            <img src={fileIcon} alt="" />
          </span>

          <div className="sd-hero-text">
            <h1 className="sd-hero-title">{name}</h1>
            <p className="sd-hero-meta">
              <span>Scanned {formatDate(scan.created_at)}</span>
              <span className="sd-dot" />
              <span>{scan.words.length} words</span>
              <span className="sd-dot" />
              <span>{charCount} characters</span>
              {scan.size_bytes && (
                <>
                  <span className="sd-dot" />
                  <span>{formatBytes(scan.size_bytes)}</span>
                </>
              )}
            </p>
          </div>

          <div className="sd-hero-actions">
            <button
              type="button"
              className="sd-btn"
              onClick={handleCopy}
              disabled={!text}
            >
              <CopyIcon />
              {copied ? "Copied" : "Copy text"}
            </button>
            <button
              type="button"
              className="sd-btn sd-btn-ghost"
              onClick={handleSaveAll}
              disabled={savingAll || unsavedCount === 0}
            >
              <BookmarkIcon />
              {savingAll
                ? "Saving..."
                : unsavedCount === 0
                  ? "All saved"
                  : `Save all ${unsavedCount}`}
            </button>
            <button
              type="button"
              className={
                "sd-btn sd-btn-danger" + (confirmingDelete ? " confirming" : "")
              }
              onClick={handleDelete}
              disabled={deleting}
            >
              <TrashIcon />
              {deleting
                ? "Deleting..."
                : confirmingDelete
                  ? "Confirm delete"
                  : "Delete"}
            </button>
          </div>
        </div>
      </header>

      {/* Text on the left, word list aside — the same split the Study unit's
          reading view uses, since the content is the same shape. */}
      <div className="sd-body">
        <section ref={sentenceScopeRef} className="sd-panel">
          {text && <div className="sd-reader-controls">
            <div className="sd-reading-controls">
              {tokens.length > 0 && (
                <ReaderSwitch label="Pinyin" on={showPinyin} onChange={() => setShowPinyin((v) => !v)} />
              )}
              <ReaderSwitch label={translation.busy ? "Translating..." : "Translation"}
                on={translation.visible}
                onChange={translation.toggle}
                disabled={translation.busy || translationRequestBlocked} />
              {translationUsage && (
                <AllowanceIndicator usage={translationUsage}>
                  {translationUsage.remaining == null
                    ? "Unlimited translations"
                    : `${translationUsage.remaining} translations left`}
                </AllowanceIndicator>
              )}
            </div>
            {text && (
              <label className="sd-size" htmlFor="sd-text-size">
                <span>A</span>
                <input id="sd-text-size" type="range" min="80" max="120" step="1" value={readerScale}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setReaderScale(Math.abs(next - 100) <= 3 ? 100 : next);
                  }} aria-label="Reading text size" />
                <span className="sd-size-large">A</span>
              </label>
            )}
          </div>}
          <UsageLimitState
            usage={translationUsage}
            compact
            className="sd-translation-limit-state"
            title={translationUsage?.is_pro ? "You’ve used this month’s Pro translations." : "You’ve used this month’s free translations."}
            description="Pinyin, word meanings, and saving vocabulary still work. Your translations reset next month."
            actionLabel="Get more translations with Verbo Pro"
          />
          {text && !translation.visible ? (
            <p className={"sd-text" + (showPinyin ? " sd-text-ruby" : "")} style={{ "--sd-reader-scale": readerScale / 100 }}>
              {tokens.map((tok, idx) => renderToken(tok, idx))}
            </p>
          ) : text ? null : (
            <p className="sd-empty-inline">
              No text was detected in this image.
            </p>
          )}
          <div id="sd-english-translation" aria-live="polite" aria-busy={translation.busy}>
            {translation.error && <p role="alert">{translation.error}</p>}
            {translation.visible && <div className={"sd-translation" + (showPinyin ? " sd-text-ruby" : "")} style={{ "--sd-reader-scale": readerScale / 100 }}>
              {translation.pairs.map((pair, sentenceIndex) => (
                <article className="sd-translation-pair" key={`${sentenceIndex}:${pair.source}`}>
                  <p className="sd-translation-source">
                    {(translatedTokenSentences[sentenceIndex] || []).map((tok, tokenIndex) => renderToken(tok, tokenIndex, `${sentenceIndex}:`))}
                  </p>
                  <p className="sd-translation-text" lang="en">{pair.translation}</p>
                </article>
              ))}
            </div>}
          </div>
        </section>

        <aside className="sd-panel sd-words">
          <div className="sd-panel-head">
            <h2 className="sd-panel-title">Words</h2>
            <span className="sd-count">{scan.words.length}</span>
          </div>

          {scan.words.length === 0 ? (
            <p className="sd-empty-inline">No words recognized.</p>
          ) : (
            <ul className="sd-word-list">
              {scan.words.map((w, idx) => (
                <li key={idx} className="sd-word">
                  <div className="sd-word-main">
                    <span className="sd-word-hanzi">{w.word}</span>
                    {w.pinyin && (
                      <span className="sd-word-pinyin">{w.pinyin}</span>
                    )}
                  </div>
                  {w.translation && (
                    <p className="sd-word-translation">{w.translation}</p>
                  )}
                  <button
                    type="button"
                    className="sd-word-save"
                    onClick={() =>
                      saveWord({
                        text: w.word,
                        pinyin: w.pinyin,
                        translation: w.translation,
                      })
                    }
                    disabled={saved[w.word]}
                  >
                    {saved[w.word] ? "Saved" : "Save"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <WordPopover
        word={hovered?.tok}
        rect={hovered?.rect}
        saved={!!saved[hovered?.tok?.text]}
      />
      <SentenceSavePopover
        scopeRef={sentenceScopeRef}
        token={token}
        sourceModule="scan"
        sourceType="scan"
        sourceId={scan.id}
        tokens={scan.tokens}
        onSaved={setLastSaved}
      />
    </div>
  );
}
