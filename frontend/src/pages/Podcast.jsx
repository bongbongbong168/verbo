import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import SectionToggle from "../components/SectionToggle";
import ImageCropper from "../components/ImageCropper";
import PageTools from "../components/PageTools";
import "./Podcast.css";

const LEVELS = ["Beginner", "Intermediate", "Advanced"];

/* Cover art ratio, shared by the list card (261x150) and the episode page
   (290x167). Both views use the same file, so the crop has to satisfy both. */
const COVER_ASPECT = 261 / 150;

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
            {episode.user?.name && (
              <p className="pc-card-author">{episode.user.name}</p>
            )}
            <p className="pc-card-lang">Chinese (Mandarin)</p>
          </div>
          <Link
            to={`/podcast/${episode.id}`}
            className="pc-play-btn"
            aria-label={`Play ${episode.title}`}
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
  const [podcasts, setPodcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeLevel, setActiveLevel] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [bio, setBio] = useState("");
  const [transcript, setTranscript] = useState("");
  const [audio, setAudio] = useState(null);
  const [image, setImage] = useState(null);
  const [cropSource, setCropSource] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Built in an effect, not in render — createObjectURL during render mints a
  // new URL every pass and never frees them.
  useEffect(() => {
    if (!image) return setImagePreview(null);
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPodcasts();
  }, [token]);

  function loadPodcasts() {
    setLoading(true);
    api
      .getPodcasts(token)
      .then(setPodcasts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createPodcast(token, {
        title,
        level,
        bio,
        transcript,
        audio,
        image,
      });
      setTitle("");
      setLevel("Beginner");
      setBio("");
      setTranscript("");
      setAudio(null);
      setImage(null);
      setShowForm(false);
      loadPodcasts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Only offer level filters that actually have episodes.
  const availableLevels = useMemo(() => {
    const present = new Set(podcasts.map((p) => p.level).filter(Boolean));
    return LEVELS.filter((l) => present.has(l));
  }, [podcasts]);

  const visible = useMemo(
    () =>
      activeLevel === "all"
        ? podcasts
        : podcasts.filter((p) => p.level === activeLevel),
    [podcasts, activeLevel],
  );

  // Latest four lead the horizontal Recommendations row; the rest fall
  // through to the Discover new grid.
  const recommended = visible.slice(0, 4);
  const discover = visible.slice(4);

  return (
    <div className="pc">
      <div className="pc-topbar">
        <SectionToggle active="podcast" />
        <div className="pc-topbar-icons">
          <PageTools />
        </div>
      </div>

      <hr className="pc-divider" />

      {error && <p className="pc-error">{error}</p>}

      <div className="pc-controls-row">
        {availableLevels.length > 0 && (
          <div className="pc-filters">
            <button
              type="button"
              className={"pc-filter" + (activeLevel === "all" ? " active" : "")}
              onClick={() => setActiveLevel("all")}
            >
              All
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

      {showForm && user?.is_admin && (
        <form className="pc-form" onSubmit={handleCreate}>
          <div>
            <label>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Level</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="e.g. Native Mandarin speaker from Chengdu, Sichuan, with 6 years of teaching experience."
            />
          </div>
          <div>
            <label>Transcript (Chinese text)</label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={6}
              required
            />
          </div>
          <div>
            <label>Audio file</label>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudio(e.target.files[0])}
              required
            />
          </div>
          <div>
            <label>Cover image (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                // Crop before it becomes the upload, so the framing you choose
                // is what both the list card and the episode page show.
                const picked = e.target.files[0];
                if (picked) setCropSource(picked);
                e.target.value = "";
              }}
            />
            {image && imagePreview && (
              <span className="pc-photo-chosen">
                <img src={imagePreview} alt="" />
                Ready to upload
                <button type="button" onClick={() => setCropSource(image)}>
                  Adjust
                </button>
              </span>
            )}
          </div>
          <button
            type="submit"
            className="pc-btn-primary"
            disabled={submitting}
          >
            {submitting ? "Publishing..." : "Publish"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="pc-empty">Loading...</p>
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

      {cropSource && (
        <ImageCropper
          file={cropSource}
          aspect={COVER_ASPECT}
          outputWidth={720}
          onCancel={() => setCropSource(null)}
          onCrop={(cropped) => {
            setImage(cropped);
            setCropSource(null);
          }}
        />
      )}
    </div>
  );
}
