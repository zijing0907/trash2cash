import { clsx } from "clsx";
import { BookOpen, Brain, History, House, LogOut, ScanLine } from "lucide-react";
import { NavLink, Outlet, ScrollRestoration, useNavigate } from "react-router";

import { useLogout, useMe } from "../lib/hooks";
import { Logo } from "./Logo";
import { ButtonLink } from "./ui";

const NAV = [
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/guide", label: "Bin guide", icon: BookOpen },
  { to: "/model", label: "The model", icon: Brain },
  { to: "/me", label: "My scans", icon: History },
];

function AccountArea() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  if (me === undefined) return <div className="w-32" />;
  if (me === null) {
    return (
      <div className="flex items-center gap-1">
        <ButtonLink to="/login" variant="ghost">
          Log in
        </ButtonLink>
        <ButtonLink to="/signup" className="hidden sm:inline-flex">
          Sign up
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-ink-soft sm:inline">
        Hi, <span className="font-semibold text-ink">{me.display_name}</span>
      </span>
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/") })}
        className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-paper-deep hover:text-ink"
        aria-label="Log out"
        title="Log out"
      >
        <LogOut className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function Shell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  clsx(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    isActive ? "bg-leaf-100 text-leaf-800" : "text-ink-soft hover:bg-paper-deep hover:text-ink",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <AccountArea />
        </div>
      </header>

      <main className="flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>

      <footer className="hidden border-t border-line/60 md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink-soft">
          <p>
            Trash2Cash · started at the SDG XI Hackathon 2025 (SDG 11, waste & sanitation). Classifier trained from
            scratch for UECS2523 Applied Machine Learning.
          </p>
          <NavLink to="/model" className="font-medium text-leaf-700 hover:underline">
            How the model works →
          </NavLink>
        </div>
      </footer>

      {/* Phone: tab bar at the bottom, where thumbs are */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
          {[{ to: "/", label: "Home", icon: House }, ...NAV].map((n) => {
            const Icon = n.icon;
            const isScan = n.to === "/scan";
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  clsx(
                    "flex flex-col items-center gap-1 py-2 text-[11px] font-medium",
                    isActive ? "text-leaf-700" : "text-ink-soft",
                  )
                }
              >
                {isScan ? (
                  <span className="-mt-6 grid size-14 place-items-center rounded-full bg-leaf-600 text-white shadow-lg ring-4 ring-paper">
                    <Icon className="size-6" aria-hidden />
                  </span>
                ) : (
                  <Icon className="size-5" aria-hidden />
                )}
                {n.label === "Bin guide" ? "Guide" : n.label === "The model" ? "Model" : n.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
      <ScrollRestoration />
    </div>
  );
}
