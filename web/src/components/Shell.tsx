import {
  BookOpen,
  Gift,
  History,
  LayoutGrid,
  LogOut,
  MapPinned,
  Scale,
  ScanLine,
  Truck,
  Users,
  WifiOff,
} from "lucide-react";
import { NavLink, Outlet, ScrollRestoration, useNavigate } from "react-router";

import { useLogout, useMe } from "../lib/hooks";
import { useOnline, usePageChange } from "../lib/page";
import { Logo } from "./Logo";
import { ToastProvider } from "./Toast";
import { ButtonLink } from "./ui";

import type { Role } from "../lib/types";

const LINKS = {
  scan: { to: "/scan", label: "Scan", short: "Scan", icon: ScanLine },
  guide: { to: "/guide", label: "Bin guide", short: "Guide", icon: BookOpen },
  rewards: { to: "/rewards", label: "Rewards", short: "Rewards", icon: Gift },
  weigh: { to: "/operator", label: "Weigh-in", short: "Weigh-in", icon: Scale },
  board: { to: "/admin", label: "Board", short: "Board", icon: LayoutGrid },
  me: { to: "/me", label: "My account", short: "Me", icon: History },
  map: { to: "/map", label: "Map", short: "Map", icon: MapPinned },
  jobs: { to: "/collect", label: "Jobs", short: "Jobs", icon: Truck },
  community: { to: "/community", label: "Community", short: "Community", icon: Users },
};

/** Top links by role, at most five: each role's own screen first. The account is the name at the right,
 * "The model" lives in the footer and on the home page. */
function navFor(role: Role | undefined) {
  const { scan, map, guide, rewards, weigh, board, jobs, community } = LINKS;
  if (role === "admin") return [board, weigh, map, community, scan];
  if (role === "operator") return [weigh, scan, map, rewards, guide];
  if (role === "collector") return [jobs, map, scan, guide];
  return [scan, map, guide, rewards, community];
}

/** The phone's five tabs, with Scan in the middle under the thumb (Home is the wordmark at the top) */
function tabsFor(role: Role | undefined) {
  const { scan, map, guide, rewards, weigh, board, jobs, me } = LINKS;
  if (role === "admin") return [board, weigh, scan, map, me];
  if (role === "operator") return [weigh, map, scan, rewards, me];
  if (role === "collector") return [jobs, map, scan, guide, me];
  return [map, guide, scan, rewards, me];
}

function AccountArea() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  if (me === undefined) return <div className="account" />;
  if (me === null) {
    return (
      <div className="account">
        <NavLink to="/login" className="navlink">
          Log in
        </NavLink>
        <ButtonLink to="/signup" variant="secondary" small>
          Sign up
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="account">
      <NavLink to="/me" className="account__name" viewTransition title="My account">
        Hi, <b>{me.display_name}</b>
      </NavLink>
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/") })}
        className="btn btn--quiet btn--small"
        aria-label="Log out"
        title="Log out"
      >
        <LogOut size={16} aria-hidden />
      </button>
    </div>
  );
}

export function Shell() {
  const { data: me } = useMe();
  const role = me?.role;
  const online = useOnline();
  usePageChange();
  return (
    <ToastProvider>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <div className="container masthead__row">
          <Logo />
          <nav className="masthead__nav" aria-label="Main">
            {navFor(role).map((n) => (
              <NavLink key={n.to} to={n.to} className="navlink" viewTransition>
                {({ isActive }) => (
                  <>
                    {n.label}
                    {isActive && <span className="navmark" aria-hidden />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <AccountArea />
        </div>
      </header>

      {!online && (
        <p className="offline" role="status">
          <WifiOff size={16} aria-hidden /> You are offline. What you see may be out of date, and changes will not save
          until you are back.
        </p>
      )}

      <main id="main" className="site-main">
        <Outlet />
      </main>

      <footer className="colophon">
        <div className="container">
          <p className="colophon__letter">
            Trash2Cash started at the SDG XI Hackathon 2025 (SDG 11, waste and sanitation). Its classifier was trained
            from scratch for UECS2523 Applied Machine Learning.{" "}
            <NavLink to="/model" className="link">
              How the model works
            </NavLink>
            .{" "}
            <NavLink to="/community" className="link">
              What everyone recycled
            </NavLink>
          </p>
          <p className="colophon__sign">The Trash2Cash team</p>
        </div>
      </footer>

      {/* Phone: tab bar at the bottom, where thumbs are */}
      <nav className="tabbar" aria-label="Main">
        <div className="tabbar__row">
          {tabsFor(role).map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={n.to === "/scan" ? "tab tab--scan" : "tab"}
                viewTransition
              >
                {({ isActive }) => (
                  <>
                    {isActive && n.to !== "/scan" && <span className="tabmark" aria-hidden />}
                    <Icon size={20} aria-hidden />
                    {n.short}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
      <ScrollRestoration />
    </ToastProvider>
  );
}
