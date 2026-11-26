/** Browser-tab titles and what the shell does when the page changes (Phase 8b). */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Trash2Cash: which bin does it go in?"],
  [/^\/scan/, "Scan an item"],
  [/^\/map/, "Drop-off points"],
  [/^\/guide/, "Bin guide"],
  [/^\/community/, "Recycled together"],
  [/^\/model/, "How the model works"],
  [/^\/rewards/, "Rewards"],
  [/^\/pickup/, "Book a home pickup"],
  [/^\/me/, "My account"],
  [/^\/operator/, "Weigh-in"],
  [/^\/collect/, "Pickup jobs"],
  [/^\/admin\/setup/, "Setup"],
  [/^\/admin/, "Pickup board"],
  [/^\/login/, "Log in"],
  [/^\/signup/, "Sign up"],
];

export function titleFor(path: string): string {
  const found = TITLES.find(([re]) => re.test(path));
  if (!found) return "Page not found | Trash2Cash";
  return path === "/" ? found[1] : `${found[1]} | Trash2Cash`;
}

/** Each page gets its own tab title, and after a page change keyboard and screen-reader focus moves to the new
 * page's heading, as it would on a page load. The first load leaves focus where the browser put it. */
export function usePageChange(): void {
  const { pathname } = useLocation();
  const last = useRef<string | null>(null);
  useEffect(() => {
    document.title = titleFor(pathname);
    // The first load leaves focus where the browser put it; so does running this twice for the same page
    // (React does that in development)
    if (last.current === null || last.current === pathname) {
      last.current = pathname;
      return;
    }
    last.current = pathname;
    // After the new page has rendered (and, with motion, after the view transition swaps it in)
    const id = window.setTimeout(() => {
      const main = document.getElementById("main");
      const active = document.activeElement;
      // A page that put the cursor in a field on purpose (the weigh-in's member code) keeps it there
      if (
        main &&
        active &&
        active !== document.body &&
        main.contains(active) &&
        active.matches("input, select, textarea")
      )
        return;
      const h1 = main?.querySelector<HTMLElement>("h1");
      if (!h1) return;
      if (!h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
      h1.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(id);
  }, [pathname]);
}

/** Whether the browser thinks it is online. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
