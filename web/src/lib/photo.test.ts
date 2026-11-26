import { describe, expect, it } from "vitest";

import { fitWithin, MAX_SIDE, shrinkPhoto } from "./photo";

describe("fitWithin", () => {
  it("shrinks a phone photo to the long side and keeps its shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_SIDE, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: MAX_SIDE });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("keeps at least one pixel on a very thin picture", () => {
    expect(fitWithin(20000, 2, 1000)).toEqual({ width: 1000, height: 1 });
  });
});

it("sends the photo as it is where the browser cannot decode it", async () => {
  // jsdom has no createImageBitmap, like a browser meeting a format it cannot read (HEIC outside Safari)
  const file = new File(["x"], "item.heic", { type: "image/heic" });
  expect(await shrinkPhoto(file)).toBe(file);
});
