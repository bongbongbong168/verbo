import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useApiData } from "../useApiData";
import PremiumBadge from "./PremiumBadge";
import "../pages/Read.css";

/**
 * "Recommended for You" under a podcast episode.
 *
 * Built from the `podcasts` list the Podcast page already caches, so it costs
 * no request on the way in from there. Rule-based like the article
 * recommender, and each card says why: the same topic scores higher than the
 * same level, and a tie keeps the list's own (newest first) order. Cards wear
 * the article recommendation's look so the two pages read as one app.
 */
export default function RecommendedEpisodes({ current, limit = 3 }) {
  const { token } = useAuth();
  const { data } = useApiData("podcasts", () => api.getPodcasts(token));

  const list = Array.isArray(data) ? data : data?.data || [];
  const picks = list
    .filter((p) => p.id !== current.id)
    .map((p, order) => {
      const sameTopic = Boolean(current.category) && p.category === current.category;
      const sameLevel = Boolean(current.level) && p.level === current.level;
      const why = sameTopic
        ? `Also about ${p.category}`
        : sameLevel
          ? `Another ${p.level} episode`
          : "More to listen to";
      return { p, why, score: (sameTopic ? 2 : 0) + (sameLevel ? 1 : 0), order };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit);

  if (picks.length === 0) return null;

  return (
    <section className="rd-recs">
      <div className="rd-sec-head">
        <h2 className="rd-sec-title">Recommended for You</h2>
      </div>

      <div className="rd-rec-grid">
        {picks.map(({ p, why }) => (
          <Link key={p.id} className="rd-rec" to={`/podcast/${p.id}`}>
            <span className="rd-rec-thumb">
              {p.image_url ? <img src={p.image_url} alt="" /> : <span className="rd-rec-ph" />}
            </span>

            <span className="rd-rec-body">
              <span className="rd-rec-tags">
                {p.is_premium && <PremiumBadge inline />}
                {p.level && <span className="rd-chip rd-chip-level">{p.level}</span>}
                {p.category && <span className="rd-chip rd-chip-tag">{p.category}</span>}
              </span>

              <span className="rd-rec-title">{p.title}</span>
              <span className="rd-rec-why">{why}</span>

              <span className="rd-rec-foot">
                {p.host || "Verbo"}
                <span className="rd-rec-cta">Listen</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
