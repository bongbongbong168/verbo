import questBook from './assets/quests/book.webp'
import questBookClosed from './assets/quests/book-closed.webp'
import questBookmark from './assets/quests/bookmark.webp'
import questCamera from './assets/quests/camera.webp'
import questCheck from './assets/quests/check.webp'
import questHeadphones from './assets/quests/headphones.webp'
import questRefresh from './assets/quests/refresh.webp'
import { toast } from './toast'

/* The 3D mark for each quest, keyed by the server's `mark`. Shared by the
   Dashboard's quest card and the "quest complete" toast, so the same quest
   is drawn the same way in both. (The files are matched by ink area; see
   the note on the quest card in Dashboard.jsx.) */
export const QUEST_ART = {
  book: questBook,
  book_closed: questBookClosed,
  camera: questCamera,
  check: questCheck,
  headphones: questHeadphones,
  refresh: questRefresh,
  sparkle: questBookmark,
}

/**
 * Reads the X-Verbo-Quests header the server adds after an action that just
 * finished a daily quest (CelebrateQuests middleware) and shows one toast per
 * quest, with that quest's own icon. The server marks each one celebrated as
 * it sends it, so a toast never repeats. Anything malformed is ignored: this
 * is a bonus on top of an action that already succeeded.
 */
export function announceQuests(res) {
  const raw = res?.headers?.get?.('X-Verbo-Quests')
  if (!raw) return
  let done
  try {
    done = JSON.parse(raw)
  } catch {
    return
  }
  if (!Array.isArray(done)) return
  for (const q of done) {
    toast.show({
      type: 'success',
      title: 'Quest complete!',
      message: `${q.label}. Nice work today.`,
      avatar: QUEST_ART[q.mark],
    })
  }
}
