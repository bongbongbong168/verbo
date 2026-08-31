import MessagesButton from './MessagesButton'
import NotificationMenu from './NotificationMenu'
import ProfileMenu from './ProfileMenu'

/**
 * Messages + bell + account, in a page's top-right.
 *
 * A fragment, not a wrapper: every page that shows these already has its own
 * container for them, and those containers differ — Read and Podcast position
 * theirs absolutely against the section toggle, while Scan and Find Tutor are
 * ordinary flex items in a header row. Owning the layout here would fight all
 * of them, so this owns only *what* is shown and each page keeps *where*.
 *
 * Deliberately absent from the Study pages: their top-right already carries the
 * level and daily-goal content, and there is nowhere to put this without
 * covering something real.
 */
export default function PageTools() {
  return (
    <>
      {/* Messages sits first, left of the bell. It moved out of the sidebar's
          Tutor group: a conversation is something waiting on you, which is what
          this corner is for, rather than a destination you go looking for. */}
      <MessagesButton />
      <NotificationMenu />
      <ProfileMenu />
    </>
  )
}
