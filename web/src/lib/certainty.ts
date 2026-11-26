/**
 * How the app knows how full a bin is. There are no sensors: the fill is the sum of drop-offs weighed by staff
 * since the bin was last emptied. Each bin on the map says which fact that rests on and how old it is, and the
 * forecast is always labelled as an estimate (docs/decisions.md 7.2).
 */
import type { MapBin } from "./types";

/** After this long without a weighing or a pickup, the fill may have drifted (unweighed items, a missed pickup) */
export const STALE_DAYS = 7;

export function ago(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export interface Known {
  /** The fact the fill rests on, with its age */
  basis: string;
  /** True when that fact is old enough that the fill may be wrong */
  stale: boolean;
}

export function howKnown(bin: MapBin, now: Date): Known {
  const weighed = bin.last_deposit_at;
  const emptied = bin.emptied_at;
  // The newer of the two facts is what the fill rests on
  const latest = [weighed, emptied]
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);
  if (!latest) return { basis: "No weighings or pickups recorded yet", stale: true };
  const stale = now.getTime() - new Date(latest).getTime() > STALE_DAYS * 86_400_000;
  if (emptied && latest === emptied) return { basis: `Emptied ${ago(emptied, now)}, nothing weighed in since`, stale };
  return { basis: `Weighed ${ago(weighed!, now)}`, stale };
}
