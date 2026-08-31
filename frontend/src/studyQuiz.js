/* Vocabulary-round generation, shared by the quiz page and the launcher that
   counts what a run will contain.
   Kept in one place because the two disagreed once already: the launcher used
   Math.min(wordCount, ROUNDS) and promised five questions for a unit that could
   only build four. A round needs at least one distractor, so a word whose
   partners have nothing in the same field cannot be asked about at all. */

/** How many vocabulary questions to generate, and how many options each gets. */
export const VOCAB_ROUNDS = 5
const OPTIONS = 4

export function shuffle(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Turn a unit's own vocabulary into multiple-choice questions.
 *
 * This is the "matching" half of the quiz — hanzi against its meaning or
 * pinyin — rendered in the same 2x2 grid as the authored questions rather than
 * as a separate pairing widget, so one page carries both kinds. It needs no
 * authoring: any unit with a couple of usable words already has a round.
 *
 * The answer is inherent in the vocabulary the page was handed, so these are
 * marked in the browser; authored questions are not, and go to the server.
 */
export function buildVocabQuestions(vocabulary = []) {
  const usable = vocabulary.filter((w) => w.hanzi && (w.translation || w.pinyin))
  if (usable.length < 2) return []

  return (
    shuffle(usable)
      .slice(0, VOCAB_ROUNDS)
      .map((word) => {
        // Ask for whichever field this word actually has.
        const field = word.translation ? 'translation' : 'pinyin'
        const others = usable.filter(
          (w) => w.id !== word.id && w[field] && w[field] !== word[field],
        )
        const distractors = shuffle(others).slice(0, OPTIONS - 1)
        const options = shuffle([word, ...distractors]).map((w) => w[field])

        return {
          key: `vocab-${word.id}-${field}`,
          kind: 'vocab',
          label: field === 'translation' ? 'Meaning' : 'Pinyin',
          prompt:
            field === 'translation'
              ? `What does ${word.hanzi} mean?`
              : `How is ${word.hanzi} pronounced?`,
          options,
          correctIndex: options.indexOf(word[field]),
        }
      })
      // A question with nothing to choose between is not a question.
      .filter((q) => q.options.length >= 2)
  )
}

/** How many pairs a matching round puts on screen. Four fits two short columns. */
export const MATCH_SIZE = 4

/**
 * A matching round: hanzi on one side, meanings on the other, tap to pair.
 *
 * This is the interaction the multiple-choice vocabulary rounds cannot test —
 * recognising one word among four is easier than holding a whole set apart at
 * once. It needs no authoring either; the unit's own words are the question.
 *
 * Returns null when there is nothing to build from: pairs must have DISTINCT
 * answers, or two right-hand tiles would read identically and one of them could
 * never be judged wrong.
 */
export function buildMatchQuestion(vocabulary = []) {
  const seen = new Set()
  const usable = []

  for (const w of shuffle(vocabulary)) {
    const answer = w.translation || w.pinyin
    if (!w.hanzi || !answer) continue
    const key = answer.trim().toLowerCase()
    if (seen.has(key) || seen.has(w.hanzi)) continue
    seen.add(key)
    seen.add(w.hanzi)
    usable.push({ id: w.id, hanzi: w.hanzi, answer })
    if (usable.length === MATCH_SIZE) break
  }

  if (usable.length < 3) return null

  return {
    key: 'match-round',
    kind: 'match',
    label: 'Matching',
    prompt: 'Match each word to its meaning',
    pairs: usable,
    // Each column is shuffled independently, so the rows never line up.
    left: shuffle(usable.map((p) => p.id)),
    right: shuffle(usable.map((p) => p.id)),
  }
}
