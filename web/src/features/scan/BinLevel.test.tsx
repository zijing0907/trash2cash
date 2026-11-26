import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi as fakeApiWith, MODEL, renderWithProviders, scanResult } from "../../test/utils";
import { binLevelAnswer } from "../../lib/types";
import { ScanResultView } from "./ScanResultView";

const file = new File(["x"], "item.jpg", { type: "image/jpeg" });
// The model's own mapping, with the three glass colours (the shared test model only has five classes)
const GLASS_MODEL = {
  ...MODEL,
  class_names: [...MODEL.class_names, "brown-glass", "green-glass", "white-glass"],
  bins: { ...MODEL.bins, "brown-glass": "brown bin", "green-glass": "brown bin", "white-glass": "brown bin" },
};
const fakeApi = (routes: Parameters<typeof fakeApiWith>[0] = {}) =>
  fakeApiWith({ "GET /api/model": () => GLASS_MODEL, ...routes });
const LABEL_URL = "PUT /api/scans/6f1c1f0e-3c55-4a51-9e1a-0d2b7c1c9a11/label";

function show(result = scanResult()) {
  return renderWithProviders(
    <ScanResultView result={result} file={file} photoUrl="blob:photo" zoom={false} onReset={() => {}} />,
  );
}

/** Brown or green glass, the model cannot tell, but it is sure of the brown bin */
const glass = scanResult({
  unsure: true,
  confidence: 0.41,
  predicted_class: "brown-glass",
  predicted_bin: "brown bin",
  top3: [
    { class: "brown-glass", prob: 0.41 },
    { class: "green-glass", prob: 0.38 },
    { class: "plastic", prob: 0.09 },
  ],
  top_bin: "brown bin",
  bin_confidence: 0.86,
  bin_unsure: false,
});

describe("sure of the bin, not of the item", () => {
  it("names the bin and says what it cannot tell apart", () => {
    fakeApi();
    show(glass);
    expect(screen.getByRole("heading", { name: "Brown bin" })).toBeInTheDocument();
    expect(
      screen.getByText(/It’s glass, but we can’t tell which colour. We’re 86% sure of the bin/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Take off metal caps/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Not sure/ })).not.toBeInTheDocument();
  });

  it("asks which of the bin's items it was, and records the answer", async () => {
    const api = fakeApi({ [LABEL_URL]: () => ({ ...glass, user_label: "green-glass" }) });
    show(glass);
    expect(screen.getByRole("button", { name: "Clear glass" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Green glass" }));
    expect(await screen.findByText(/You said green glass/)).toBeInTheDocument();
    const put = api.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1]!.body))).toEqual({ label: "green-glass" });
  });

  it("still says 'not sure' when the bin is unclear too", () => {
    fakeApi();
    show({ ...glass, top_bin: "brown bin", bin_confidence: 0.45, bin_unsure: true });
    expect(screen.getByRole("heading", { name: /Not sure/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Brown bin" })).not.toBeInTheDocument();
  });

  it("treats scans from before bin-level answers as before", () => {
    expect(binLevelAnswer({ ...glass, top_bin: undefined, bin_unsure: undefined })).toBeNull();
    expect(binLevelAnswer({ ...glass, bin_unsure: null })).toBeNull();
    expect(binLevelAnswer({ ...glass, user_label: "green-glass" })).toBeNull(); // the user's answer wins
    expect(binLevelAnswer(glass)).toBe("brown bin");
  });
});

describe("the battery warning", () => {
  const maybeBattery = scanResult({
    predicted_class: "metal",
    predicted_bin: "orange bin",
    confidence: 0.72,
    battery_chance: 0.14,
    battery_warning: true,
  });

  it("shows with the chance, above the answer", () => {
    fakeApi();
    show(maybeBattery);
    const warning = screen.getByRole("note");
    expect(warning).toHaveTextContent("This could be a battery");
    expect(warning).toHaveTextContent("14% chance");
    expect(warning.compareDocumentPosition(screen.getByRole("heading", { name: "Orange bin" }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("goes away once the user says what the item is", async () => {
    fakeApi({ [LABEL_URL]: () => ({ ...maybeBattery, user_label: "metal" }) });
    show(maybeBattery);
    await userEvent.click(screen.getByRole("button", { name: /Yes/ }));
    await screen.findByText(/Your answer helps train the next model/);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("is not shown without a sign of a battery", () => {
    fakeApi();
    show();
    expect(screen.queryByText("This could be a battery")).not.toBeInTheDocument();
  });
});
