import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { fakeApi, renderWithProviders } from "../test/utils";
import type { DropOffMap, MapBin } from "../lib/types";
import { MapPage } from "./MapPage";

const recent = new Date(Date.now() - 2 * 3_600_000).toISOString();
const paper: MapBin = {
  stream_key: "blue bin", stream_name: "Paper and cardboard", capacity_kg: 300, fill_kg: 120, fill_ratio: 0.4,
  rate_kg_per_day: 10, full_on: "2026-12-14", status: "later", last_deposit_at: recent, emptied_at: null,
}; // prettier-ignore
const MAP: DropOffMap = {
  generated_at: new Date().toISOString(),
  points: [
    { id: 1, name: "Library", address: "Ground floor", lat: 4.36, lng: 101.14, is_demo: true, status: "later", bins: [paper] },
    { id: 2, name: "Hostel", address: "Lobby", lat: 4.331, lng: 101.14, is_demo: true, status: "due",
      bins: [{ ...paper, fill_kg: 290, fill_ratio: 0.97, status: "due" }] },
  ],
}; // prettier-ignore

afterEach(() => {
  Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
});

it("lists every point with each bin's fill, how it is known, and an estimate", async () => {
  fakeApi({ "GET /api/map": () => MAP });
  renderWithProviders(<MapPage />);
  const library = (await screen.findByRole("button", { name: "Library" })).closest("li")!;
  expect(within(library).getByText(/120 kg of 300 kg\. Weighed 2 hours ago\./)).toBeInTheDocument();
  expect(within(library).getByText(/estimate from the last two weeks/)).toBeInTheDocument();
  const hostel = screen.getByRole("button", { name: "Hostel" }).closest("li")!;
  expect(within(hostel).getByText("Nearly full: a pickup is due")).toBeInTheDocument();
  expect(screen.getByText(/Demo data/)).toBeInTheDocument();
  expect(screen.getByText(/There are no sensors in the bins/)).toBeInTheDocument();
});

it("puts the nearest point first once the person shares where they are", async () => {
  fakeApi({ "GET /api/map": () => MAP });
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  const getCurrentPosition = vi.fn((ok: PositionCallback) =>
    ok({ coords: { latitude: 4.36, longitude: 101.14 } } as GeolocationPosition),
  );
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
  renderWithProviders(<MapPage />);
  await screen.findByRole("button", { name: "Library" });
  const names = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(names()).toEqual(["Hostel", "Library"]); // alphabetical at first
  await userEvent.click(screen.getByRole("button", { name: /Nearest to me/ }));
  expect(names()).toEqual(["Library", "Hostel"]); // the person stands at the library
  expect(screen.getByText(/3\.2 km away in a straight line/)).toBeInTheDocument();
});

it("explains when location is not available", async () => {
  fakeApi({ "GET /api/map": () => MAP });
  renderWithProviders(<MapPage />);
  await screen.findByRole("button", { name: "Library" });
  await userEvent.click(screen.getByRole("button", { name: /Nearest to me/ }));
  expect(screen.getByRole("alert")).toHaveTextContent("needs a secure (https) link");
});

it("says so when no point is open yet", async () => {
  fakeApi({ "GET /api/map": () => ({ generated_at: "", points: [] }) });
  renderWithProviders(<MapPage />);
  expect(await screen.findByText(/No drop-off points are open yet/)).toBeInTheDocument();
});
