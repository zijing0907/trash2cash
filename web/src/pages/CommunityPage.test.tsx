import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import type { Community, Confusion } from "../lib/types";
import { fakeApi, renderWithProviders } from "../test/utils";
import { CommunityPage } from "./CommunityPage";

const plain = (s: string | null | undefined) => s?.replace(/\u00a0/g, " ");

const COMMUNITY: Community = {
  today: "2026-11-26",
  is_demo: true,
  month: { from: "2026-11-01", kg_total: 412.5, deposits: 180, residents: 38, home_kg: 35.5, home_kg_last_month: 0 },
  // Eight Mondays from 5 Oct 2026
  weeks: Array.from({ length: 8 }, (_, i) => ({
    from: new Date(Date.UTC(2026, 9, 5 + 7 * i)).toISOString().slice(0, 10),
    kg: i === 3 ? 120 : 40 + i,
    partial: i === 7,
  })),
  places: [
    { id: 1, name: "Point A", kg_month: 250, kg_last_month: 230 },
    { id: 2, name: "Point B", kg_month: 127, kg_last_month: 140 },
  ],
  streams: [{ stream_key: "blue bin", stream_name: "Paper and cardboard", kg_month: 300 }],
};

const CONFUSION: Confusion = {
  point_id: null, days: 90, min_people: 3, people: 30, scans: 220, is_demo: true,
  asked: [{ item: "plastic", people: 14, scans: 20 }],
  disagreements: [{ model_said: "cardboard", people_said: "trash", people: 5, scans: 6 }],
  hidden: 2, unknown: { people: 4, scans: 4 },
}; // prettier-ignore

function show(confusion: (init?: RequestInit) => unknown = () => CONFUSION) {
  const api = fakeApi({
    "GET /api/community": () => COMMUNITY,
    "GET /api/community/confusion": confusion,
    "GET /api/points": () => [
      { id: 1, name: "Point A", address: "", lat: 0, lng: 0, is_demo: true, streams: [] },
      { id: 2, name: "Point B", address: "", lat: 0, lng: 0, is_demo: true, streams: [] },
    ],
  });
  renderWithProviders(<CommunityPage />);
  return api;
}

it("shows this month's totals, the weeks and the places, marked as demo data", async () => {
  show();
  expect(plain((await screen.findByText(/412\.5/)).textContent)).toBe("412.5 kg");
  expect(screen.getAllByText(/Demo data/).length).toBeGreaterThan(0);
  const weeks = screen.getByRole("list", { name: /Kilograms weighed in each week/ });
  const bars = within(weeks).getAllByRole("listitem");
  expect(bars).toHaveLength(8);
  expect(plain(bars[7]!.getAttribute("aria-label"))).toMatch(/so far: 47 kg$/);
  expect(plain(bars[3]!.querySelector(".week__value")?.textContent)).toBe("120 kg"); // the high point carries its number
  expect(bars[1]!.querySelector(".week__value")).toBeNull(); // the others show theirs on hover or focus
  const rows = screen
    .getByRole("heading", { name: "By drop-off point" })
    .closest("section")!
    .querySelectorAll("tbody tr");
  expect([...rows].map((r) => r.querySelector(".table__main")?.textContent)).toEqual([
    "Point A",
    "Point B",
    "Home pickups",
  ]);
});

it("shows what people find confusing, with counts of people and what is left out", async () => {
  show();
  expect(await screen.findByText(/The model said cardboard; people said general trash/)).toBeInTheDocument();
  expect(screen.getByText(/A different bin: blue bin instead of general waste/)).toBeInTheDocument();
  expect(screen.getByText(/4 people scanned something that is none of the 12 kinds/)).toBeInTheDocument();
  expect(screen.getByText(/2 more items have fewer than 3 people/)).toBeInTheDocument();
});

it("narrows the confusion figures to one place", async () => {
  const api = show();
  await screen.findByText(/The model said cardboard/);
  await userEvent.selectOptions(screen.getByLabelText("Residents who usually hand in at"), "2");
  await waitFor(() =>
    expect(api.mock.calls.some(([u]) => String(u) === "/api/community/confusion?point_id=2")).toBe(true),
  );
});

it("says when there are not enough scans to show anything", async () => {
  show(() => ({ ...CONFUSION, asked: [], disagreements: [], unknown: null, hidden: 0 }));
  expect(await screen.findByText(/Not enough scans here yet/)).toBeInTheDocument();
});
