import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { fakeApi, renderWithProviders, scanResult } from "../../test/utils";
import { ScanPage } from "./ScanPage";

beforeEach(() => {
  // jsdom has no object URLs
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
});

function pickPhoto() {
  fireEvent.change(screen.getByLabelText("Upload a photo"), {
    target: { files: [new File(["x"], "can.jpg", { type: "image/jpeg" })] },
  });
}

it("asks for photo-donation consent again for every photo", async () => {
  const api = fakeApi({ "POST /api/scans": () => scanResult({ photo_donated: true }) });
  renderWithProviders(<ScanPage />);

  pickPhoto();
  const donate = () => screen.getByRole("switch", { name: /Donate this photo/ });
  await userEvent.click(donate());
  expect(donate()).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: /Sort it/ }));
  const sent = api.mock.calls.find(([url]) => String(url) === "/api/scans")![1]!.body as FormData;
  expect(sent.get("donate")).toBe("true");

  await userEvent.click(await screen.findByRole("button", { name: /Scan another item/ }));
  pickPhoto();
  expect(donate()).not.toBeChecked();
});
