import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { isBookingLive } from "../bookings";
import { fetchIfStale, hasCache, readCache, writeCache } from "../dataCache";
import Skeleton, { SkeletonCards } from "../components/Skeleton";
import BookingDialog from "../components/BookingDialog";
import ImageCropper from "../components/ImageCropper";
import PageTools from "../components/PageTools";
import FilterSelect from "../components/FilterSelect";
import PriceRange from "../components/PriceRange";
import "./FindTutor.css";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.73 6.5v11c0 .8.9 1.3 1.6.9l8.2-5.5c.6-.4.6-1.4 0-1.8L10.33 5.6c-.7-.4-1.6.1-1.6.9z" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

/* 12-lobe seal generated around (12,12) so it is centred in its own viewBox and
   fills 92% of it. The previous path sat 1.9 units high and filled only 69%,
   which made the badge render small and float above the name's baseline. */
function VerifiedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Verified" role="img">
      <path
        fill="#d61f1f"
        d="M12.00 1.00 L9.64 3.21 L6.50 2.47 L5.57 5.57 L2.47 6.50 L3.21 9.64 L1.00 12.00 L3.21 14.36 L2.47 17.50 L5.57 18.43 L6.50 21.53 L9.64 20.79 L12.00 23.00 L14.36 20.79 L17.50 21.53 L18.43 18.43 L21.53 17.50 L20.79 14.36 L23.00 12.00 L20.79 9.64 L21.53 6.50 L18.43 5.57 L17.50 2.47 L14.36 3.21 Z"
      />
      <path
        d="M7.6 12.1 10.5 15 16.4 9.1"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Rating is real (see reviews_avg_rating). Student count and years of
   experience are still stand-ins — neither has a backend, and both would need
   new tracking rather than a new query. */
const PLACEHOLDER_STATS = { students: "268", experience: "5y" };

function TutorPreview({ tutor, isSelf, alreadySent, onBook }) {
  if (!tutor) {
    return (
      <aside className="ft-preview">
        <p className="ft-preview-empty">Pick a tutor to see their profile.</p>
      </aside>
    );
  }

  return (
    <aside className="ft-preview">
      {/* The avatar is a sibling of the video, not a child: the video clips to
          its rounded corners with overflow:hidden, which was cutting off the
          half of the avatar that is meant to hang below it. */}
      <div className="ft-preview-media">
        <div className="ft-preview-video">
          {tutor.photo_url && <img src={tutor.photo_url} alt="" />}
          <button
            type="button"
            className="ft-preview-play"
            aria-label="Play introduction"
          >
            <PlayIcon />
          </button>
        </div>
        <span className="ft-preview-avatar">
          {tutor.photo_url ? (
            <img src={tutor.photo_url} alt={tutor.user.name} />
          ) : (
            <span>{tutor.user.name.charAt(0).toUpperCase()}</span>
          )}
        </span>
      </div>

      <div className="ft-preview-head">
        <div>
          <p className="ft-preview-name">{tutor.user.name}</p>
          <p className="ft-preview-role">{tutor.subjects || "Chinese Tutor"}</p>
        </div>

        <div className="ft-preview-stats">
          <span>
            <strong>{tutor.reviews_avg_rating ?? "—"}</strong>
            {/* Stars follow the real average rather than always drawing four. */}
            <em className="ft-preview-stars">
              {tutor.reviews_avg_rating
                ? "★".repeat(Math.round(tutor.reviews_avg_rating))
                : "No ratings"}
            </em>
          </span>
          <span>
            <strong>{PLACEHOLDER_STATS.students}</strong>
            Students
          </span>
          <span>
            <strong>{PLACEHOLDER_STATS.experience}</strong>
            Experience
          </span>
        </div>
      </div>

      {/* An existing booking is shown, not enforced — only the trial is
          once-per-tutor, and the dialog handles that per lesson. */}
      <button
        type="button"
        className="ft-preview-book"
        onClick={onBook}
        disabled={isSelf}
      >
        {isSelf
          ? "This is your profile"
          : alreadySent
            ? "Book another lesson"
            : "Book a lesson"}
      </button>

      <Link to={`/find-tutor/${tutor.id}`} className="ft-preview-profile">
        <PersonIcon />
        View profile
      </Link>
    </aside>
  );
}

function TagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Sits under the preview and fills in what the preview card has no room for —
 * the tutor's own words and terms. Every field here is real profile data, so
 * the card only renders the rows that tutor has actually filled in rather than
 * padding itself out with blanks.
 */
function TutorSummary({ tutor }) {
  if (!tutor) return null;

  const languages = (tutor.languages_spoken || "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = [
    tutor.subjects && {
      key: "subjects",
      Icon: GradCapIcon,
      value: tutor.subjects,
    },
    languages.length > 0 && {
      key: "languages",
      Icon: LangIcon,
      value: languages.join(" · "),
    },
    tutor.availability && {
      key: "availability",
      Icon: ClockIcon,
      value: tutor.availability,
    },
    tutor.hourly_rate != null && {
      key: "rate",
      Icon: TagIcon,
      value: `$${tutor.hourly_rate} / hour`,
    },
  ].filter(Boolean);

  const empty = !tutor.bio && rows.length === 0;

  return (
    <section className="ft-summary" aria-label={`About ${tutor.user.name}`}>
      <p className="ft-summary-label">About this tutor</p>

      {empty ? (
        <p className="ft-summary-empty">
          {tutor.user.name} hasn&rsquo;t filled in their profile yet.
        </p>
      ) : (
        <>
          {tutor.bio && <p className="ft-summary-bio">{tutor.bio}</p>}
          {rows.length > 0 && (
            <ul className="ft-summary-rows">
              {rows.map(({ key, Icon, value }) => (
                <li key={key}>
                  <Icon />
                  <span>{value}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <line x1="4" y1="7" x2="14" y2="7" />
      <circle cx="17" cy="7" r="2" />
      <line x1="10" y1="17" x2="20" y2="17" />
      <circle cx="7" cy="17" r="2" />
    </svg>
  );
}

function GradCapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4 2 9l10 5 10-5-10-5z" />
      <path d="M6 11.5V16c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5" />
    </svg>
  );
}

function LangIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h8" />
      <path d="M8 3v2c0 4-2.5 7-5 8" />
      <path d="M5 9c1.5 2.5 4 4.5 7 5" />
      <path d="M13 20l4-9 4 9" />
      <path d="M14.5 17h5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export default function FindTutor() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  /* Seeded from the shared cache during the FIRST render, not in an effect —
     an effect runs after paint, which would flash the loading state for a
     frame on a revisit and lose the point of caching at all. */
  const [tutors, setTutors] = useState(() => readCache("tutors") || []);
  const [myProfile, setMyProfile] = useState(() => readCache("tutor-profile:me") ?? null);
  const [bookings, setBookings] = useState(
    () => readCache("bookings") || { sent: [], received: [] },
  );
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(() => !hasCache("tutors"));

  /* The tutor-profile fields that used to live here went with the inline
     form — applying is /become-a-tutor now, and editing an approved profile is
     the drawer on the profile page. The cropper stays: it is still how an admin
     sets a photo on someone else's profile. */
  const [cropSource, setCropSource] = useState(null);
  // Admin setting a photo on someone else's profile: which profile it lands on,
  // and one shared hidden input so every card does not need its own.
  const [photoTargetId, setPhotoTargetId] = useState(null);
  const photoInputRef = useRef(null);


  const [search, setSearch] = useState("");
  // Which card the preview panel is showing. Null falls back to the first
  // tutor in the filtered list, so the panel is never empty.
  const [selectedId, setSelectedId] = useState(null);
  const [learnFilter, setLearnFilter] = useState("");
  const [availFilter, setAvailFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState(null);
  // The tutor whose booking dialog is open, or null. The message field lives
  // in that dialog now, so the cards collect nothing themselves.
  const [bookingTutor, setBookingTutor] = useState(null);

  // Derived from the bookings themselves rather than tracked separately: as its
  // own state it only ever filled in after booking within the session, so a
  // reload lost the badge — and it could never clear when a booking was
  // cancelled. `bookings.sent` is the one source of truth for both.
  const bookingSentTo = useMemo(() => {
    const map = {};
    for (const b of bookings.sent) {
      if (isBookingLive(b)) map[Number(b.tutor_id)] = true;
    }
    return map;
  }, [bookings.sent]);

  useEffect(() => {
    loadAll();
  }, [token]);

  /* Three independent reads rather than one Promise.all behind a single
     loading gate, so the tutor grid is not held up by the caller's own profile
     or their bookings. `tutors` is deliberately the SAME cache key the
     Dashboard uses, so arriving from there paints immediately. */
  function loadAll() {
    setLoading(true);
    fetchIfStale("tutors", () => api.getTutors(token))
      .then(setTutors)
      .catch((err) => !tutors.length && setError(err.message))
      .finally(() => setLoading(false));

    /* `.profile`, not the response itself — the endpoint returns
       {profile, options} now, and that wrapper is always truthy, so keeping it
       whole would make `!myProfile` permanently false and hide the apply
       button from everyone who has never applied. */
    fetchIfStale("tutor-profile:me", () => api.getMyTutorProfile(token))
      .then((mine) => setMyProfile(mine?.profile ?? null))
      .catch(() => {});

    fetchIfStale("bookings", () => api.getBookings(token))
      .then(setBookings)
      .catch(() => {});
  }

  /* Booking needs a time now (`starts_at` is required server-side), so the
     button opens the picker instead of posting straight away. */
  function handleBooked(booking) {
    setBookings((prev) => ({
      ...prev,
      sent: [booking, ...prev.sent.filter((b) => b.id !== booking.id)],
    }));
  }

  const filteredTutors = useMemo(() => {
    const q = search.trim().toLowerCase();
    const learn = learnFilter.trim().toLowerCase();
    const avail = availFilter.trim().toLowerCase();
    return tutors.filter((t) => {
      if (q) {
        const haystack = [t.user.name, t.subjects, t.bio, t.languages_spoken]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (learn && !(t.subjects || "").toLowerCase().includes(learn))
        return false;
      if (avail && !(t.availability || "").toLowerCase().includes(avail))
        return false;
      if (priceFilter) {
        /* A tutor who has not set a rate is excluded while a price filter is
           active. They are not "cheap" — their price is simply unknown, and
           putting them inside a band would state something the data does not.
           Number() again: SQLite hands the rate over as a string. */
        if (t.hourly_rate == null) return false;
        const rate = Number(t.hourly_rate);
        if (rate < priceFilter.min || rate > priceFilter.max) return false;
      }
      return true;
    });
  }, [tutors, search, learnFilter, availFilter, priceFilter]);

  // Filter options come from the tutors themselves — a fixed list would offer
  // choices that match nobody.
  const languageOptions = useMemo(
    () => [...new Set(tutors.map((t) => t.subjects).filter(Boolean))].sort(),
    [tutors],
  );
  const availabilityOptions = useMemo(
    () =>
      [...new Set(tutors.map((t) => t.availability).filter(Boolean))].sort(),
    [tutors],
  );

  /* The ends of the price slider, taken from the rates that actually exist.
     Derived rather than fixed, which is what let the old "$50+" bracket go:
     with a real maximum there is no "and above" left to catch.

     `Number()` because the column arrives as a STRING from SQLite, and
     Math.min on strings compares them lexically — "9" would beat "42". Null is
     dropped rather than counted as 0: an unpriced tutor is not free.

     Null when there is nothing to drag across, so the control can be hidden
     rather than rendered as a slider with both ends in the same place. */
  const priceBounds = useMemo(() => {
    const rates = tutors
      .map((t) => (t.hourly_rate == null ? null : Number(t.hourly_rate)))
      .filter((r) => r != null && Number.isFinite(r));

    if (!rates.length) return null;

    const min = Math.floor(Math.min(...rates));
    const max = Math.ceil(Math.max(...rates));

    return max > min ? { min, max } : null;
  }, [tutors]);

  const previewTutor =
    filteredTutors.find((t) => t.id === selectedId) ||
    filteredTutors[0] ||
    null;

  if (loading)
    return (
      <div className="ft">
        <Skeleton style={{ height: 40, marginBottom: "1.4rem" }} />
        <SkeletonCards className="ft-list" count={6} mediaHeight={120} />
      </div>
    );

  return (
    <div className="ft">
      <div className="ft-header">
        <div>
          <h1 className="ft-title">Find Tutor</h1>
          <p className="ft-subtitle">These are all the available tutors.</p>
        </div>
        <div className="ft-header-controls">
          <div className="ft-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search your Teacher"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="ft-search-divider" />
            <FilterIcon />
          </div>
          <div className="ft-header-icons">
            <PageTools />
          </div>
        </div>
      </div>

      {error && <p className="ft-error">{error}</p>}

      {/* Filters read as pills across the top rather than a side panel, which
          frees the right column for the tutor preview. */}
      <div className="ft-filterbar">
        <span className="ft-filterbar-label">Filter by:</span>

        <FilterSelect
          value={learnFilter}
          onChange={setLearnFilter}
          options={languageOptions}
          placeholder="Chinese ( Mandarin )"
          anyLabel="All subjects"
        />

        <FilterSelect
          value={availFilter}
          onChange={setAvailFilter}
          options={availabilityOptions}
          placeholder="Availability"
          anyLabel="Any availability"
        />

        {/* Hidden when there is no spread to drag across — every tutor on the
            same rate, or none priced at all, makes a slider that cannot say
            anything. */}
        {priceBounds && (
          <PriceRange
            min={priceBounds.min}
            max={priceBounds.max}
            value={priceFilter}
            onChange={setPriceFilter}
          />
        )}
      </div>

      <div className="ft-layout">
        <div className="ft-main">
          {filteredTutors.length === 0 ? (
            <p className="ft-empty">No tutors found.</p>
          ) : (
            <div className="ft-list">
              {filteredTutors.map((t) => (
                <div
                  className={
                    "ft-card" + (previewTutor?.id === t.id ? " selected" : "")
                  }
                  key={t.id}
                  /* Hovering drives the preview panel; clicking opens the
                     profile. Selecting on click would have left no way to open
                     a tutor from the list. */
                  onMouseEnter={() => setSelectedId(t.id)}
                  onFocus={() => setSelectedId(t.id)}
                  onClick={() => navigate(`/find-tutor/${t.id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/find-tutor/${t.id}`);
                    }
                  }}
                >
                  <span className="ft-card-frame">
                    {/* Placeholder — the API has no presence tracking yet */}
                    <span className="ft-card-online" aria-hidden="true" />
                    {user?.is_admin && (
                      <button
                        type="button"
                        className="ft-card-photo-edit"
                        title={`Set photo for ${t.user.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhotoTargetId(t.id);
                          photoInputRef.current?.click();
                        }}
                      >
                        Photo
                      </button>
                    )}
                    {t.photo_url ? (
                      <img
                        className="ft-card-photo"
                        src={t.photo_url}
                        alt={t.user.name}
                      />
                    ) : (
                      <span className="ft-card-photo-placeholder">
                        {t.user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <div className="ft-card-body">
                    <div className="ft-card-name-row">
                      {/* The tick lives INSIDE the name, not beside it. As a
                          sibling flex item it wrapped onto a line of its own as
                          soon as the name was wide enough — "Lin Wanqing" left
                          its badge stranded on the next row. Inline, it follows
                          the last word wherever that word ends up. */}
                      <p className="ft-card-name">
                        {t.user.name}{' '}
                        <span className="ft-card-verified">
                          <VerifiedIcon />
                        </span>
                      </p>
                      {/* Same number the profile card shows — both come from
                          the catalogue via TutorLesson::scopeBookablePriced, so
                          a tutor cannot read one price here and another there. */}
                      {t.cheapest_lesson != null ? (
                        <span className="ft-card-rate">from ${t.cheapest_lesson}</span>
                      ) : (
                        t.hourly_rate != null && (
                          <span className="ft-card-rate">${t.hourly_rate}/hr</span>
                        )
                      )}
                    </div>
                    {t.bio && <p className="ft-card-bio">{t.bio}</p>}
                    <div className="ft-meta">
                      {t.subjects && (
                        <span className="ft-meta-row">
                          <GradCapIcon /> {t.subjects}
                        </span>
                      )}
                      {t.languages_spoken && (
                        <span className="ft-meta-row">
                          <LangIcon /> {t.languages_spoken}
                        </span>
                      )}
                      {t.availability && (
                        <span className="ft-meta-row">
                          <ClockIcon /> Availability | ( {t.availability} )
                        </span>
                      )}
                    </div>

                    {/* Booking moved to the preview panel, per the design —
                        the cards stay purely informational. */}
                    {user && Number(t.user.id) === Number(user.id) && (
                      <span className="ft-card-self">This is your profile</span>
                    )}
                    {bookingSentTo[t.user.id] && (
                      <span className="ft-card-sent">Trial booked</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Becoming a tutor is an APPLICATION now, not a form that publishes
              you. This used to be an inline form whose submit created a live,
              publicly listed tutor in one click; it links to /become-a-tutor,
              which collects the same details plus the ones a reviewer needs and
              leaves the profile private until an admin approves it.

              Editing an existing profile still happens in the drawer on the
              profile page itself, so there is still exactly one place to edit. */}
          {!myProfile && (
            <>
              <h2 className="ft-section-title">Become a tutor</h2>
              <p className="ft-apply-note">
                Teach on Verbo. Applications are reviewed before a profile goes
                live, so students only ever see tutors we have checked.
              </p>
              <Link className="ft-apply-btn" to="/become-a-tutor">
                Apply to teach
              </Link>
            </>
          )}

          {/* Mid-application: say where it is rather than offering to start
              again, which would look like the first submission never landed. */}
          {myProfile && myProfile.status && myProfile.status !== "approved" && (
            <>
              <h2 className="ft-section-title">Your application</h2>
              <p className="ft-apply-note">
                {myProfile.status === "pending"
                  ? "Your application is with our review team."
                  : myProfile.status === "needs_info"
                    ? "We asked for a little more information."
                    : "Your application was not approved."}
              </p>
              <Link className="ft-apply-btn" to="/become-a-tutor">
                View your application
              </Link>
            </>
          )}
        </div>

        {/* One sticky column: the preview and its summary travel together, and
            sticky lives here rather than on .ft-preview so the two cannot come
            apart as you scroll. */}
        <div className="ft-side">
          <TutorPreview
            tutor={previewTutor}
            isSelf={
              Boolean(previewTutor && user) &&
              Number(previewTutor.user.id) === Number(user.id)
            }
            alreadySent={
              Boolean(previewTutor) &&
              Boolean(bookingSentTo[previewTutor.user.id])
            }
            onBook={() => previewTutor && setBookingTutor(previewTutor)}
          />
          <TutorSummary tutor={previewTutor} />
        </div>
      </div>

      {bookingTutor && (
        <BookingDialog
          token={token}
          tutor={bookingTutor}
          onBooked={handleBooked}
          onClose={() => setBookingTutor(null)}
        />
      )}

      {/* One input serves every card's Photo button */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const picked = e.target.files[0];
          if (picked) setCropSource(picked);
          e.target.value = "";
        }}
      />

      {cropSource && (
        <ImageCropper
          file={cropSource}
          onCancel={() => {
            setCropSource(null);
            setPhotoTargetId(null);
          }}
          onCrop={async (cropped) => {
            setCropSource(null);
            /* Every crop here is an admin setting a photo on someone else's
               profile — the target-less branch belonged to the inline form and
               went with it. */
            if (photoTargetId == null) return;

            try {
              await api.setTutorPhoto(token, photoTargetId, cropped);
              const fresh = await api.getTutors(token);
              setTutors(fresh);
              // The photo shows on the Dashboard's teacher cards too.
              writeCache("tutors", fresh);
            } catch (err) {
              setError(err.message);
            } finally {
              setPhotoTargetId(null);
            }
          }}
        />
      )}
    </div>
  );
}
