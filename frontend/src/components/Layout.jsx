import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useActivityHeartbeat from "../hooks/useActivityHeartbeat";
import useUnreadMessages from "../hooks/useUnreadMessages";
import PracticeAssistant from "./PracticeAssistant";
import VerifyEmailBanner from "./VerifyEmailBanner";
import logo from "../assets/sidebar/logo.svg";
import logoMark from "../assets/sidebar/logo-mark.svg";
import owlPro from "../assets/sidebar/owl-pro.png";
import "./Layout.css";

/* The Pro button's travelling light, as [length, colour] in percent of the
   border. SVG has no gradient ALONG a stroke, so the tail is built from
   stacked dashes: each is shorter and brighter than the one under it and
   they all end at the same point, which reads as a violet comet with a
   white head. A dashed stroke also moves at an even speed round the whole
   pill, where the old rotating conic gradient raced along the long edges
   and crawled round the ends.

   32 steps, not a handful: five dashes drew five visible bands and read as
   choppy. At 32 each step is ~1.5% of the border (about 7px) with a small
   colour change, which the blurred glow copy smooths the rest of the way. */
const COMET_LEN = 50;
const COMET_STEPS = 32;
const COMET_RAMP = [
  [0, [95, 73, 203]],
  [0.4, [126, 104, 200]],
  [0.8, [182, 156, 255]],
  [0.94, [230, 220, 255]],
  [1, [255, 255, 255]],
];

function cometColor(t) {
  let i = 1;
  while (COMET_RAMP[i][0] < t) i++;
  const [t0, a] = COMET_RAMP[i - 1];
  const [t1, b] = COMET_RAMP[i];
  const k = (t - t0) / (t1 - t0);
  const [r, g, bl] = a.map((v, j) => Math.round(v + (b[j] - v) * k));
  // The tail end fades in over its first third, so it grows out of the rim.
  const alpha = Math.min(1, 0.15 + t / 0.35);
  return `rgba(${r}, ${g}, ${bl}, ${alpha.toFixed(2)})`;
}

const COMET = Array.from({ length: COMET_STEPS }, (_, i) => {
  const t = i / (COMET_STEPS - 1);
  return [+(COMET_LEN * (1 - i / COMET_STEPS)).toFixed(2), cometColor(t)];
});

function Comet({ className }) {
  return (
    <svg className={className} aria-hidden="true">
      {COMET.map(([len, color]) => (
        <rect
          key={len}
          width="100%"
          height="100%"
          rx="12"
          pathLength="100"
          stroke={color}
          strokeDasharray={`0 ${COMET_LEN - len} ${len} ${100 - COMET_LEN}`}
        />
      ))}
    </svg>
  );
}

/* Optical normalisation, measured with getBBox() rather than guessed.
 *
 * Every glyph below is drawn on the same 24 grid, but their INK boxes were not
 * the same size and did not share a centre. Measured: Settings spanned 23.7
 * units against Tools' 16.7 — a 42% spread — and Tools sat 1.11 left and 1.09
 * above the centre every other icon lands on. In a narrow column of unlabelled
 * glyphs that reads as the icons being misaligned with each other, which is
 * exactly how it was reported.
 *
 * `fit` is [scale, dx, dy], taking each icon's measured ink box to a common
 * 17.6-unit extent centred on (12, 12) — 17.6 being the median of the set, so
 * most icons barely move and only the two outliers travel far. The paths are
 * left untouched, so these numbers can be re-derived from them at any time.
 *
 * The stroke is divided by the scale on the way in, so it still RENDERS at 1.7
 * whatever the transform does — without that, shrinking Settings would also
 * make it a lighter line than the rest and trade one mismatch for another.
 * (stroke-width inherits; vector-effect does not, which is why it is done this
 * way round.)
 */
const STROKE = 1.7;

function NavIcon({ children, fit }) {
  const [s, dx, dy] = fit || [1, 0, 0];
  return (
    <svg
      className="sb-nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g
        transform={`translate(${dx} ${dy}) translate(12 12) scale(${s}) translate(-12 -12)`}
        strokeWidth={STROKE / s}
      >
        {children}
      </g>
    </svg>
  );
}

/* ink 18.7 x 18.7, centred — the largest in the set, which is what made it
   read as sitting proud of the icons under it. */
function HomeIcon() {
  return (
    <NavIcon fit={[0.9412, 0, 0]}>
      <path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-3.5v-6h-7v6H5A1.5 1.5 0 0 1 3.5 19z" />
    </NavIcon>
  );
}

/* ink 18.7 x 17.6, centre y 11.95 */
function LearnIcon() {
  return (
    <NavIcon fit={[0.9412, 0, 0.047]}>
      <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h5.5a2 2 0 0 1 1.5.7 2 2 0 0 1 1.5-.7H19a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 19h-5.2a2 2 0 0 0-1.8.9 2 2 0 0 0-1.8-.9H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M12 4.7v15.2" />
    </NavIcon>
  );
}

/* ink 18.7 x 18.7, centred */
function ExploreIcon() {
  return (
    <NavIcon fit={[0.9412, 0, 0]}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z" />
    </NavIcon>
  );
}

/* ink 19.7 x 16.9 — the widest — and sitting 0.40 low */
function TutorIcon() {
  return (
    <NavIcon fit={[0.8934, 0, -0.357]}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 5.8" />
      <path d="M18 14.9c1.8.9 3 2.7 3 4.6" />
    </NavIcon>
  );
}

/* ink 16.7 x 16.7 centred on (10.89, 10.91) — the only icon in the set that
   was not on the grid centre at all, and the one the active pill sits behind. */
function ToolsIcon() {
  return (
    <NavIcon fit={[1.0539, 1.17, 1.149]}>
      <path d="M14.8 3.6a5 5 0 0 0-6 6.6l-5 5a2 2 0 0 0 2.8 2.8l5-5a5 5 0 0 0 6.6-6l-3 3-2.4-2.4z" />
    </NavIcon>
  );
}

/* ink 23.7 x 23.7 — drawn 1..23 on the 24 grid, so 42% larger than Tools and
   the most obviously out-of-family glyph in the rail. */
function SettingsIcon() {
  return (
    <NavIcon fit={[0.7426, 0, 0]}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9.5a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88v.09a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1.03z" />
    </NavIcon>
  );
}

function CollapseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

function CaretIcon() {
  return (
    <svg
      className="sb-caret"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Six sections, not eleven links.
 *
 * Nothing here is new — every destination already existed as its own sidebar
 * row. The change is that related jobs now sit under one heading, so the rail
 * says what a learner can DO rather than listing every screen at once.
 *
 * Every section is a dropdown onto the pages it holds. There is deliberately no
 * landing page in front of any of them: a screen whose only job is to ask which
 * of two things you meant is a click that buys the user nothing.
 *
 * There is deliberately no `Practice` section — the page is a stub, and a
 * heading pointing at nothing is worse than no heading.
 */
const NAV = [
  { kind: "link", to: "/dashboard", label: "Home", Icon: HomeIcon },
  {
    kind: "group",
    key: "learn",
    label: "Learn",
    Icon: LearnIcon,
    // The two places you work through a curriculum: one self-paced, one taught.
    items: [
      { to: "/study", label: "Study" },
      { to: "/classes", label: "Classes" },
    ],
  },
  {
    kind: "group",
    key: "explore",
    label: "Explore",
    Icon: ExploreIcon,
    // The content you browse. It opens straight onto the two things rather
    // than a page that only asks which one you meant — the choice IS the menu.
    items: [
      { to: "/read", label: "Read" },
      { to: "/podcast", label: "Podcast" },
    ],
  },
  {
    kind: "group",
    key: "tutor",
    label: "Tutor",
    Icon: TutorIcon,
    /* MESSAGES IS BACK IN THE RAIL, reversing the note that used to sit here.
       The argument for keeping it only in the top-right was that the rail
       should list what you go looking for, not what is waiting on you — and
       that is exactly right, which is why it now arrives WITH A COUNT. A number
       here is the one place in the app that answers "is someone waiting on me?"
       from any page, without opening anything. Asked for directly: a bar on the
       left, the way a chat app does it. */
    items: [
      { to: "/find-tutor", label: "Find Tutor" },
      { to: "/bookings", label: "Bookings" },
      { to: "/messages", label: "Messages" },
      /* Reviewing tutor applications is a tutor-domain job, so it sits here
         rather than in an admin section of its own — one screen does not
         justify a heading. Filtered out for everyone else below; the page and
         every endpoint behind it check is_admin regardless, so this is a
         courtesy rather than the gate. */
      { to: "/tutor-applications", label: "Applications", adminOnly: true },
    ],
  },
  {
    kind: "group",
    key: "tools",
    label: "Tools",
    Icon: ToolsIcon,
    items: [
      { to: "/scan", label: "Scan" },
      { to: "/vocabulary", label: "Vocabulary Bank" },
    ],
  },
];

/** A section owns its own detail pages too — `/study` covers `/study/units/8`. */
function covers(pathname, to) {
  return pathname === to || pathname.startsWith(to + "/");
}

function entryHolds(pathname, entry) {
  const paths =
    entry.kind === "group" ? entry.items.map((i) => i.to) : [entry.to];
  return paths.some((p) => covers(pathname, p));
}

export default function Layout() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Counts time spent, for the Dashboard's activity chart. Mounted here so it
  // covers every authenticated page rather than being wired up per page.
  useActivityHeartbeat(token);

  /* THE RAIL CARRIES UNREAD MESSAGES, and that is the point of putting it here
     rather than on the Messages page: the whole reason to show a count is to
     tell someone who is NOT looking at their messages. Polled through the
     shared cache, so the sidebar remounting on every navigation costs nothing.

     Only messages for now. The bell already answers "what happened?" for
     bookings and courses; a number in the rail answers "is someone waiting on
     me?", and those are different questions. */
  const { unread: unreadMessages } = useUnreadMessages(token);

  const itemUnread = (item) => (item.to === "/messages" ? unreadMessages : 0);
  const sectionUnread = (entry) =>
    entry.items.reduce((n, item) => n + itemUnread(item), 0);

  // Persisted so the choice survives navigation and reloads — a sidebar that
  // silently re-expands on every page change would be worse than not having
  // the toggle. Read lazily so the first paint is already in the right state
  // and the rail does not flash open.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sb-collapsed") === "1",
  );

  useEffect(() => {
    localStorage.setItem("sb-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  /* The rail an ADMIN sees carries one extra row. Derived once here rather
     than filtered at each of the five places NAV is rendered — an item that has
     to be hidden in five spots is one that eventually shows up in one of
     them. */
  const nav = useMemo(
    () =>
      NAV.map((entry) =>
        entry.kind === "group"
          ? {
              ...entry,
              items: entry.items.filter((i) => !i.adminOnly || user?.is_admin),
            }
          : entry,
      ),
    [user?.is_admin],
  );

  // One section open at a time. Two or three expanded at once rebuilds exactly
  // the long list this replaced.
  const here =
    nav.find((e) => e.kind === "group" && entryHolds(pathname, e))?.key ?? null;
  const [openKey, setOpenKey] = useState(here);
  /* Which section's sheet is open on a phone. Separate from `openKey`: the
     rail's accordion and the bottom sheet are different surfaces, and sharing
     one value would leave a section silently expanded behind the other. */
  const [sheet, setSheet] = useState(null);

  // Opens the section you navigated into, without closing one you opened by
  // hand — `here` only changes when the route actually moves between sections.
  useEffect(() => {
    if (here) setOpenKey(here);
  }, [here]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function openSection(key) {
    // In the rail there is nowhere to draw the sub-list, so opening a section
    // expands the sidebar as well. (Hovering shows it without expanding.)
    if (collapsed) setCollapsed(false);
    setOpenKey((k) => (k === key && !collapsed ? null : key));
  }

  return (
    <div className="sb-shell">
      <nav className={"sb" + (collapsed ? " collapsed" : "")}>
        <div className="sb-head">
          {collapsed ? (
            <img className="sb-badge" src={logoMark} alt="Verbo" />
          ) : (
            <img className="sb-logo" src={logo} alt="Verbo" />
          )}
          <button
            type="button"
            className="sb-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <CollapseIcon />
          </button>
        </div>

        <ul className="sb-nav">
          {nav.map((entry) => {
            if (entry.kind === "link") {
              return (
                <li key={entry.to}>
                  <NavLink
                    to={entry.to}
                    className={({ isActive }) =>
                      "sb-nav-link" +
                      (isActive || entryHolds(pathname, entry) ? " active" : "")
                    }
                    /* The rail's tooltip, drawn in CSS from this attribute
                       rather than left to the browser's `title`: the native one
                       waits about a second, cannot be styled to match the rail
                       and cannot be placed. It is only shown while collapsed.

                       The label span is still in the DOM when collapsed — it is
                       clipped, not `display: none` — so the link keeps its
                       accessible name on its own and this attribute is purely
                       decorative. */
                    data-tip={entry.label}
                  >
                    <entry.Icon />
                    <span className="sb-nav-label">{entry.label}</span>
                  </NavLink>
                </li>
              );
            }

            const open = openKey === entry.key && !collapsed;
            const holds = entryHolds(pathname, entry);

            return (
              <li className="sb-group" key={entry.key}>
                <button
                  type="button"
                  className={
                    "sb-nav-link sb-group-btn" +
                    (open ? " open" : "") +
                    // Lit even while shut, so a closed section still tells you
                    // that this is where you are.
                    (holds ? " here" : "")
                  }
                  onClick={() => openSection(entry.key)}
                  aria-expanded={open}
                  /* No tooltip on a section: hovering one in the rail already
                     opens its flyout, and a chip firing at the same moment
                     would be two answers to one gesture. */
                >
                  <entry.Icon />
                  <span className="sb-nav-label">{entry.label}</span>
                  {/* The section carries the count of whatever is unread
                      INSIDE it, so a shut section — or the collapsed rail,
                      where there is no sub-list at all — still says there is
                      something waiting. Hidden once the section is open,
                      because the row below it is then saying the same thing
                      two lines further down. */}
                  {sectionUnread(entry) > 0 && !open && (
                    <span className="sb-count" aria-hidden="true">
                      {sectionUnread(entry) > 9 ? '9+' : sectionUnread(entry)}
                    </span>
                  )}
                  <CaretIcon />
                </button>

                {/* Always rendered, opened by CSS rather than by mounting it.
                    A list that appears only when `open` cannot animate — there
                    is nothing on screen to animate FROM, and unmounting cuts
                    the closing move off entirely. The wrapper animates
                    `grid-template-rows: 0fr -> 1fr`, which is the one way to
                    ease to a height nobody has measured.

                    Closed, it is zero-height with `overflow: hidden`, so it is
                    invisible and unclickable — but it is still in the document,
                    hence `tabIndex={-1}`, or Tab would walk into a section that
                    is shut. */}
                <div className="sb-sub-wrap" data-open={open}>
                  <div className="sb-sub-inner">
                    <ul className="sb-sub">
                      {entry.items.map((item) => (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            className={
                              "sb-sub-link" +
                              (covers(pathname, item.to) ? " active" : "")
                            }
                            tabIndex={open ? undefined : -1}
                          >
                            {item.label}
                            {itemUnread(item) > 0 && (
                              <span className="sb-count" aria-hidden="true">
                                {itemUnread(item) > 9 ? '9+' : itemUnread(item)}
                              </span>
                            )}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* The rail's answer to the sub-list: hovering the icon shows
                    the section without expanding the sidebar. Shown by CSS
                    :hover / :focus-within — no animation, so it cannot get
                    stranded mid-transition. */}
                {collapsed && (
                  <div className="sb-flyout">
                    <div className="sb-flyout-card">
                      <p className="sb-flyout-title">{entry.label}</p>
                      <ul>
                        {entry.items.map((item) => (
                          <li key={item.to}>
                            <NavLink
                              to={item.to}
                              className={
                                "sb-sub-link" +
                                (covers(pathname, item.to) ? " active" : "")
                              }
                            >
                              {item.label}
                              {itemUnread(item) > 0 && (
                                <span className="sb-count" aria-hidden="true">
                                  {itemUnread(item) > 9 ? '9+' : itemUnread(item)}
                                </span>
                              )}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="sb-spacer" />

        {/* Below the spacer, on its own — settings are not study content. */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            "sb-nav-link sb-settings" + (isActive ? " active" : "")
          }
          data-tip="Settings"
        >
          <SettingsIcon />
          <span className="sb-nav-label">Settings</span>
        </NavLink>

        {user && <p className="sb-user">{user.name}</p>}
        <button
          type="button"
          className="sb-logout"
          onClick={handleLogout}
          title={collapsed ? "Log out" : undefined}
        >
          <span className="sb-logout-label">Log out</span>
        </button>

        <div className="sb-promo">
          {/* The owl sits INSIDE the card, never bleeding past its top edge:
              `.sb-promo` is `overflow: hidden` because the collapse animates
              `max-height` to 0, so anything overlapping the edge is simply
              clipped. `aria-hidden` — it is decoration, and the card already
              says what it is in words. */}
          <img className="sb-promo-owl" src={owlPro} alt="" aria-hidden="true" />

          <div className="sb-promo-copy">
            <span className="sb-promo-tag">Popular</span>
            <p className="sb-promo-title">Upgrade to PRO</p>
            <p className="sb-promo-text">Unlock premium features for free.</p>
          </div>

          {/* Was a disabled button with a "Coming soon" title and nowhere to
              go. It has somewhere to go now — the plan comparison — so it is a
              link. What is still not built is the payment step, and the
              upgrade page says that itself rather than the rail implying the
              whole feature is absent. */}
          {/* The label is a span so it can sit ABOVE the two pseudo-elements
              that draw the travelling border light — a bare text node cannot
              take a z-index, so it would be painted under the fill. */}
          <NavLink to="/upgrade" className="sb-promo-btn">
            {/* The comet twice: a blurred copy underneath for the glow,
                and the crisp stroke on top (see COMET). */}
            <Comet className="sb-beam-glow" />
            <Comet className="sb-beam" />
            <span className="sb-promo-btn-label">Get Verbo+</span>
          </NavLink>
        </div>
      </nav>
      <main className="sb-main">
        {/* Above the page rather than inside it, so the prompt follows the
            reader everywhere instead of being something they can walk away
            from by clicking a link. Renders nothing for a verified account. */}
        <VerifyEmailBanner />
        <Outlet />
      </main>

      {/* Mounted HERE rather than per page, and that is the whole feature: this
          component never unmounts as you move between Read, a podcast and a
          study unit, so the conversation is still there when you reopen it.
          Per-page mounting would reset the thread on every navigation. It
          renders nothing at all unless the server reports a Gemini key. */}
      <PracticeAssistant />

      {/* ---- phone navigation ----
          Rendered always and hidden by CSS above 767px, rather than switched on
          a JS breakpoint: a width read in JS is a second source of truth that
          disagrees with the media query at the boundary and flickers on rotate.

          A bottom bar rather than a hamburger, because that is where a thumb
          is. Sections with more than one page open a sheet instead of guessing
          which of their pages you meant — the same reasoning that kept the
          desktop rail from having landing pages. */}
      <nav className="mb-tabs" aria-label="Sections">
        {nav.map((entry) => {
          const active = entryHolds(pathname, entry);

          if (entry.kind === "link") {
            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                className={"mb-tab" + (active ? " active" : "")}
                onClick={() => setSheet(null)}
              >
                <entry.Icon />
                <span>{entry.label}</span>
              </NavLink>
            );
          }

          return (
            <button
              key={entry.key}
              type="button"
              className={
                "mb-tab" +
                (active ? " active" : "") +
                (sheet === entry.key ? " open" : "")
              }
              onClick={() => setSheet((k) => (k === entry.key ? null : entry.key))}
              aria-expanded={sheet === entry.key}
            >
              <entry.Icon />
              <span>{entry.label}</span>
            </button>
          );
        })}
      </nav>

      {sheet && (
        <div
          className="mb-sheet-scrim"
          onClick={() => setSheet(null)}
          role="presentation"
        >
          {/* Stops a tap inside the sheet closing it on the way back up. */}
          <div className="mb-sheet" onClick={(e) => e.stopPropagation()}>
            <span className="mb-sheet-grip" aria-hidden="true" />
            <p className="mb-sheet-title">
              {nav.find((n) => n.key === sheet)?.label}
            </p>
            <ul>
              {nav.find((n) => n.key === sheet)?.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={
                      "mb-sheet-link" +
                      (covers(pathname, item.to) ? " active" : "")
                    }
                    onClick={() => setSheet(null)}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
              {/* Settings has no tab of its own — it is not a section, and a
                  sixth tab would crowd a 390px bar. It rides in whichever
                  sheet is open so it is never more than two taps away. */}
              <li>
                <NavLink
                  to="/settings"
                  className={
                    "mb-sheet-link mb-sheet-aside" +
                    (pathname === "/settings" ? " active" : "")
                  }
                  onClick={() => setSheet(null)}
                >
                  Settings
                </NavLink>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
