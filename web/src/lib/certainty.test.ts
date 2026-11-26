import { describe, expect, it } from "vitest";

import { ago, howKnown } from "./certainty";
import { distanceKm, nearestFirst } from "./geo";
import type { MapBin } from "./types";

const NOW = new Date("2026-11-26T12:00:00Z");
const bin = (over: Partial<MapBin>): MapBin => ({
  stream_key: "blue bin", stream_name: "Paper", capacity_kg: 300, fill_kg: 120, fill_ratio: 0.4,
  rate_kg_per_day: 10, full_on: "2026-12-14", status: "later", last_deposit_at: null, emptied_at: null, ...over,
}); // prettier-ignore

describe("how the app knows a bin's fill", () => {
  it("rests on the last weighing when that is the newest fact", () => {
    const k = howKnown(bin({ last_deposit_at: "2026-11-26T10:00:00Z", emptied_at: "2026-11-20T09:00:00Z" }), NOW);
    expect(k).toEqual({ basis: "Weighed 2 hours ago", stale: false });
  });

  it("says when a bin was emptied and nothing has been weighed in since", () => {
    const k = howKnown(bin({ last_deposit_at: "2026-11-25T10:00:00Z", emptied_at: "2026-11-26T11:30:00Z" }), NOW);
    expect(k.basis).toBe("Emptied 30 minutes ago, nothing weighed in since");
  });

  it("warns when the newest fact is more than a week old", () => {
    expect(howKnown(bin({ last_deposit_at: "2026-11-10T10:00:00Z" }), NOW)).toEqual({
      basis: "Weighed 16 days ago",
      stale: true,
    });
  });

  it("admits when there is nothing to go on", () => {
    expect(howKnown(bin({}), NOW)).toEqual({ basis: "No weighings or pickups recorded yet", stale: true });
  });

  it("says ages in plain words", () => {
    expect(ago("2026-11-26T11:59:30Z", NOW)).toBe("just now");
    expect(ago("2026-11-26T11:00:00Z", NOW)).toBe("an hour ago");
    expect(ago("2026-11-25T11:00:00Z", NOW)).toBe("yesterday");
  });
});

describe("distances and visiting order", () => {
  it("measures straight-line distance in km", () => {
    // About 1.1 km per 0.01 degree of latitude
    expect(distanceKm([4.33, 101.14], [4.34, 101.14])).toBeCloseTo(1.11, 2);
    expect(distanceKm([4.33, 101.14], [4.33, 101.14])).toBe(0);
  });

  it("always visits the nearest place next", () => {
    const places = [
      { id: "far", at: [4.4, 101.14] as [number, number] },
      { id: "near", at: [4.331, 101.14] as [number, number] },
      { id: "middle", at: [4.36, 101.14] as [number, number] },
    ];
    expect(nearestFirst(places, [4.33, 101.14]).map((p) => p.id)).toEqual(["near", "middle", "far"]);
    expect(nearestFirst(places).map((p) => p.id)).toEqual(["far", "middle", "near"]); // from the first place
    expect(nearestFirst([], [4.33, 101.14])).toEqual([]);
  });
});
