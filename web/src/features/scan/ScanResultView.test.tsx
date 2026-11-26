import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { fakeApi, renderWithProviders, scanResult } from "../../test/utils";
import { ScanResultView } from "./ScanResultView";

const file = new File(["x"], "item.jpg", { type: "image/jpeg" });

function show(result = scanResult()) {
  return renderWithProviders(
    <ScanResultView result={result} file={file} photoUrl="blob:photo" zoom={false} onReset={() => {}} />,
  );
}

function labelBody(fetchMock: ReturnType<typeof fakeApi>) {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
  return call ? JSON.parse(String(call[1]!.body)) : undefined;
}

describe("a confident answer", () => {
  it("shows the bin, the confidence and how to prepare the item", () => {
    fakeApi();
    show();
    expect(screen.getByRole("heading", { name: "Orange bin" })).toBeInTheDocument();
    expect(screen.getByText(/It's plastic · 93% sure/)).toBeInTheDocument();
    expect(screen.getByText(/Squash bottles/)).toBeInTheDocument();
  });

  it("can be confirmed", async () => {
    const api = fakeApi({ "PUT /api/scans/6f1c1f0e-3c55-4a51-9e1a-0d2b7c1c9a11/label": () => scanResult({ user_label: "plastic" }) });
    show();
    await userEvent.click(screen.getByRole("button", { name: /Yes/ }));
    expect(await screen.findByText(/Your answer helps train the next model/)).toBeInTheDocument();
    expect(labelBody(api)).toEqual({ label: "plastic" });
  });

  it("can be corrected, and then shows the bin of the user's answer without the model's confidence", async () => {
    fakeApi({ "PUT /api/scans/6f1c1f0e-3c55-4a51-9e1a-0d2b7c1c9a11/label": () => scanResult({ user_label: "battery" }) });
    show();
    await userEvent.click(screen.getByRole("button", { name: /No, it's/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Battery" }));
    expect(await screen.findByRole("heading", { name: "E-waste collection" })).toBeInTheDocument();
    expect(screen.getByText(/You said battery/)).toBeInTheDocument();
    expect(screen.queryByText(/% sure/)).not.toBeInTheDocument();
  });
});

describe("an unsure answer", () => {
  const unsure = scanResult({
    unsure: true,
    confidence: 0.38,
    predicted_class: "trash",
    predicted_bin: "general waste",
    top3: [
      { class: "trash", prob: 0.38 },
      { class: "metal", prob: 0.33 },
      { class: "plastic", prob: 0.2 },
    ],
  });

  it("does not state a bin, and asks the user to pick", () => {
    fakeApi();
    show(unsure);
    expect(screen.getByRole("heading", { name: /Not sure/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "General waste" })).not.toBeInTheDocument();
    expect(screen.getByText(/only 38% sure/)).toBeInTheDocument();
  });

  it("shows the bin once the user picks one of the guesses", async () => {
    const api = fakeApi({
      "PUT /api/scans/6f1c1f0e-3c55-4a51-9e1a-0d2b7c1c9a11/label": () => ({ ...unsure, user_label: "metal" }),
    });
    show(unsure);
    await userEvent.click(screen.getByRole("button", { name: /Metal/ }));
    expect(await screen.findByRole("heading", { name: "Orange bin" })).toBeInTheDocument();
    expect(screen.getByText(/You said metal/)).toBeInTheDocument();
    expect(labelBody(api)).toEqual({ label: "metal" });
  });

  it("accepts 'something else' for items outside the 12 classes", async () => {
    fakeApi({
      "PUT /api/scans/6f1c1f0e-3c55-4a51-9e1a-0d2b7c1c9a11/label": () => ({ ...unsure, user_label: "other" }),
    });
    show(unsure);
    await userEvent.click(screen.getByRole("button", { name: "None of these" }));
    await userEvent.click(await screen.findByRole("button", { name: /Something else/ }));
    await waitFor(() => expect(screen.getByText(/noted as “something else”/)).toBeInTheDocument());
  });
});

it("shows API errors when saving a label fails", async () => {
  fakeApi({
    "PUT /api/scans/6f1c1f0e-3c55-4a51-9e1a-0d2b7c1c9a11/label": () => ({
      __status: 503,
      detail: { code: "ml_unavailable", message: "The classifier is starting up or unavailable." },
    }),
  });
  show();
  await userEvent.click(screen.getByRole("button", { name: /Yes/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("starting up");
});
