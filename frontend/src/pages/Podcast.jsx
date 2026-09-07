import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { useApiData } from "../useApiData";
import { invalidate } from "../dataCache";
import PageTools from "../components/PageTools";
import PodcastEditDrawer from "../components/PodcastEditDrawer";
import { SkeletonCards } from "../components/Skeleton";
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
      <path d="M8.5 6.2v11.6c0 .8.9 1.3 1.6.9l9.2-5.8c.6-.4.6-1.4 0-1.8L10.1 5.3c-.7-.4-1.6.1-1.6.9z" />
    </svg>
  );
}

function EpisodeCard({ episode }) {
  return (
    <div className="pc-card">
      <Link to={`/podcast/${episode.id}`} className="pc-card-cover">
        {episode.image_url ? (
          <img src={episode.image_url} alt="" />
        ) : (
          <div className="pc-card-cover-placeholder" />
        )}
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
            aria-label={`Open ${episode.title}`}
          >
            <PlayIcon />
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

  const [activeLevel, setActiveLevel] = useState("all");
  const [activeTopic, setActiveTopic] = useState("all");
  /* The episode fields, the cropper and the object-URL lifecycle all moved
     into PodcastEditDrawer with the form itself — this page only decides when
     the drawer is open. */
  const [showForm, setShowForm] = useState(false);

  /* Throws on failure so the drawer keeps the message next to the fields that
     caused it, rather than putting it on the page behind an open panel. */
  async function handleCreate(values) {
    await api.createPodcast(token, values);
    setShowForm(false);
    // Drop the list and every cached episode, so nothing still holds a
    // pre-publish copy of the library.
    invalidate("podcasts", "podcast:");
    podcastQuery.refresh();
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
  // through to the Discover new grid.
  const recommended = visible.slice(0, 4);
  const discover = visible.slice(4);

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
          <h2 className="pc-section-title">Recommendations</h2>
          <div className="pc-row">
            {recommended.map((p) => (
              <EpisodeCard key={p.id} episode={p} />
            ))}
          </div>

          <h2 className="pc-section-title">Discover new</h2>
          {discover.length === 0 ? (
            <p className="pc-empty">
              Nothing more yet — new episodes land here.
            </p>
          ) : (
            <div className="pc-grid">
              {discover.map((p) => (
                <EpisodeCard key={p.id} episode={p} />
              ))}
            </div>
          )}
        </>
      )}

    </div>
  );
}
