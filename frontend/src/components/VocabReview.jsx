import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import "./VocabReview.css";

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
  const [busy, setBusy] = useState(false);

  const card = cards[index];

  // Space reveals, then 1 / 2 answer. A drill is a keyboard job — reaching for
  // the mouse on every card is what makes people stop after five.
  useEffect(() => {
    function onKey(e) {
      if (done) return;
      if (e.key === " " && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && (e.key === "1" || e.key === "2")) {
        e.preventDefault();
        answer(e.key === "1");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function answer(correct) {
    if (busy || !card) return;
    setBusy(true);
    setScore((s) => ({
      right: s.right + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
    }));

    // Fire-and-forget on failure: the run must not stall because one grade did
    // not record. The counters are a convenience, not the content.
    try {
      await api.gradeFlashcard(token, card.id, correct);
    } catch {
      /* ignore */
    }

    if (index + 1 >= cards.length) {
      setDone(true);
      onFinished?.();
    } else {
      setIndex((i) => i + 1);
      setRevealed(false);
    }
    setBusy(false);
  }

  return (
    <div className="vr-scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="vr">
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

            <div className="vr-card">
              <p className="vr-word">{card.word}</p>

              {revealed ? (
                <>
                  {card.pinyin && <p className="vr-pinyin">{card.pinyin}</p>}
                  <p className="vr-meaning">
                    {card.translation || "No meaning saved for this word yet."}
                  </p>
                  {/* The sentence it was met in. This is the difference
                      between drilling a list and remembering where a word
                      came from. */}
                  {card.example && <p className="vr-example">{card.example}</p>}
                  {card.source && (
                    <p className="vr-source">
                      {card.source.label} · {card.source.title}
                    </p>
                  )}
                </>
              ) : (
                <p className="vr-prompt">
                  Do you know this one? Press <kbd>Space</kbd> to check.
                </p>
              )}
            </div>

            {revealed ? (
              <div className="vr-answers">
                <button
                  type="button"
                  className="vr-btn vr-no"
                  onClick={() => answer(false)}
                  disabled={busy}
                >
                  Not yet <kbd>2</kbd>
                </button>
                <button
                  type="button"
                  className="vr-btn vr-yes"
                  onClick={() => answer(true)}
                  disabled={busy}
                >
                  I knew it <kbd>1</kbd>
                </button>
              </div>
            ) : (
              <div className="vr-answers">
                <button
                  type="button"
                  className="vr-btn vr-reveal"
                  onClick={() => setRevealed(true)}
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
