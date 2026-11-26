import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorNote } from "../components/ui";
import { FirstScanGuide } from "../features/scan/FirstScanGuide";
import { titleFor } from "../lib/page";
import type { User } from "../lib/types";
import { fakeApi, renderWithProviders } from "../test/utils";
import { HomePickupPage } from "./HomePickupPage";
import { OperatorPage } from "./OperatorPage";

const person = (role: User["role"], extra: Partial<User> = {}): User => ({
  id: 3, email: "x@example.com", display_name: "Op", role, created_at: "2026-11-01T00:00:00Z",
  member_code: "ABCD-EFGH", drop_point_id: null, ...extra,
}); // prettier-ignore

it("gives every page its own tab title", () => {
  expect(titleFor("/")).toBe("Trash2Cash: which bin does it go in?");
  expect(titleFor("/map")).toBe("Drop-off points | Trash2Cash");
  expect(titleFor("/admin/setup")).toBe("Setup | Trash2Cash");
  expect(titleFor("/admin")).toBe("Pickup board | Trash2Cash");
  expect(titleFor("/nowhere")).toBe("Page not found | Trash2Cash");
});

it("offers Try again when something failed to load", async () => {
  const retry = vi.fn();
  render(<ErrorNote onRetry={retry}>Could not load the map.</ErrorNote>);
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("shows the three steps on a first scan, until 'Got it'", async () => {
  localStorage.removeItem("t2c:seen:scan-guide");
  const { unmount } = render(<FirstScanGuide />);
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  await userEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(screen.queryByText("Photograph one item")).not.toBeInTheDocument();
  unmount();
  render(<FirstScanGuide />);
  expect(screen.queryByText("Photograph one item")).not.toBeInTheDocument(); // remembered
});

describe("the booking form", () => {
  it("says what is wrong next to each field, as the person goes, and puts the cursor on the first problem", async () => {
    fakeApi({
      "GET /api/auth/me": () => person("resident"),
      "GET /api/streams": () => [{ key: "blue bin", name: "Paper", points_per_kg: 10, price_sen_per_kg: 30 }],
      "GET /api/home-pickups/mine": () => [],
    });
    renderWithProviders(<HomePickupPage />);
    const kg = await screen.findByLabelText(/^About how much, in kg/);
    await userEvent.type(kg, "2");
    expect(kg).not.toHaveAttribute("aria-invalid"); // not while typing for the first time
    await userEvent.tab();
    expect(kg).toHaveAttribute("aria-invalid", "true");
    expect(kg).toHaveAccessibleDescription(/5 to 500 kg/);
    await userEvent.clear(kg);
    await userEvent.type(kg, "25");
    expect(kg).not.toHaveAttribute("aria-invalid"); // fixed, and it says so at once

    await userEvent.click(screen.getByRole("button", { name: "Book the pickup" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose which bins");
    expect(document.activeElement?.id).toBe("field-streams");
  });
});

describe("the weigh-in", () => {
  function counter() {
    const api = fakeApi({
      "GET /api/auth/me": () => person("operator", { drop_point_id: 1 }),
      "GET /api/points": () => [{ id: 1, name: "Point A", address: "", lat: 0, lng: 0, is_demo: false, streams: ["blue bin", "orange bin"] }],
      "GET /api/streams": () => [
        { key: "blue bin", name: "Paper", points_per_kg: 10, price_sen_per_kg: 30 },
        { key: "orange bin", name: "Cans", points_per_kg: 20, price_sen_per_kg: 80 },
      ],
      "GET /api/operator/residents/WXYZ-2345": () => ({ display_name: "Res", member_code: "WXYZ-2345", balance: 40 }),
      "GET /api/operator/deposits": () => [],
    }); // prettier-ignore
    renderWithProviders(<OperatorPage />);
    return api;
  }

  it("works from the keyboard: the code box is ready, Enter finds, then steps through the bins", async () => {
    counter();
    const code = await screen.findByPlaceholderText(/For example 7KQM-3XPA/);
    await waitFor(() => expect(code).toHaveFocus());
    await userEvent.keyboard("WXYZ-2345{Enter}");
    const paper = await screen.findByLabelText("Paper in kg");
    await waitFor(() => expect(paper).toHaveFocus());
    await userEvent.keyboard("2.5{Enter}");
    expect(screen.getByLabelText("Cans in kg")).toHaveFocus();
  });

  it("brings the cursor back to the code box with /", async () => {
    counter();
    const code = await screen.findByPlaceholderText(/For example 7KQM-3XPA/);
    code.blur();
    await userEvent.keyboard("/");
    expect(code).toHaveFocus();
  });
});
