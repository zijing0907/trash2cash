import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fillLine, reportLine } from "../lib/certainty";
import type { DropOffMap, MapBin, User } from "../lib/types";
import { fakeApi, renderWithProviders } from "../test/utils";
import { MapPage } from "./MapPage";

const NOW = new Date("2026-11-26T12:00:00Z");
const RESIDENT: User = {
  id: 3, email: "res@example.com", display_name: "Res", role: "resident", created_at: "2026-11-01T00:00:00Z",
  member_code: "ABCD-EFGH", drop_point_id: null,
}; // prettier-ignore
const recent = new Date(Date.now() - 20 * 60_000).toISOString();
const paper: MapBin = {
  stream_key: "blue bin", stream_name: "Paper and cardboard", capacity_kg: 100, fill_kg: 40, est_fill_kg: 50,
  fill_ratio: 0.5, correction: { factor: 1.25, pickups: 2, measured_kg: 125, weighed_kg: 100 },
  rate_kg_per_day: 4, full_on: "2026-12-08", status: "later", due_because: null,
  reports: { count: 1, last_at: recent, overflowing: false, confirmed: false, mine: false },
  last_deposit_at: recent, emptied_at: null,
}; // prettier-ignore
const map = (bin: MapBin): DropOffMap => ({
  generated_at: recent,
  points: [{ id: 7, name: "Library", address: "Ground floor", lat: 4.36, lng: 101.14, is_demo: false, status: bin.status, bins: [bin] }],
}); // prettier-ignore

// Weights use a no-break space between number and unit
const plain = (s: string | null) => s?.replace(/\u00a0/g, " ");

describe("the words for corrections and reports", () => {
  it("says the fill is scaled, and why", () => {
    expect(plain(fillLine(40, 100, 40, null))).toBe("40 kg of 100 kg");
    expect(plain(fillLine(40, 100, 50, paper.correction))).toBe(
      "About 50 kg of 100 kg: 40 kg weighed in, and at the last 2 pickups the scale showed 1.25 times what was weighed in",
    );
  });

  it("counts people, not reports, and says when the bin is marked for pickup", () => {
    const at = "2026-11-26T11:40:00Z";
    expect(reportLine(null, NOW)).toBeNull();
    expect(reportLine({ count: 1, last_at: at, overflowing: false, confirmed: false, mine: false }, NOW)).toBe(
      "Reported full by 1 person, last 20 minutes ago",
    );
    expect(reportLine({ count: 3, last_at: at, overflowing: true, confirmed: true, mine: false }, NOW)).toBe(
      "Reported full or overflowing by 3 people, last 20 minutes ago: marked for pickup",
    );
  });
});

it("shows the corrected fill and the reports on the map", async () => {
  fakeApi({ "GET /api/map": () => map(paper) });
  renderWithProviders(<MapPage />);
  const place = (await screen.findByRole("button", { name: "Library" })).closest("li")!;
  expect(within(place).getByText(/About 50 kg of 100 kg: 40 kg weighed in/)).toBeInTheDocument();
  expect(within(place).getByText(/Reported full by 1 person/)).toBeInTheDocument();
});

it("asks guests to log in before reporting", async () => {
  fakeApi({ "GET /api/map": () => map(paper) });
  renderWithProviders(<MapPage />);
  expect(await screen.findByRole("link", { name: "Log in to report it full" })).toHaveAttribute(
    "href",
    "/login?next=/map",
  );
});

it("lets a signed-in person report a bin overflowing, once", async () => {
  let reported = false;
  const api = fakeApi({
    "GET /api/auth/me": () => RESIDENT,
    "GET /api/map": () => map({ ...paper, reports: { ...paper.reports!, count: reported ? 2 : 1, mine: reported } }),
    "POST /api/reports": () => {
      reported = true;
      return { id: 1 };
    },
  });
  renderWithProviders(<MapPage />);
  await userEvent.click(await screen.findByRole("button", { name: /Report it full/ }));
  await userEvent.click(screen.getByRole("radio", { name: "Overflowing" }));
  await userEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(await screen.findByText(/You reported this bin/)).toBeInTheDocument();
  const sent = api.mock.calls.find(([u, i]) => String(u) === "/api/reports" && i?.method === "POST")![1]!
    .body as FormData;
  expect([sent.get("point_id"), sent.get("stream_key"), sent.get("level"), sent.get("photo")]).toEqual([
    "7",
    "blue bin",
    "overflowing",
    null,
  ]);
  await waitFor(() => expect(screen.getByText(/Reported full by 2 people/)).toBeInTheDocument());
});

it("explains a report that came too soon", async () => {
  fakeApi({
    "GET /api/auth/me": () => RESIDENT,
    "GET /api/map": () => map(paper),
    "POST /api/reports": () => ({
      __status: 409,
      detail: { code: "already_reported", message: "You reported this bin recently. Thank you, once is enough." },
    }),
  });
  renderWithProviders(<MapPage />);
  await userEvent.click(await screen.findByRole("button", { name: /Report it full/ }));
  await userEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("once is enough");
});
