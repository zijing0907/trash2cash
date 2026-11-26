import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

import type { ModelInfo, ScanResult } from "../lib/types";

export const MODEL: ModelInfo = {
  key: "cnn_robust",
  run: "CNN-R",
  version: "CNN-R@1a2b3c4d",
  class_names: ["battery", "metal", "paper", "plastic", "trash"],
  img_size: 128,
  bins: { battery: "e-waste collection", metal: "orange bin", paper: "blue bin", plastic: "orange bin", trash: "general waste" },
  threshold: 0.5,
  use_tta: false,
  gradcam_layer: "block4b_relu",
  metrics: { test_macro_f1: 0.9 },
  available_models: ["cnn_robust"],
  dataset: "test",
  quick_run: false,
  preprocessing: null,
};

export function scanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    id: "6f1c1f0e-3c55-4a51-9e1a-0d2b7c1c9a11",
    created_at: "2026-11-23T10:00:00Z",
    model_version: MODEL.version,
    predicted_class: "plastic",
    predicted_bin: "orange bin",
    confidence: 0.93,
    unsure: false,
    zoomed: false,
    top3: [
      { class: "plastic", prob: 0.93 },
      { class: "metal", prob: 0.04 },
      { class: "trash", prob: 0.02 },
    ],
    latency_ms: 120,
    user_label: null,
    photo_donated: false,
    class_index: 3,
    threshold: 0.5,
    crop_box: [0, 0, 100, 100],
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Replaces fetch with a tiny fake API. `routes` maps "METHOD /path" to a handler returning the JSON body.
 * Unknown routes answer 404. Returns the mock so tests can inspect calls.
 */
export function fakeApi(routes: Record<string, (init?: RequestInit) => unknown> = {}) {
  const all: Record<string, (init?: RequestInit) => unknown> = {
    "GET /api/auth/me": () => null,
    "GET /api/model": () => MODEL,
    ...routes,
  };
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const handler = all[`${init?.method ?? "GET"} ${url.pathname}`];
    if (!handler) return json({ detail: { code: "not_found", message: "Not found" } }, 404);
    const body = handler(init) as { __status?: number } | undefined;
    if (body && typeof body === "object" && "__status" in body) {
      const { __status, ...rest } = body;
      return json(rest, __status);
    }
    return json(body);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

export function renderWithProviders(ui: ReactNode, { route = "/" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
