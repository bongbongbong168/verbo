import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import "./VocabReview.css";

const FLIP_DURATION_MS = 520;
const GRADE_FEEDBACK_MS = 220;
const TAP_TOLERANCE_PX = 8;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A review run over a slice of the Vocabulary Bank.
 *
 * Reviewing is something you do INSIDE the bank rather than a separate feature
 * with its own collection — the learner never picks which words become cards,
 * because everything they saved already is one.
 *
 * The card shows the Chinese, you decide whether you knew it, then you check.
 * Revealing before answering would let you mark yourself right after seeing the
 * answer, which makes the "mastered" count worthless.
 */
export default function VocabReview({ title, cards, onClose, onFinished }) {
  const { token } = useAuth();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [done, setDone] = useState(false);
  /* The browser's own Chinese voice. Free and offline; saved words are not
     study rows, so the lesson pages' generated clips do not exist for them. */
  const canSpeak = typeof window !== "undefined" && !!window.speechSynthesis && !!window.SpeechSynthesisUtterance;
  const [speaking, setSpeaking] = useState(false);

  function speak(text) {
    if (!canSpeak || !text) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 0.85;
    const voice = window.speechSynthesis.getVoices().find((v) => /^zh(-|_)?(CN|Hans)?/i.test(v.lang));
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  // Stop talking when the run closes.
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState(null);
  const [readyToGrade, setReadyToGrade] = useState(false);
  // State disables the buttons after React renders; the ref closes the gap
  // between two rapid taps or key presses in the same frame.
  const busyRef = useRef(false);
  const revealRef = useRef(false);
  const revealTimerRef = useRef(null);
  const pointerRef = useRef(null);

  const card = cards[index];

  useEffect(() => {
    busyRef.current = false;
    revealRef.current = false;
    pointerRef.current = null;
  }, [index]);

  useEffect(() => () => window.clearTimeout(revealTimerRef.current), []);

  function reveal() {
    if (revealRef.current || busyRef.current || done || !card) return;
    revealRef.current = true;
    setRevealed(true);
    if (reducedMotion()) {
      setReadyToGrade(true);
    } else {
      revealTimerRef.current = window.setTimeout(() => setReadyToGrade(true), FLIP_DURATION_MS);
    }
  }

  function onCardPointerDown(e) {
    if (revealed || !e.isPrimary || e.button !== 0) return;
    pointerRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  }

  function onCardPointerMove(e) {
    const start = pointerRef.current;
    if (!start || start.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_TOLERANCE_PX) {
      start.moved = true;
    }
  }

  function onCardPointerUp(e) {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || start.id !== e.pointerId || start.moved) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_TOLERANCE_PX) reveal();
  }

  // Space reveals, then 1 / 2 answer. A drill is a keyboard job — reaching for
  // the mouse on every card is what makes people stop after five.
  useEffect(() => {
    function onKey(e) {
      if (done || busyRef.current || e.repeat) return;
      if (e.target instanceof HTMLElement &&
          (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
      if (e.key === " " && e.target instanceof HTMLButtonElement) return;
      if (e.key === " " && !revealed) {
        e.preventDefault();
        reveal();
      } else if (readyToGrade && (e.key === "1" || e.key === "2")) {
        e.preventDefault();
        answer(e.key === "1");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function answer(correct) {
    if (busyRef.current || !readyToGrade || !card) return;
    busyRef.current = true;
    setBusy(true);
    setChoice(correct);
    setScore((s) => ({
      right: s.right + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
    }));

    // Fire-and-forget on failure: the run must not stall because one grade did
    // not record. The counters are a convenience, not the content.
    await Promise.all([
      api.gradeFlashcard(token, card.id, correct).catch(() => {}),
      reducedMotion() ? Promise.resolve() : new Promise((resolve) => window.setTimeout(resolve, GRADE_FEEDBACK_MS)),
    ]);

    if (index + 1 >= cards.length) {
      setDone(true);
      onFinished?.();
    } else {
      window.clearTimeout(revealTimerRef.current);
      setIndex((i) => i + 1);
      setRevealed(false);
      setReadyToGrade(false);
      setChoice(null);
    }
    setBusy(false);
  }

  return (
    <div className="vr-scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="vr" onScrollCapture={() => { pointerRef.current = null; }}>
        <div className="vr-head">
          <span className="vr-title">{title}</span>
          <button type="button" className="vr-close" onClick={onClose}>
            Close
          </button>
        </div>

        {/* The fill is a static width, never a transition — a bar whose
            progress depends on frames reads as stuck when they do not come. */}
        <div className="vr-track">
          <span
            className="vr-fill"
            style={{
              width: `${((done ? cards.length : index) / cards.length) * 100}%`,
            }}
          />
        </div>

        {done ? (
          <div className="vr-done">
            <p className="vr-done-score">
              {score.right} / {cards.length}
            </p>
            <p className="vr-done-text">
              {score.wrong === 0
                ? "Every word right. Those streaks just moved up."
                : `${score.wrong} to come back to — they are in "Difficult words" now.`}
            </p>
            <button type="button" className="vr-cta" onClick={onClose}>
              Back to the bank
            </button>
          </div>
        ) : (
          <>
            <p className="vr-count">
              {index + 1} of {cards.length}
            </p>

            <div className="vr-card-wrap">
            <div
              key={card.id}
              className={`vr-card${revealed ? " vr-card--revealed" : ""}${busy ? " vr-card--grading" : ""}`}
              aria-live="polite"
              role={revealed ? undefined : "button"}
              tabIndex={revealed ? undefined : 0}
              aria-label={revealed ? undefined : `Show the meaning of ${card.word}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !revealed) {
                  e.preventDefault();
                  reveal();
                }
              }}
              onPointerDown={onCardPointerDown}
              onPointerMove={onCardPointerMove}
              onPointerUp={onCardPointerUp}
              onPointerCancel={() => { pointerRef.current = null; }}
            >
              <div className="vr-card-inner">
                <div className="vr-face vr-face--front" aria-hidden={revealed}>
                  <p className="vr-word">{card.word}</p>
                  <p className="vr-prompt">
                    <span className="vr-prompt-keys">Do you know this one? Press <kbd>Space</kbd> to check.</span>
                    <span className="vr-prompt-touch">Do you know this one? Tap “Show the meaning” to check.</span>
                  </p>
                </div>
                <div className="vr-face vr-face--back" aria-hidden={!revealed}>
                  <p className="vr-word">{card.word}</p>
                  {card.pinyin && <p className="vr-pinyin">{card.pinyin}</p>}
                  <p className="vr-meaning">
                    {card.translation || "No meaning saved for this word yet."}
                  </p>
                  {/* The sentence it was met in. This is the difference
                      between drilling a list and remembering where a word
                      came from. */}
                  {card.example && (
                    <div className="vr-example-block">
                      <p className="vr-example">{card.example}</p>
                      {card.example_pinyin && (
                        <p className="vr-example-pinyin">{card.example_pinyin}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
              {/* Outside the card: the card is itself the tap-to-flip target,
                  and a button inside it would be a control nested in a control. */}
              {canSpeak && (
                <button
                  type="button"
                  className={"vr-speak" + (speaking ? " on" : "")}
                  onClick={() => speak(card.word)}
                  aria-label={`Play ${card.word}`}
                  title="Play"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
                    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
                  </svg>
                </button>
              )}
            </div>

            {revealed ? (
              <div className={`vr-answers${readyToGrade ? " vr-answers--ready" : " vr-answers--waiting"}`} aria-busy={busy || !readyToGrade} aria-hidden={!readyToGrade}>
                <button
                  type="button"
                  className={`vr-btn vr-no${choice === false ? " vr-btn--chosen" : ""}`}
                  onClick={() => answer(false)}
                  disabled={busy || !readyToGrade}
                >
                  Not yet <kbd>2</kbd>
                </button>
                <button
                  type="button"
                  className={`vr-btn vr-yes${choice === true ? " vr-btn--chosen" : ""}`}
                  onClick={() => answer(true)}
                  disabled={busy || !readyToGrade}
                >
                  I knew it <kbd>1</kbd>
                </button>
              </div>
            ) : (
              <div className="vr-answers">
                <button
                  type="button"
                  className="vr-btn vr-reveal"
                  onClick={reveal}
                >
                  Show the meaning
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
