import { describe, expect, it, vi } from "vitest";

import { api, ApiError } from "./api";

describe("api error handling", () => {
  it("turns the API's {code, message} into an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ detail: { code: "unsupported_format", message: "GIF images are not supported." } }, { status: 415 }),
      ),
    );
    const err = await api.model().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 415, code: "unsupported_format", message: "GIF images are not supported." });
  });

  it("gives a readable message when the response is not JSON (e.g. a proxy error page)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 })));
    await expect(api.model()).rejects.toMatchObject({ status: 502, code: "http_error" });
  });

  it("reports network failures as code 'network'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api.me()).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("returns nothing for 204 responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it("sends scans as multipart form data with the options", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await api.scan(new File(["x"], "a.jpg", { type: "image/jpeg" }), { zoom: true, donate: false });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/scans");
    const body = init!.body as FormData;
    expect(body.get("zoom")).toBe("true");
    expect(body.get("donate")).toBe("false");
    expect((body.get("file") as File).name).toBe("a.jpg");
  });
});
