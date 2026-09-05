/**
 * What "Trending" means, in one place.
 *
 * Two pages offer it — the Read page's topic row and the Dashboard's Top Reads
 * row — and they filter by different things otherwise (topic vs format). The
 * ordering itself must not differ between them: a reader who sees one order on
 * the Dashboard and another on Read has been told two different stories about
 * the same library, and a second copy of this rule is exactly how that starts.
 */

/**
 * The filter row's non-topic value.
 *
 * Deliberately not the word "Trending": the Read page's other pills ARE
 * `articles.category` values, so a real topic published under that name would
 * otherwise be indistinguishable from this pill.
 */
export const TRENDING = '__trending'

/**
 * Most-liked first.
 *
 * Articles with NO likes are dropped rather than sorted to the bottom. Ordering
 * the whole library by a column that is zero for most of it produces the
 * default list under a heading claiming otherwise — better to show fewer
 * articles, or an honest empty state, than to call the newest thing trending
 * because nothing has been liked yet.
 *
 * Returns a new array; the caller's list is left alone.
 */
export function byTrending(articles) {
  return (articles || [])
    // Number(): a COUNT comes back as a string from SQLite, and '10' - '9'
    // would sort as text.
    .filter((a) => Number(a.likes_count ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.likes_count) - Number(a.likes_count) ||
        // Equal likes: newer first, so the order is stable rather than falling
        // back to whatever the database happened to return.
        new Date(b.created_at) - new Date(a.created_at),
    )
}
