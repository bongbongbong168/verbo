import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import ImageCropper from "../components/ImageCropper";
import LearningPreferences from "../components/LearningPreferences";
import PaymentMethods from "../components/PaymentMethods";
import PageTools from "../components/PageTools";
import { SCALE_OPTIONS, getAppScale, setAppScale } from "../appScale";
import "./Settings.css";

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 5 5 9-11" />
    </svg>
  );
}

/* The three saved lists, each with its own mark, its own way back to the
   thing, and its own empty line. ONE EMPTY SENTENCE PER KIND, not the same
   "Nothing saved yet." three times: the panel opens empty for everyone, so
   those three lines are the first thing anyone reads here, and each should
   say where the save button actually is. */
const SAVED_GROUPS = [
  {
    kind: "tutor",
    title: "Teachers",
    empty: "Save a teacher from their profile and they wait here.",
    to: (item) => `/find-tutor/${item.id}`,
    name: (item) => item.user?.name || "Teacher",
    mark: (
      <>
        <circle cx="12" cy="8.5" r="3.6" />
        <path d="M5 19.5c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" />
      </>
    ),
  },
  {
    kind: "podcast",
    title: "Podcasts",
    empty: "Save an episode while you listen to come back to it.",
    to: (item) => `/podcast/${item.id}`,
    name: (item) => item.title,
    mark: (
      <>
        <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
        <path d="M4 14h2.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 18z" />
        <path d="M20 14h-2.5a1 1 0 0 0-1 1v3.5a1 1 0 0 0 1 1h1a1.5 1.5 0 0 0 1.5-1.5z" />
      </>
    ),
  },
  {
    kind: "read",
    title: "Reads",
    empty: "Save an article while you read it to keep it here.",
    to: (item) => `/read/${item.id}`,
    name: (item) => item.title,
    mark: (
      <>
        <path d="M12 7.5v12" />
        <path d="M12 7.5C10.6 6.2 8.8 5.5 6.8 5.5H3.5v12h3.3c2 0 3.8.7 5.2 2 1.4-1.3 3.2-2 5.2-2h3.3v-12h-3.3c-2 0-3.8.7-5.2 2z" />
      </>
    ),
  },
];

function SavedMark({ children }) {
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
      {children}
    </svg>
  );
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* The left sub-nav. `key` doubles as the `?s=` value, so a section is a real
   address — the Profile page can link straight at Security rather than dropping
   someone at the top of Settings to hunt for it. */
const SECTIONS = [
  { key: "profile", label: "Profile" },
  { key: "learning", label: "Learning" },
  { key: "payments", label: "Payments" },
  { key: "security", label: "Security" },
  { key: "appearance", label: "Appearance" },
  { key: "saved", label: "Saved" },
  { key: "data", label: "Your data" },
];

/**
 * Settings.
 *
 * Laid out from three supplied references, and the pick is deliberate:
 *
 *  - The LEFT sub-nav is ProDeel's. It scales, and it sits on the same side as
 *    the app's own rail so navigation stays in one column. Duolingo's right-hand
 *    rail was rejected for exactly that reason — a second menu on the opposite
 *    edge is what makes a settings page feel like it is "everywhere".
 *  - The ROW layout is the CRM reference's: label and a line of help on the
 *    left, the control on the right, hairline between rows. It is the clearest
 *    shape for a settings form because every row answers "what does this do?"
 *    before you touch it, and the eye scans one column instead of five cards.
 *  - ProDeel's read-only card + "Edit" button was NOT taken. It adds a mode to
 *    every field, and most of what is here is a toggle or a choice that has no
 *    sensible "view" state.
 *
 * There is deliberately no single Save button, unlike the CRM reference: the
 * name, the password, the picture and the local preferences each hit a
 * different endpoint at a different moment, and one batched save could not
 * report a partial failure honestly. Same reasoning as the tutor edit drawer.
 *
 * Every control changes something the app actually does — there are no
 * decorative toggles, and nothing here is a placeholder.
 */
export default function Settings() {
  const { token, user, setUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const active = SECTIONS.some((s) => s.key === params.get("s"))
    ? params.get("s")
    : "profile";

  const [stats, setStats] = useState(null);
  const [savedLibrary, setSavedLibrary] = useState(null);
  const [openSavedMenu, setOpenSavedMenu] = useState(null);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(null);
  /* The file waiting to be cropped. Null means the cropper is closed. */
  const [cropSource, setCropSource] = useState(null);

  const [name, setName] = useState(user?.name || "");
  const avatarRef = useRef(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [scale, setScale] = useState(() => getAppScale());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sb-collapsed") === "1",
  );

  useEffect(() => {
    setName(user?.name || "");
  }, [user]);

  useEffect(() => {
    if (!token) return;
    api
      .getUserStats(token)
      .then(setStats)
      .catch(() => setStats(null));
  }, [token]);

  useEffect(() => {
    if (!token || active !== "saved") return;
    Promise.all([api.getSavedLibrary(token), api.getBookmarks(token)])
      .then(([library, articles]) => setSavedLibrary({ ...library, articles }))
      .catch(() => setSavedLibrary({ tutors: [], podcasts: [], articles: [] }));
  }, [token, active]);

  useEffect(() => {
    const closeSavedMenu = (event) => {
      if (!event.target.closest(".se-saved-actions")) setOpenSavedMenu(null);
    };
    document.addEventListener("pointerdown", closeSavedMenu);
    return () => document.removeEventListener("pointerdown", closeSavedMenu);
  }, []);

  function say(message) {
    setFlash(message);
    setTimeout(() => setFlash(null), 2600);
  }

  /* One wrapper for every mutation, as in the edit drawers: it owns the error
     reset, the busy key and the flash so each handler states only its own work. */
  async function run(key, work, done) {
    setError(null);
    setBusy(key);
    try {
      const result = await work();
      if (done) done(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function removeSavedItem(kind, id) {
    const listKey = kind === "tutor" ? "tutors" : kind === "podcast" ? "podcasts" : "articles";
    const request = kind === "tutor"
      ? () => api.toggleTutorSave(token, id)
      : kind === "podcast"
        ? () => api.togglePodcastSave(token, id)
        : () => api.toggleArticleBookmark(token, id);

    run(`unsave-${kind}-${id}`, request, () => {
      setSavedLibrary((current) => ({
        ...current,
        [listKey]: current[listKey].filter((item) => item.id !== id),
      }));
      setOpenSavedMenu(null);
      say("Removed from saved");
    });
  }

  const saveName = (e) => {
    e.preventDefault();
    run(
      "name",
      () => api.updateProfile(token, { name }),
      (updated) => {
        // Keep the sidebar's greeting in step without a reload.
        if (setUser) setUser(updated);
        say("Name updated");
      },
    );
  };

  /* The returned user replaces the one in context, so the sidebar, the account
     popover and every message row pick the new picture up without a refetch. */
  /* Picking a file opens the cropper rather than uploading straight away.
     It used to upload the raw image, which then had to survive `object-fit:
     cover` in a 42px circle — on a full-length photo that centres on the
     torso and the face never appears. A tutor's marketing photo already went
     through this cropper; the account avatar, which is the picture shown on
     every message row and in the account button, did not. */
  function onAvatarPicked(e) {
    const file = e.target.files?.[0];
    // Cleared immediately so picking the SAME file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    setCropSource(file);
  }

  function uploadAvatar(file) {
    run(
      "avatar",
      () => api.uploadAvatar(token, file),
      (updated) => {
        if (setUser) setUser(updated);
        say("Profile picture updated");
      },
    );
  }

  function removeAvatar() {
    run(
      "avatar",
      () => api.removeAvatar(token),
      (updated) => {
        if (setUser) setUser(updated);
        say("Profile picture removed");
      },
    );
  }

  const savePassword = (e) => {
    e.preventDefault();

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }

    if (!password) {
      setError("Create a new password.");
      return;
    }

    if (password.length < 8) {
      setError("Your new password needs at least 8 characters.");
      return;
    }

    if (!passwordConfirm) {
      setError("Type your new password again to confirm it.");
      return;
    }

    if (password !== passwordConfirm) {
      setError("Your new passwords do not match.");
      return;
    }

    run(
      "password",
      () =>
        api.updatePassword(token, {
          current_password: currentPassword,
          password,
          password_confirmation: passwordConfirm,
        }),
      () => {
        setCurrentPassword("");
        setPassword("");
        setPasswordConfirm("");
        say("Password updated — other devices were signed out");
      },
    );
  };

  /* The way back in for someone who cannot remember their current password —
     the form above requires it, and this does not. It takes no email: the
     server reads it off the session, so this button cannot be aimed at
     another account.

     IT SENDS *AND THEN TAKES YOU TO THE CODE FIELD*. Sending alone was the
     bug: you were handed a six-digit code and left to find
     /forgot-password yourself, then retype the address you are already
     signed in as. The code had nowhere to go. Now one click mails it and
     lands on the step that spends it, with the email already filled in.

     On failure it stays put, so the error is read next to the button that
     caused it rather than on a page you did not ask for. */
  const sendResetLink = () =>
    run(
      "resetLink",
      () => api.sendMyResetLink(token),
      (res) =>
        navigate("/forgot-password", {
          state: {
            email: user?.email || "",
            step: "code",
            notice: res?.message || "Check your email for the code.",
          },
        }),
    );

  const revokeSessions = () =>
    run(
      "sessions",
      () => api.revokeOtherSessions(token),
      ({ revoked }) => {
        setStats((s) => (s ? { ...s, other_sessions: 0 } : s));
        say(
          revoked > 0
            ? `Signed out of ${revoked} other ${revoked === 1 ? "session" : "sessions"}`
            : "No other sessions were open",
        );
      },
    );

  function chooseScale(value) {
    setScale(setAppScale(value));
    say(`Interface scale set to ${Math.round(value * 100)}%`);
  }

  function toggleSidebar(collapsed) {
    setSidebarCollapsed(collapsed);
    localStorage.setItem("sb-collapsed", collapsed ? "1" : "0");
    // Layout reads this on mount, so tell the user what to expect rather than
    // silently doing nothing until the next page load.
    say("Saved — the sidebar changes on your next page load");
  }

  const section = SECTIONS.find((s) => s.key === active);

  return (
    <div className="se">
      <div className="se-top">
        <div>
          <h1 className="se-title">Settings</h1>
          <p className="se-sub">Your account and how Verbo looks.</p>
        </div>
        <div className="se-tools">
          <PageTools />
        </div>
      </div>

      {/* Above the panel, not inside it: the message belongs to whatever you
          just did, and a section switch must not carry it away mid-read. */}
      {error && <p className="se-error" role="alert">{error}</p>}
      {flash && <p className="se-flash">{flash}</p>}

      <div className="se-shell">
        <nav className="se-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              type="button"
              key={s.key}
              className={"se-nav-item" + (active === s.key ? " active" : "")}
              onClick={() => setParams({ s: s.key }, { replace: true })}
              aria-current={active === s.key ? "page" : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <section className="se-panel">
          <h2 className="se-panel-title">{section.label}</h2>

          {/* ---- profile ---- */}
          {active === "profile" && (
            <div className="se-rows">
              {/* The photo sits with the name because they are one thing —
                  your identity — rather than two screens. */}
              <div className="se-row">
                <div className="se-row-text">
                  <p className="se-row-label">Profile picture</p>
                  <p className="se-row-help">
                    Shown on your profile, in the sidebar and on every message
                    you send. JPG, PNG or WebP, up to 4 MB.
                  </p>
                </div>
                <div className="se-row-control se-avatar-row">
                  {user?.avatar_url ? (
                    <img className="se-avatar" src={user.avatar_url} alt="" />
                  ) : (
                    <span className="se-avatar se-avatar-initial">
                      {(user?.name || "?").trim().charAt(0).toUpperCase()}
                    </span>
                  )}

                  <div className="se-avatar-actions">
                    <button
                      type="button"
                      className="se-btn se-btn-sm"
                      onClick={() => avatarRef.current?.click()}
                      disabled={busy === "avatar"}
                    >
                      {busy === "avatar"
                        ? "Uploading…"
                        : user?.avatar_url
                          ? "Change"
                          : "Upload"}
                    </button>

                    {user?.avatar_url && (
                      <button
                        type="button"
                        className="se-btn-quiet"
                        onClick={removeAvatar}
                        disabled={busy === "avatar"}
                      >
                        Remove
                      </button>
                    )}

                    <input
                      ref={avatarRef}
                      type="file"
                      hidden
                      accept="image/jpeg,image/png,image/webp"
                      onChange={onAvatarPicked}
                    />
                  </div>
                </div>
              </div>

              <form className="se-row" onSubmit={saveName}>
                <div className="se-row-text">
                  <p className="se-row-label">Display name</p>
                  <p className="se-row-help">
                    What tutors see when you book a lesson.
                  </p>
                </div>
                <div className="se-row-control se-inline">
                  <input
                    className="se-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={255}
                  />
                  <button
                    type="submit"
                    className="se-btn"
                    disabled={
                      busy === "name" || name.trim() === (user?.name || "")
                    }
                  >
                    {busy === "name" ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>

              <div className="se-row">
                <div className="se-row-text">
                  <p className="se-row-label">Email</p>
                  {/* Honest about why, rather than offering a change that would
                      need a verification email this app cannot send. */}
                  <p className="se-row-help">
                    Cannot be changed here — there is no verification email set
                    up yet, so changing it could lock you out.
                  </p>
                </div>
                <div className="se-row-control">
                  <input
                    className="se-input"
                    value={user?.email || ""}
                    readOnly
                    disabled
                  />
                </div>
              </div>
            </div>
          )}

          {/* ---- learning ---- */}
          {active === "learning" && (
            <div className="se-rows">
              <div className="se-row se-row-stack">
                <div className="se-row-text">
                  <p className="se-row-label">What you are working towards</p>
                  <p className="se-row-help">
                    Verbo uses this to pick the articles under
                    &ldquo;Recommended for You&rdquo;.
                  </p>
                </div>
                <div className="se-row-control">
                  <LearningPreferences />
                </div>
              </div>
            </div>
          )}

          {/* ---- payments ----
              A real section now, not the "Soon" chip the Profile page used to
              carry. It manages CARDS, which is a different thing from taking a
              payment: what is stored is the brand, the last four digits and the
              expiry, so a person can recognise and pick one at checkout. The
              number itself is never sent here — see components/PaymentMethods. */}
          {active === "payments" && (
            <div className="se-rows">
              <div className="se-row se-row-stack">
                <div className="se-row-text">
                  <p className="se-row-label">Saved cards</p>
                  <p className="se-row-help">
                    Pick one at checkout instead of typing it in each time. Only
                    the brand, the last four digits and the expiry are stored.
                  </p>
                </div>
                <PaymentMethods token={token} />
              </div>
            </div>
          )}

          {/* ---- security ---- */}
          {active === "security" && (
            <div className="se-rows">
              <form className="se-row se-row-stack" noValidate onSubmit={savePassword}>
                <div className="se-row-text">
                  <p className="se-row-label">Password</p>
                  <p className="se-row-help">
                    Your current password is required even though you are signed
                    in — that is what protects an account left open on a shared
                    machine. Changing it signs you out everywhere else.
                  </p>
                </div>

                <div className="se-row-control se-stack">
                  <label className="se-field">
                    <span>Current password</span>
                    <input
                      className="se-input"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </label>
                  <label className="se-field">
                    <span>New password</span>
                    <input
                      className="se-input"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </label>
                  <label className="se-field">
                    <span>Confirm new password</span>
                    <input
                      className="se-input"
                      type="password"
                      autoComplete="new-password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      minLength={8}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="se-btn"
                    disabled={busy === "password"}
                  >
                    {busy === "password" ? "Updating…" : "Update password"}
                  </button>
                </div>
              </form>

              {/* The form above needs the CURRENT password, which is exactly
                  what the person this row is for does not have: signed in on
                  a device that remembered them, and unable to recall it. The
                  server reads the address off the session rather than the
                  request, so this cannot be aimed at another account. */}
              <div className="se-row">
                <div className="se-row-text">
                  <p className="se-row-label">Forgot your password?</p>
                  <p className="se-row-help">
                    If you cannot remember your current one, we will email a six-digit
                    code to {user?.email} and take you straight to the screen that uses
                    it. Setting a new password there signs you out everywhere —
                    including here.
                  </p>
                </div>

                <div className="se-row-control">
                  <button
                    type="button"
                    className="se-btn se-btn-ghost"
                    disabled={busy === "resetLink"}
                    onClick={sendResetLink}
                  >
                    {/* Gmail's SMTP send happens inside the request and takes
                        ~5s, so this label is on screen long enough to be read.
                        It says what is happening rather than just "Sending…",
                        which at that length reads as stuck. */}
                    {busy === "resetLink" ? "Emailing your code…" : "Email me a reset code"}
                  </button>
                </div>
              </div>

              <div className="se-row">
                <div className="se-row-text">
                  <p className="se-row-label">Signed-in devices</p>
                  <p className="se-row-help">
                    {stats?.other_sessions
                      ? `You are signed in on ${stats.other_sessions} other ${
                          stats.other_sessions === 1
                            ? "device or browser"
                            : "devices or browsers"
                        }. This one stays signed in.`
                      : "No other devices are signed in."}
                  </p>
                </div>
                <div className="se-row-control">
                  <button
                    type="button"
                    className="se-btn se-btn-ghost"
                    onClick={revokeSessions}
                    disabled={busy === "sessions" || !stats?.other_sessions}
                  >
                    {busy === "sessions"
                      ? "Signing out…"
                      : "Sign out everywhere else"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ---- appearance ---- */}
          {active === "appearance" && (
            <div className="se-rows">
              <div className="se-row">
                <div className="se-row-text">
                  <p className="se-row-label">Interface scale</p>
                  <p className="se-row-help">
                    How large everything is drawn. Saved on this device only.
                  </p>
                </div>
                <div className="se-row-control se-choices">
                  {SCALE_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={
                        "se-choice" + (scale === o.value ? " active" : "")
                      }
                      onClick={() => chooseScale(o.value)}
                      aria-pressed={scale === o.value}
                    >
                      <span className="se-choice-label">
                        {o.label}
                        {scale === o.value && <CheckIcon />}
                      </span>
                      <span className="se-choice-hint">{o.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="se-row">
                <div className="se-row-text">
                  <p className="se-row-label">Start with the sidebar collapsed</p>
                  <p className="se-row-help">
                    Opens every page with the rail narrowed to icons. Takes
                    effect on your next page load.
                  </p>
                </div>
                <div className="se-row-control se-row-control-end">
                  <label className="se-switch">
                    <input
                      type="checkbox"
                      checked={sidebarCollapsed}
                      onChange={(e) => toggleSidebar(e.target.checked)}
                    />
                    <span className="se-switch-track" aria-hidden="true" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {active === "saved" && (
            <div className="se-saved">
              <div className="se-saved-intro">
                <p className="se-row-help">Keep teachers, podcasts, and reads you want to return to in one place.</p>
              </div>
              {!savedLibrary ? <p className="se-row-help">Loading saved items…</p> : (
                <div className="se-saved-groups">
                  {SAVED_GROUPS.map((group) => {
                    const items =
                      group.kind === "tutor"
                        ? savedLibrary.tutors
                        : group.kind === "podcast"
                          ? savedLibrary.podcasts
                          : savedLibrary.articles;

                    return (
                      <section key={group.kind} className="se-saved-group">
                        <header className="se-saved-head">
                          <h2>{group.title}</h2>
                          {/* The count is the one fact the header can add, and
                              it is the reason an empty group still reads as a
                              list rather than as a broken one. */}
                          <span className="se-saved-count">{items.length}</span>
                        </header>

                        {items.length ? (
                          <ul className="se-saved-list">
                            {items.map((item) => (
                              <li key={item.id} className="se-saved-row">
                                <Link to={group.to(item)} className="se-saved-item">
                                  {group.kind !== "tutor" && (
                                    <span className={`se-saved-thumb se-saved-thumb-${group.kind}`} aria-hidden="true">
                                      {item.image_url ? <img src={item.image_url} alt="" /> : <span>{group.kind === "podcast" ? "听" : "读"}</span>}
                                    </span>
                                  )}
                                  <span className="se-saved-item-copy">
                                    <span className="se-saved-name">{group.name(item)}</span>
                                    {group.kind !== "tutor" && (
                                      <span className="se-saved-meta">
                                        {group.kind === "podcast"
                                          ? item.category || "Podcast"
                                          : `${item.category || "Read"} · ${item.reading_minutes || 1} min read`}
                                      </span>
                                    )}
                                  </span>
                                </Link>
                                <div className="se-saved-actions">
                                  <button
                                    type="button"
                                    className="se-saved-more-button"
                                    aria-label={`More options for ${group.name(item)}`}
                                    aria-expanded={openSavedMenu === `${group.kind}-${item.id}`}
                                    onClick={() => setOpenSavedMenu((current) => current === `${group.kind}-${item.id}` ? null : `${group.kind}-${item.id}`)}
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <circle cx="5" cy="12" r="1.7" />
                                      <circle cx="12" cy="12" r="1.7" />
                                      <circle cx="19" cy="12" r="1.7" />
                                    </svg>
                                  </button>
                                  {openSavedMenu === `${group.kind}-${item.id}` && <div className="se-saved-menu">
                                    <button
                                      type="button"
                                      disabled={busy === `unsave-${group.kind}-${item.id}`}
                                      onClick={() => removeSavedItem(group.kind, item.id)}
                                    >
                                      {busy === `unsave-${group.kind}-${item.id}` ? "Removing…" : "Remove from saved"}
                                    </button>
                                  </div>}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="se-saved-empty se-saved-empty-teachers">
                            <strong>No saved {group.title.toLowerCase()} yet</strong>
                            <p>{group.empty}</p>
                            <Link
                              to={{ tutor: "/find-tutor", podcast: "/podcast" }[group.kind] || "/read"}
                              className="se-saved-browse"
                            >
                              Browse {group.title.toLowerCase()}
                            </Link>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
              <p className="se-saved-tip">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="se-saved-tip-bulb">
                  <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
                </svg>
                <span>
                  Tip: Look for the save icon
                  <svg viewBox="0 0 24 24" aria-label="save" className="se-saved-tip-heart">
                    <path d="M6.5 4h11v16l-5.5-4-5.5 4z" />
                  </svg>
                  on any teacher, episode, or article to add it here.
                </span>
              </p>
            </div>
          )}

          {/* ---- your data ---- */}
          {active === "data" && (
            <div className="se-rows">
              <div className="se-row se-row-stack">
                <div className="se-row-text">
                  <p className="se-row-label">What Verbo has saved</p>
                  <p className="se-row-help">
                    Every number here is a live count for this account.
                  </p>
                </div>
                <div className="se-row-control">
                  <dl className="se-stats">
                    <div>
                      <dt>Vocabulary</dt>
                      <dd>{stats ? stats.flashcards : "—"}</dd>
                    </div>
                    <div>
                      <dt>Scans</dt>
                      <dd>{stats ? stats.scans : "—"}</dd>
                    </div>
                    <div>
                      <dt>Units opened</dt>
                      <dd>{stats ? stats.units_opened : "—"}</dd>
                    </div>
                    <div>
                      <dt>Member since</dt>
                      <dd>{stats ? formatDate(stats.member_since) : "—"}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* `aspect={1}` because the avatar is shown in a circle everywhere it
          appears — the account button, message rows, review rows. Cropping to
          the shape it will actually be displayed in is the whole point; a
          13:15 crop would just be re-cropped by `object-fit` later. */}
      {cropSource && (
        <ImageCropper
          file={cropSource}
          aspect={1}
          onCancel={() => setCropSource(null)}
          onCrop={(cropped) => {
            setCropSource(null);
            uploadAvatar(cropped);
          }}
        />
      )}
    </div>
  );
}
