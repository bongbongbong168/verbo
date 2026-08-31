/**
 * Pulls the sentence a word was met in out of an annotated token array.
 *
 * The Vocabulary Bank shows this back as "You found this in…", which is the
 * whole point of Verbo: a word is learned through the content it appeared in,
 * not as an isolated entry. Capturing it at SAVE time is deliberate — the
 * article or transcript can be edited or deleted afterwards, and a sentence
 * re-derived later might no longer be the one the learner actually read.
 *
 * `tokens` is what `DictionaryService::annotate()` returns: word tokens
 * interleaved with raw text tokens carrying the original punctuation and line
 * breaks, so the boundaries are really in the data rather than guessed at.
 */

/** Chinese and Latin sentence enders, plus the quote marks that trail them. */
const ENDERS = /[。！？!?；;\n]/;

const MAX_CHARS = 240;

/**
 * The sentence containing `tokens[index]`, or null when there is nothing
 * useful to keep.
 *
 * Walks outwards from the word to the nearest boundary in either direction.
 * Text tokens are scanned character by character rather than treated as
 * atomic — one text token routinely holds the end of one sentence and the
 * start of the next ("。我们").
 */
export function sentenceAt(tokens, index) {
  if (!Array.isArray(tokens) || index < 0 || index >= tokens.length) return null;

  let before = "";
  for (let i = index - 1; i >= 0; i--) {
    const text = tokens[i].text || "";
    const cut = lastBoundary(text);
    if (cut !== -1) {
      before = text.slice(cut + 1) + before;
      break;
    }
    before = text + before;
    if (before.length > MAX_CHARS) break;
  }

  let after = "";
  for (let i = index + 1; i < tokens.length; i++) {
    const text = tokens[i].text || "";
    const cut = text.search(ENDERS);
    if (cut !== -1) {
      // Keep the terminator: a sentence that stops before its own full stop
      // reads as truncated even when it is complete.
      after += text.slice(0, cut + 1);
      break;
    }
    after += text;
    if (after.length > MAX_CHARS) break;
  }

  const sentence = (before + (tokens[index].text || "") + after).trim();

  // A "sentence" that is only the word itself tells the learner nothing they
  // cannot see on the card already — better to store nothing than noise.
  if (!sentence || sentence === (tokens[index].text || "").trim()) return null;

  return sentence.slice(0, 2000);
}

/** Index of the last sentence boundary in a string, or -1. */
function lastBoundary(text) {
  for (let i = text.length - 1; i >= 0; i--) {
    if (ENDERS.test(text[i])) return i;
  }
  return -1;
}

/**
 * The sentence for a token object, found by identity first.
 *
 * The fallback matters: on Scan the aside's Save buttons hand over a row from
 * the word LIST, which is a different object than the token in the text even
 * though it is the same word. Falling back to the first matching word token
 * means those saves keep their context too instead of silently losing it.
 */
export function exampleFor(tokens, tok) {
  if (!Array.isArray(tokens) || !tok) return null;

  let index = tokens.indexOf(tok);

  if (index === -1) {
    const text = tok.text || tok.word || tok.hanzi;
    if (!text) return null;
    index = tokens.findIndex((t) => t.type === "word" && t.text === text);
  }

  return index === -1 ? null : sentenceAt(tokens, index);
}
