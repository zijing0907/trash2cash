import { BookOpen, Brain, History, House, LogOut, ScanLine } from "lucide-react";
import { NavLink, Outlet, ScrollRestoration, useNavigate } from "react-router";

import { useLogout, useMe } from "../lib/hooks";
import { Logo } from "./Logo";
import { ButtonLink } from "./ui";

const NAV = [
  { to: "/scan", label: "Scan", short: "Scan", icon: ScanLine },
  { to: "/guide", label: "Bin guide", short: "Guide", icon: BookOpen },
  { to: "/model", label: "The model", short: "Model", icon: Brain },
  { to: "/me", label: "My scans", short: "My scans", icon: History },
];

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
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <div className="container masthead__row">
          <Logo />
          <nav className="masthead__nav" aria-label="Main">
            {NAV.map((n) => (
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
          {[{ to: "/", label: "Home", short: "Home", icon: House }, ...NAV].map((n) => {
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
