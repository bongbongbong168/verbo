import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { useApiData } from "../useApiData";
import { invalidate } from "../dataCache";
import PageTools from "../components/PageTools";
import PodcastEditDrawer from "../components/PodcastEditDrawer";
import { SkeletonCards } from "../components/Skeleton";
import ShelfRail from "../components/ShelfRail";
import SaveHeartButton from "../components/SaveHeartButton";
import "./Podcast.css";

/* Stable identity for an absent list — a fresh [] each render would re-run
   every dependent useMemo. */
const EMPTY = [];

const LEVELS = ["Beginner", "Intermediate", "Advanced"];

/* The topics an episode can be filed under, in the order the filter row shows
   them. Mirrors Podcast::CATEGORIES on the server — the first four are
   deliberately words the Read page also shelves by, so a learner meets one
   vocabulary across the app rather than two. */
const TOPICS = [
  "Everyday Chinese",
  "Culture",
  "Travel",
  "Business",
  "Technology",
  "Society",
];

/* Cover art ratio, shared by the list card (261x150) and the episode page
   (290x167). Both views use the same file, so the crop has to satisfy both. */

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.375 6.2v11.6c0 .8.9 1.3 1.6.9l9.2-5.8c.6-.4.6-1.4 0-1.8L7.975 5.3c-.7-.4-1.6.1-1.6.9z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </svg>
  );
}

/* A SHELF WITH NO SCROLLBAR UNDER IT. The row was a plain `overflow-x: auto`,
   so the browser drew its own scrub bar across the page — the widest, greyest
   thing in the section, and it made the shelf read as spilling out of the
   panel rather than continuing past it.

   The bar is hidden and the two jobs it did are given back properly: the wheel,
   and paging arrows laid OVER the row's edges. Those arrows used to sit beside
   the title; they were moved onto the row because from the heading they were a
   long way from the thing they move and gave no clue which shelf they belonged
   to when two sat close together.

   There is no arrow-shaped hole for the keyboard either: the row is
   `tabindex="0"`, so arrow keys scroll it natively once tabbed into, and the
   overlay buttons are ordinary buttons that appear on `:focus-within`. */
function Rail({ title, children, onViewAll }) {
  /* The scrolling, the wheel handler, the ends detection and the paging arrows
     all live in `ShelfRail` now — the Dashboard wants the identical behaviour,
     and two copies of it is the drift `SectionToggle`, `ArticleCover` and
     `ReaderSwitch` were each extracted to stop. What stays here is this page's
     own heading row and its card sizing, which the row class carries in. */
  return (
    <>
      <div className="pc-section-head">
        <h2 className="pc-section-title">{title}</h2>
        {onViewAll && (
          <div className="pc-rail-nav">
            <button type="button" className="pc-viewall" onClick={onViewAll}>
              View all
              <ChevronIcon />
            </button>
          </div>
        )}
      </div>
      <ShelfRail className="pc-row" label={title}>
        {children}
      </ShelfRail>
    </>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

/* ONE RAIL PER TOPIC, the shape the Read page browses by — and a RAIL, not a
   static grid.

   Everything below Recommendations used to be a single `Discover new` grid:
   every remaining episode in one undifferentiated block, which answers "what
   else is there?" and nothing else. A shelf per topic answers the question
   people actually arrive with — what is there about travel, about business.

   They were grids at first, and that was the bug behind "when I scroll on the
   podcast card it should move left or right": a vertical gesture over a box
   with no vertical overflow scrolls the PAGE, so only the Recommendations row
   moved sideways and every other card on the page ignored the wheel. One `Rail`
   for all of them also keeps the arrows, the hidden scrollbar and the wheel
   handler from drifting apart between the top of the page and the rest of it.

   `View all` filters the page in place rather than routing: the grid it would
   navigate to is the one the topic pills already build, and a second copy is a
   second thing to keep true. Same decision, same wording, as Read. */

/* Eight to a rail. Four was the figure while these were grids, where a shelf
   is meant to tempt rather than empty a topic onto the page — but a rail that
   holds everything it is given has nothing to scroll, and scrolling is now the
   point. Eight overflows at any realistic width while still stopping short of
   the whole library. */
const SHELF_SIZE = 8;

function EpisodeCard({ episode }) {
  const { token } = useAuth();
  const [saved, setSaved] = useState(!!episode.saved);
  return (
    <div className="pc-card">
      <SaveHeartButton
        saved={saved}
        label={episode.title}
        onToggle={async () => setSaved((await api.togglePodcastSave(token, episode.id)).saved)}
      />
      <Link to={`/podcast/${episode.id}`} className="pc-card-cover">
        {episode.image_url ? (
          <img src={episode.image_url} alt="" />
        ) : (
          <div className="pc-card-cover-placeholder" />
        )}
        {episode.is_premium && <span className="pc-pro-badge">Verbo Pro</span>}
      </Link>
      <div className="pc-card-body">
        {episode.level && <p className="pc-card-level">{episode.level}</p>}
        <Link to={`/podcast/${episode.id}`} className="pc-card-title-link">
          <h3 className="pc-card-title">{episode.title}</h3>
        </Link>
        {episode.bio && <p className="pc-card-bio">{episode.bio}</p>}
        <div className="pc-card-footer">
          <div>
            {/* The PRESENTER, falling back to the uploading account only when
                no host is set. Showing `user.name` first is what put "admin"
                and "BannerVerify" under these titles — that is a fact about
                which login created the row, not about who is speaking. */}
            {(episode.host || episode.user?.name) && (
              <p className="pc-card-author">{episode.host || episode.user.name}</p>
            )}
            <p className="pc-card-lang">Chinese (Mandarin)</p>
          </div>
          <Link
            to={`/podcast/${episode.id}`}
            className="pc-play-btn"
            aria-label={episode.premium_locked ? `View premium episode ${episode.title}` : `Open ${episode.title}`}
          >
            {episode.premium_locked ? <LockIcon /> : <PlayIcon />}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** mm:ss, the same shape the episode page's player uses. */
function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * An episode already in progress. The episode card's shell, plus the two
 * things that make it a resume rather than a listing: how far in, and how far
 * there is to go.
 *
 * The bar is drawn only when a duration is known. The client reports it once
 * the audio's metadata loads, so a row written before that has a position and
 * no total — and a progress bar with an invented denominator would be the one
 * untrue thing on the card.
 */
function ResumeCard({ row }) {
  const { podcast, position_seconds: at, duration_seconds: total } = row;
  const pct = total ? Math.min(100, Math.round((at / total) * 100)) : null;

  return (
    <div className="pc-card pc-card-resume">
      <Link to={`/podcast/${podcast.id}`} className="pc-card-cover">
        {podcast.image_url ? (
          <img src={podcast.image_url} alt="" />
        ) : (
          <div className="pc-card-cover-placeholder" />
        )}
        {podcast.is_premium && <span className="pc-pro-badge">Verbo Pro</span>}
      </Link>
      <div className="pc-card-body">
        {podcast.level && <p className="pc-card-level">{podcast.level}</p>}
        <Link to={`/podcast/${podcast.id}`} className="pc-card-title-link">
          <h3 className="pc-card-title">{podcast.title}</h3>
        </Link>

        {pct !== null && (
          <div className="pc-resume-bar" aria-hidden="true">
            <span className="pc-resume-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="pc-resume-time">
          {total ? `${clock(at)} / ${clock(total)}` : `Stopped at ${clock(at)}`}
        </p>

        <div className="pc-card-footer">
          <div>
            {(podcast.host || podcast.author) && (
              <p className="pc-card-author">{podcast.host || podcast.author}</p>
            )}
            <p className="pc-card-lang">Chinese (Mandarin)</p>
          </div>
          <Link
            to={`/podcast/${podcast.id}`}
            className="pc-play-btn"
            aria-label={`Continue ${podcast.title} from ${clock(at)}`}
          >
            {podcast.premium_locked ? <LockIcon /> : <PlayIcon />}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Podcast() {
  const { token, user } = useAuth();
  /* Same cache key the Dashboard uses for this list, so arriving from there
     paints instantly rather than refetching what is already in hand. */
  const podcastQuery = useApiData("podcasts", () => api.getPodcasts(token));
  const podcasts = podcastQuery.data || EMPTY;
  const loading = podcastQuery.loading;
  const error = podcastQuery.error?.message || null;

  /* Episodes started and not finished. Its own cache key so it can be dropped
     independently — the library list is unchanged by listening to something,
     but this row is stale the moment you do. */
  const continueQuery = useApiData("podcasts-continue", () =>
    api.getContinueListening(token, 3),
  );
  const inProgress = continueQuery.data || EMPTY;

  const [activeLevel, setActiveLevel] = useState("all");
  const [activeTopic, setActiveTopic] = useState("all");
  /* The episode fields, the cropper and the object-URL lifecycle all moved
     into PodcastEditDrawer with the form itself — this page only decides when
     the drawer is open. */
  const [showForm, setShowForm] = useState(false);

  /* Throws on failure so the drawer keeps the message next to the fields that
     caused it, rather than putting it on the page behind an open panel. */
  async function handleCreate(values, existingPodcast) {
    const saved = existingPodcast
      ? await api.updatePodcast(token, existingPodcast.id, values)
      : await api.createPodcast(token, values);
    // Drop the list and every cached episode, so nothing still holds a
    // pre-publish copy of the library. The drawer decides whether to close or
    // stay open for Sync after the episode has been created.
    invalidate("podcasts", "podcast:");
    podcastQuery.refresh();
    return saved;
  }

  // Only offer level filters that actually have episodes.
  const availableLevels = useMemo(() => {
    const present = new Set(podcasts.map((p) => p.level).filter(Boolean));
    return LEVELS.filter((l) => present.has(l));
  }, [podcasts]);

  /* Same rule for topics, and in the model's order rather than whatever order
     the rows arrived in — a filter row that reshuffles between visits is
     harder to use than one that stays put. An unknown topic (a category
     retired from the list but still on an episode) is appended rather than
     dropped, or that episode would be unreachable from here. */
  const availableTopics = useMemo(() => {
    const present = [...new Set(podcasts.map((p) => p.category).filter(Boolean))];
    const known = TOPICS.filter((t) => present.includes(t));
    const extra = present.filter((t) => !TOPICS.includes(t)).sort();
    return [...known, ...extra];
  }, [podcasts]);

  /* The two filters are independent and AND together: level says how hard,
     topic says what about, and they answer different questions — so picking
     "Travel" should not throw away a "Beginner" choice already made. */
  const visible = useMemo(
    () =>
      podcasts.filter(
        (p) =>
          (activeLevel === "all" || p.level === activeLevel) &&
          (activeTopic === "all" || p.category === activeTopic),
      ),
    [podcasts, activeLevel, activeTopic],
  );

  // Latest four lead the horizontal Recommendations row; the rest fall
  // through to the shelves below it.
  const recommended = visible.slice(0, 4);
  const discover = visible.slice(4);

  /* Built from `discover`, not from everything, so an episode already leading
     the Recommendations row is not shown twice on one screen. Topics come from
     what has actually been published, in the model`s order — the same list the
     pills read, so the shelves can never offer a topic the filter cannot. */
  const shelves = useMemo(
    () =>
      availableTopics
        .map((topic) => ({
          topic,
          items: discover
            .filter((p) => p.category === topic)
            .slice(0, SHELF_SIZE),
        }))
        .filter((s) => s.items.length > 0),
    [availableTopics, discover],
  );

  /* Anything published without a topic still has to be reachable, so it gets
     the old flat grid under a heading that says what it is rather than being
     silently dropped off the page. */
  const unfiled = discover.filter((p) => !p.category);

  /* Shelves answer "show me around"; a chosen topic or level is someone who
     has already said what they want, and three-at-a-time shelving would hide
     matches from them. Same swap the Read page makes, for the same reason. */
  const browsing = activeTopic === "all" && activeLevel === "all";

  return (
    <div className="pc">
      {/* The title sits IN the topbar rather than under it. That row already
          exists to carry the tools, so naming the page here costs no vertical
          space — which was the whole objection to giving these pages a heading
          in the first place. */}
      <div className="pc-topbar">
        <h1 className="pc-title">Podcast</h1>
        <div className="pc-topbar-icons">
          <PageTools />
        </div>
      </div>

      <hr className="pc-divider" />

      {error && <p className="pc-error">{error}</p>}

      {/* Topics on their own row above the levels. They are the page's primary
          cut of the library — what an episode is ABOUT is what someone picks
          first — and there are too many to share a line with the levels without
          wrapping around them. */}
      {availableTopics.length > 0 && (
        <div className="pc-topics">
          <button
            type="button"
            className={"pc-filter" + (activeTopic === "all" ? " active" : "")}
            onClick={() => setActiveTopic("all")}
          >
            All topics
          </button>
          {availableTopics.map((t) => (
            <button
              key={t}
              type="button"
              className={"pc-filter" + (activeTopic === t ? " active" : "")}
              onClick={() => setActiveTopic(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="pc-controls-row">
        {availableLevels.length > 0 && (
          <div className="pc-filters">
            <button
              type="button"
              className={"pc-filter" + (activeLevel === "all" ? " active" : "")}
              onClick={() => setActiveLevel("all")}
            >
              All levels
            </button>
            {availableLevels.map((l) => (
              <button
                key={l}
                type="button"
                className={"pc-filter" + (activeLevel === l ? " active" : "")}
                onClick={() => setActiveLevel(l)}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        {user?.is_admin && (
          <button
            type="button"
            className="pc-new-btn"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "New episode"}
          </button>
        )}
      </div>

      {/* The publish form is the shared drawer now. It was an inline block
          that pushed the entire episode list down the page whenever it was
          open, and it carried its own copy of the cropper wiring. */}
      {showForm && user?.is_admin && (
        <PodcastEditDrawer onSave={handleCreate} onClose={() => setShowForm(false)} />
      )}

      {loading ? (
        <SkeletonCards className="pc-grid" count={6} mediaHeight={128} />
      ) : visible.length === 0 ? (
        <p className="pc-empty">No episodes yet.</p>
      ) : (
        <>
          {/* Real resume state, not a shelf. It leads the page because it is
              the only row that knows anything about THIS listener — everything
              below is the same library for everyone. Rendered only when there
              is something to resume: a "continue listening" heading over an
              empty space is worse than no heading. */}
          {inProgress.length > 0 && (
            <>
              <h2 className="pc-section-title">Pick up where you left off</h2>
              <div className="pc-row">
                {inProgress.map((row) => (
                  <ResumeCard key={row.podcast.id} row={row} />
                ))}
              </div>
            </>
          )}

          <Rail title="Recommendations">
            {recommended.map((p) => (
              <EpisodeCard key={p.id} episode={p} />
            ))}
          </Rail>

          {discover.length === 0 && (
            <p className="pc-empty">
              Nothing more yet — new episodes land here.
            </p>
          )}

          {browsing ? (
            <>
              {shelves.map((shelf) => (
                <Rail
                  key={shelf.topic}
                  title={shelf.topic}
                  onViewAll={() => setActiveTopic(shelf.topic)}
                >
                  {shelf.items.map((p) => (
                    <EpisodeCard key={p.id} episode={p} />
                  ))}
                </Rail>
              ))}

              {unfiled.length > 0 && (
                <Rail title="More episodes">
                  {unfiled.map((p) => (
                    <EpisodeCard key={p.id} episode={p} />
                  ))}
                </Rail>
              )}
            </>
          ) : (
            discover.length > 0 && (
              <Rail title="More in this filter">
                {discover.map((p) => (
                  <EpisodeCard key={p.id} episode={p} />
                ))}
              </Rail>
            )
          )}
        </>
      )}

    </div>
  );
}
