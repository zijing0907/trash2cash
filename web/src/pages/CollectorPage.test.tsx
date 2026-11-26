import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { fakeApi, renderWithProviders } from "../test/utils";
import type { CollectorJobs, Job, User } from "../lib/types";
import { CollectorPage } from "./CollectorPage";

const COLLECTOR: User = {
  id: 9, email: "col@example.com", display_name: "Col", role: "collector", created_at: "2026-11-01T00:00:00Z",
  member_code: "ABCD-EFGH", drop_point_id: null,
}; // prettier-ignore

const job = (over: Partial<Job> = {}): Job => ({
  id: 5,
  status: "open",
  point: { id: 1, name: "Library", address: "Ground floor", lat: 4.36, lng: 101.14, is_demo: false },
  created_at: "2026-11-26T08:00:00Z",
  taken_at: null,
  finished_at: null,
  collector: null,
  items: [
    { id: 11, container_id: 3, stream_key: "blue bin", stream_name: "Paper and cardboard", capacity_kg: 300,
      expected_kg: 120, state: "to_do", collected_kg: null, weighed_in_kg: null, pickup_id: null, has_photo: false,
      skipped_reason: null, finished_at: null }, // prettier-ignore
  ],
  ...over,
});

function show(jobs: CollectorJobs, routes: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({ "GET /api/auth/me": () => COLLECTOR, "GET /api/collector/jobs": () => jobs, ...routes });
  renderWithProviders(<CollectorPage />);
  return api;
}

it("lists open jobs, and taking one asks the API", async () => {
  const api = show(
    { open: [job()], mine: [], done: [] },
    { "POST /api/collector/jobs/5/take": () => job({ status: "taken" }) },
  );
  const row = (await screen.findByText("Library")).closest("tr")!;
  expect(within(row).getByText("120 kg")).toBeInTheDocument();
  await userEvent.click(within(row).getByRole("button", { name: "Take" }));
  await waitFor(() =>
    expect(api.mock.calls.some(([u, i]) => String(u).endsWith("/take") && i?.method === "POST")).toBe(true),
  );
  expect(screen.getByText(/You have no jobs/)).toBeInTheDocument();
});

it("shows why a job could not be taken", async () => {
  show(
    { open: [job()], mine: [], done: [] },
    { "POST /api/collector/jobs/5/take": () => ({ __status: 409, detail: { code: "job_not_open", message: "Another collector has taken this job, or it was withdrawn." } }) },
  ); // prettier-ignore
  await userEvent.click(await screen.findByRole("button", { name: "Take" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Another collector has taken this job");
});

it("needs the scale's weight and a photo before a bin counts as collected", async () => {
  const mine = job({ status: "taken", collector: { id: 9, name: "Col" } });
  const api = show(
    { open: [], mine: [mine], done: [] },
    { "POST /api/collector/jobs/5/items/11/collect": () => ({ ...mine, status: "done" }) },
  );
  const collected = await screen.findByRole("button", { name: "Collected" });
  await userEvent.click(collected);
  expect(screen.getByRole("alert")).toHaveTextContent("Enter the weight");
  await userEvent.type(screen.getByLabelText("Weight of the Paper and cardboard bin in kg"), "131,5");
  await userEvent.click(collected);
  expect(screen.getByRole("alert")).toHaveTextContent("Add a photo");

  const photo = new File(["\xff\xd8\xff"], "bin.jpg", { type: "image/jpeg" });
  await userEvent.upload(screen.getByLabelText("Photo of the emptied Paper and cardboard bin"), photo);
  expect(await screen.findByText("Photo added")).toBeInTheDocument();
  await userEvent.click(collected);
  await waitFor(() => expect(api.mock.calls.some(([u]) => String(u).endsWith("/items/11/collect"))).toBe(true));
  const body = api.mock.calls.find(([u]) => String(u).endsWith("/items/11/collect"))![1]!.body as FormData;
  expect(body.get("weight_kg")).toBe("131.5");
  expect((body.get("photo") as File).name).toBe("bin.jpg");
});

it("can skip a bin with a reason, and hand back a job not yet started", async () => {
  const mine = job({ status: "taken", collector: { id: 9, name: "Col" } });
  const api = show(
    { open: [], mine: [mine], done: [] },
    {
      "POST /api/collector/jobs/5/items/11/skip": () => mine,
      "POST /api/collector/jobs/5/release": () => job(),
    },
  );
  expect(await screen.findByRole("button", { name: "Hand this job back" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Can’t empty it" }));
  await userEvent.type(screen.getByLabelText("Why could it not be emptied?"), "Locked");
  await userEvent.click(screen.getByRole("button", { name: "Skip this bin" }));
  await waitFor(() => {
    const call = api.mock.calls.find(([u]) => String(u).endsWith("/items/11/skip"));
    expect(JSON.parse(String(call![1]!.body))).toEqual({ reason: "Locked" });
  });
});

it("is for collectors only", async () => {
  fakeApi({ "GET /api/auth/me": () => ({ ...COLLECTOR, role: "resident" }) });
  renderWithProviders(<CollectorPage />);
  expect(await screen.findByText(/Your account cannot use this screen/)).toBeInTheDocument();
});
