import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { PhotoPicker } from "./PhotoPicker";

function drop(file: File) {
  const zone = screen.getByText("Show us the item").closest("div[class*='border-dashed']")!;
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
}

it("accepts a dropped photo", () => {
  const onPick = vi.fn();
  render(<PhotoPicker onPick={onPick} />);
  drop(new File(["x"], "can.jpg", { type: "image/jpeg" }));
  expect(onPick).toHaveBeenCalledOnce();
});

it("rejects files over the size limit before uploading", () => {
  const onPick = vi.fn();
  render(<PhotoPicker onPick={onPick} />);
  const big = new File(["x"], "huge.jpg", { type: "image/jpeg" });
  Object.defineProperty(big, "size", { value: 9 * 1024 * 1024 });
  drop(big);
  expect(onPick).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("larger than 8 MB");
});

it("rejects files that are not images", () => {
  const onPick = vi.fn();
  render(<PhotoPicker onPick={onPick} />);
  drop(new File(["%PDF"], "doc.pdf", { type: "application/pdf" }));
  expect(onPick).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("not a photo");
});
