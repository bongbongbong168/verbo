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
  const out = parts.map((part) => ({ ...part }));
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
