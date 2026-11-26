import { describe, expect, it } from "vitest";

import { boxToPercent, centreBox, isHeic, percent } from "./image";

describe("centreBox", () => {
  it("matches ml-service's center_box for landscape and portrait photos", () => {
    expect(centreBox(4032, 3024)).toEqual([504, 0, 3528, 3024]);
    expect(centreBox(3024, 4032)).toEqual([0, 504, 3024, 3528]);
    expect(centreBox(101, 100)).toEqual([0, 0, 100, 100]); // floor, like Python's //
  });
});

describe("boxToPercent", () => {
  it("turns a pixel box into CSS percentages", () => {
    expect(boxToPercent([50, 0, 150, 100], 200, 100)).toEqual({
      left: "25%",
      top: "0%",
      width: "50%",
      height: "100%",
    });
  });
});

describe("isHeic", () => {
  it("detects iPhone photos by type or name", () => {
    expect(isHeic(new File([], "IMG_1.HEIC"))).toBe(true);
    expect(isHeic(new File([], "x", { type: "image/heif" }))).toBe(true);
    expect(isHeic(new File([], "x.jpg", { type: "image/jpeg" }))).toBe(false);
  });
});

it("formats probabilities as whole percentages", () => {
  expect(percent(0.934)).toBe("93%");
});
