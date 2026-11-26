import { BookOpen, Brain, Gift, History, House, LayoutGrid, LogOut, MapPinned, Scale, ScanLine, Truck } from "lucide-react";
import { NavLink, Outlet, ScrollRestoration, useNavigate } from "react-router";

import { useLogout, useMe } from "../lib/hooks";
import { Logo } from "./Logo";
import { ButtonLink } from "./ui";

import type { Role } from "../lib/types";

const LINKS = {
  scan: { to: "/scan", label: "Scan", short: "Scan", icon: ScanLine },
  guide: { to: "/guide", label: "Bin guide", short: "Guide", icon: BookOpen },
  model: { to: "/model", label: "The model", short: "Model", icon: Brain },
  rewards: { to: "/rewards", label: "Rewards", short: "Rewards", icon: Gift },
  weigh: { to: "/operator", label: "Weigh-in", short: "Weigh-in", icon: Scale },
  board: { to: "/admin", label: "Board", short: "Board", icon: LayoutGrid },
  me: { to: "/me", label: "My account", short: "Me", icon: History },
  home: { to: "/", label: "Home", short: "Home", icon: House },
  map: { to: "/map", label: "Map", short: "Map", icon: MapPinned },
  jobs: { to: "/collect", label: "Jobs", short: "Jobs", icon: Truck },
};

/** Top links by role: staff get their screens; everyone keeps scanning and their account. */
function navFor(role: Role | undefined) {
  const { scan, map, guide, model, rewards, weigh, board, jobs, me } = LINKS;
  if (role === "admin") return [scan, map, rewards, weigh, board, me];
  if (role === "operator") return [scan, map, guide, rewards, weigh, me];
  if (role === "collector") return [jobs, map, scan, guide, me];
  return [scan, map, guide, model, rewards, me];
}

/** The phone's five tabs */
function tabsFor(role: Role | undefined) {
  const { home, scan, map, guide, rewards, weigh, board, jobs, me } = LINKS;
  if (role === "admin") return [home, scan, weigh, board, me];
  if (role === "operator") return [home, scan, weigh, map, me];
  if (role === "collector") return [home, jobs, map, scan, me];
  return [scan, map, guide, rewards, me];
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
      <span className="account__name">
        Hi, <b>{me.display_name}</b>
      </span>
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
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <div className="container masthead__row">
          <Logo />
          <nav className="masthead__nav" aria-label="Main">
            {navFor(role).map((n) => (
              <NavLink key={n.to} to={n.to} className="navlink">
                {n.label}
              </NavLink>
            ))}
          </nav>
          <AccountArea />
        </div>
      </header>

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
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={n.to === "/scan" ? "tab tab--scan" : "tab"}>
                <Icon size={20} aria-hidden />
                {n.short}
              </NavLink>
            );
          })}
        </div>
      </nav>
      <ScrollRestoration />
    </>
  );
}
