import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { HomePickup, User } from "../lib/types";
import { fakeApi, renderWithProviders } from "../test/utils";
import { CollectorHome } from "./CollectorHome";
import { HomePickupPage } from "./HomePickupPage";

const RESIDENT: User = {
  id: 3, email: "res@example.com", display_name: "Res", role: "resident", created_at: "2026-11-01T00:00:00Z",
  member_code: "ABCD-EFGH", drop_point_id: null,
}; // prettier-ignore
const STREAMS = [
  { key: "blue bin", name: "Paper and cardboard", points_per_kg: 10, price_sen_per_kg: 30 },
  { key: "orange bin", name: "Plastic and metal cans", points_per_kg: 20, price_sen_per_kg: 80 },
];
const pickup = (over: Partial<HomePickup> = {}): HomePickup => ({
  id: 4, status: "requested", streams: ["blue bin"], rough_kg: 25, day: "2026-11-28", slot: "morning",
  created_at: "2026-11-26T08:00:00Z", taken_at: null, finished_at: null, collector: null, missed_reason: null,
  weighed: [], points: null, area: [4.31, 101.16], ...over,
}); // prettier-ignore

describe("booking a home pickup", () => {
  it("asks guests to log in", async () => {
    fakeApi();
    renderWithProviders(<HomePickupPage />);
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=/pickup");
  });

  it("checks the booking before sending it", async () => {
    fakeApi({
      "GET /api/auth/me": () => RESIDENT,
      "GET /api/streams": () => STREAMS,
      "GET /api/home-pickups/mine": () => [],
    });
    renderWithProviders(<HomePickupPage />);
    const book = await screen.findByRole("button", { name: "Book the pickup" });
    await userEvent.click(book);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose which bins");
    await userEvent.click(await screen.findByRole("checkbox", { name: /Blue bin/ }));
    await userEvent.type(screen.getByLabelText(/^About how much, in kg/), "2");
    await userEvent.click(book);
    expect(screen.getByRole("alert")).toHaveTextContent("5 to 500 kg");
    await userEvent.clear(screen.getByLabelText(/^About how much, in kg/));
    await userEvent.type(screen.getByLabelText(/^About how much, in kg/), "25");
    await userEvent.type(screen.getByLabelText(/^Address/), "No. 12, Jalan Mawar 3");
    await userEvent.click(book);
    expect(screen.getByRole("alert")).toHaveTextContent("Put the pin on your home");
  });

  it("lists the resident's pickups with what was weighed, and can cancel a waiting one", async () => {
    const api = fakeApi({
      "GET /api/auth/me": () => RESIDENT,
      "GET /api/streams": () => STREAMS,
      "GET /api/home-pickups/mine": () => [
        pickup(),
        pickup({ id: 5, status: "done", collector: { id: 9, name: "Col" }, weighed: [{ stream_key: "blue bin", weight_g: 31500 }], points: 315 }),
      ],
      "POST /api/home-pickups/4/cancel": () => pickup({ status: "cancelled" }),
    }); // prettier-ignore
    renderWithProviders(<HomePickupPage />);
    const done = (await screen.findByText("Collected")).closest("tr")!;
    expect(within(done).getByText(/31\.5.kg weighed at the door, 315.points/)).toBeInTheDocument();
    const waiting = screen.getByText("Waiting for a collector").closest("tr")!;
    await userEvent.click(within(waiting).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(api.mock.calls.some(([u]) => String(u) === "/api/home-pickups/4/cancel")).toBe(true));
  });
});

describe("home pickups for collectors", () => {
  const taken = pickup({
    id: 6, status: "taken", streams: ["blue bin", "orange bin"], address: "No. 12, Jalan Mawar 3", lat: 4.31234,
    lng: 101.15678, note: "Boxes by the gate", resident: { name: "Res" }, has_photo: true,
    collector: { id: 9, name: "Col" },
  }); // prettier-ignore

  it("shows waiting pickups by area only, and the taken one in full", async () => {
    fakeApi({ "GET /api/collector/home-pickups": () => ({ open: [pickup()], mine: [taken], done: [] }) });
    renderWithProviders(<CollectorHome me={null} />);
    const row = (await screen.findByText("About 25 kg", { selector: ".muted" })).closest("tr")!;
    expect(within(row).getByText("Near 4.31, 101.16")).toBeInTheDocument();
    expect(screen.getByText(/No\. 12, Jalan Mawar 3/)).toBeInTheDocument();
    expect(screen.getByText("Note: Boxes by the gate")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Their photo" })).toHaveAttribute("href", "/api/home-pickups/6/photo");
  });

  it("sends the weights from the door for each bin that had something", async () => {
    const api = fakeApi({
      "GET /api/collector/home-pickups": () => ({ open: [], mine: [taken], done: [] }),
      "POST /api/collector/home-pickups/6/collect": () => ({ ...taken, status: "done" }),
    });
    renderWithProviders(<CollectorHome me={null} />);
    const collected = await screen.findByRole("button", { name: "Weighed and collected" });
    await userEvent.click(collected);
    expect(screen.getByRole("alert")).toHaveTextContent("at least one bin");
    await userEvent.type(screen.getByLabelText("Blue bin on the scale (kg)"), "31,5");
    await userEvent.click(collected);
    await waitFor(() => {
      const call = api.mock.calls.find(([u]) => String(u) === "/api/collector/home-pickups/6/collect");
      expect(JSON.parse(String(call![1]!.body))).toEqual([{ stream_key: "blue bin", weight_kg: 31.5 }]);
    });
  });

  it("is left out when the server has no home pickups", async () => {
    fakeApi();
    renderWithProviders(<CollectorHome me={null} />);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Home pickups" })).not.toBeInTheDocument());
  });
});
