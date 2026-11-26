import { expect, it } from "vitest";

import { parseCoords } from "./geo";

it("reads coordinates as map apps copy them", () => {
  expect(parseCoords("4.3375, 101.1436")).toEqual([4.3375, 101.1436]);
  expect(parseCoords(" 4.3375 101.1436 ")).toEqual([4.3375, 101.1436]);
  expect(parseCoords("-33.86,151.2")).toEqual([-33.86, 151.2]);
});

it("refuses text that is not a position", () => {
  expect(parseCoords("Kampar")).toBeNull();
  expect(parseCoords("4.3375")).toBeNull();
  expect(parseCoords("95, 101")).toBeNull(); // latitude past the pole
  expect(parseCoords("4.3, 190")).toBeNull();
});
