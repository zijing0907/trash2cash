/**
 * Motion helpers (Phase 8a). Motion here explains a change: where something came from, what changed, or that an
 * action worked. It only moves transform and opacity, and it is off when the person asks for reduced motion
 * (and wherever the browser cannot say, such as tests), so nothing depends on it.
 */
import { flushSync } from "react-dom";

export function motionAllowed(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type WithTransitions = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

/** Applies a state change inside a view transition, so elements with the same view-transition-name glide from
 * their old place to their new one. Without support (or with reduced motion) the change simply happens. */
export function withViewTransition(update: () => void): void {
  const doc = document as WithTransitions;
  if (!doc.startViewTransition || !motionAllowed()) {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Remembered numbers, per browser, so a returning person sees what changed since their last visit. */
export function remembered(key: string): number | null {
  try {
    const v = localStorage.getItem(`t2c:${key}`);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export function remember(key: string, value: number): void {
  try {
    localStorage.setItem(`t2c:${key}`, String(value));
  } catch {
    // private browsing or storage full: nothing to remember, nothing breaks
  }
}
