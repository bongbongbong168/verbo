/* Splitting a passage into sentences, for the pages that show the English
 * under its own Chinese line: Read and Podcast.
 *
 * ONE COPY, because there were two and they were identical — the drift that
 * `SectionToggle`, `EditDrawer`, `ArticleCover` and `ReaderSwitch` were each
 * pulled out for. The CRLF bug below was fixed on Read first and would have
 * stayed broken on Podcast for exactly as long as nobody opened an episode.
 */

/* THE BLANK-LINE PATTERN HAS TO ALLOW `\r`. Bodies authored on Windows arrive
   as CRLF, so a paragraph break is "\r\n\r\n" — which `\n[ \t]*\n` does not
   match. The break then rode along at the START of the next sentence instead
   of ending the previous one, and under `white-space: pre-wrap` it drew two
   empty lines inside that sentence's own box: the ~120px hole between every
   pair that was reported. */
const BREAK = /(\r?\n[ \t\r]*\r?\n+|[。！？!?]+[”’）】〕》]*)/u;
const IS_BREAK = /^\r?\n[ \t\r]*\r?\n+$|[。！？!?]/u;

/* A SENTENCE MUST NOT CARRY THE WHITESPACE AROUND IT. The splitter keeps every
   original character, which is right while the passage is one `pre-wrap` block
   and wrong the moment each sentence becomes its own box. Only the EDGES are
   trimmed — the spaces inside a sentence are still the author's. */
function trimEdges(parts) {
  /* Copy only the text parts this trims. WORD TOKENS MUST STAY THE SAME
     OBJECTS: the hover handlers match on identity, and a fresh copy every
     render meant leaving a word never matched, so its card stuck open. */
  const out = parts.map((part) => (part.type === "text" ? { ...part } : part));
  while (out.length && out[0].type === "text") {
    out[0].text = String(out[0].text).replace(/^\s+/u, "");
    if (out[0].text) break;
    out.shift();
  }
  for (let i = out.length - 1; i >= 0 && out[i].type === "text"; i--) {
    out[i].text = String(out[i].text).replace(/\s+$/u, "");
    if (out[i].text) break;
    out.pop();
  }
  return out;
}

/**
 * Annotated tokens in, one array of tokens per sentence out. Word tokens pass
 * through untouched so the hover and Alt+1 handlers still get their word.
 */
export function sentencesOf(tokens) {
  const sentences = [];
  let current = [];
  for (const tok of tokens) {
    if (tok.type === "word") {
      current.push(tok);
      continue;
    }
    String(tok.text)
      .split(BREAK)
      .forEach((piece) => {
        if (!piece) return;
        current.push({ type: "text", text: piece });
        if (IS_BREAK.test(piece)) {
          if (current.some((part) => String(part.text).trim())) sentences.push(trimEdges(current));
          current = [];
        }
      });
  }
  if (current.some((part) => String(part.text).trim())) sentences.push(trimEdges(current));
  return sentences;
}

export function englishSentences(text) {
  return String(text || "")
    .split(/\r?\n[ \t\r]*\r?\n+/)
    .flatMap((paragraph) => paragraph.match(/[^.!?]+(?:[.!?]+|$)/g) || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Split the annotated tokens along sentences that were cut from the RAW text
 * (the body or transcript), keeping every word token intact.
 *
 * The pages pair English by the raw text's sentences when the token stream's
 * own boundaries disagree with it. Rendering those raw sentences as plain
 * strings lost the word spans, and with them hover, pinyin and Alt+1. This
 * hands back token arrays instead, so the paired view stays interactive.
 *
 * Alignment is by non-whitespace characters. A word that would straddle two
 * sentences, or text that does not add up, returns null and the caller keeps
 * its unpaired layout rather than pairing wrongly.
 */
export function tokensBySentences(tokens, rawSentences) {
  const targets = rawSentences.map((s) => String(s).replace(/\s+/gu, "").length);
  if (!targets.length || targets.some((n) => n === 0)) return null;

  const groups = [];
  let current = [];
  let count = 0;
  const close = () => {
    groups.push(trimEdges(current));
    current = [];
    count = 0;
  };

  for (const tok of tokens) {
    if (groups.length >= targets.length) {
      // Only whitespace may follow the last sentence.
      if (String(tok.text).trim()) return null;
      continue;
    }
    if (tok.type === "word") {
      const n = String(tok.text).replace(/\s+/gu, "").length;
      if (count + n > targets[groups.length]) return null;
      current.push(tok);
      count += n;
      if (count === targets[groups.length]) close();
      continue;
    }
    // Plain text may be split anywhere, one character at a time.
    let buf = "";
    for (const ch of String(tok.text)) {
      if (groups.length >= targets.length) {
        if (ch.trim()) return null;
        continue;
      }
      buf += ch;
      if (!/\s/u.test(ch)) count += 1;
      if (count === targets[groups.length]) {
        current.push({ type: "text", text: buf });
        buf = "";
        close();
      }
    }
    if (buf) current.push({ type: "text", text: buf });
  }

  return groups.length === targets.length ? groups : null;
}
