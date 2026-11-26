import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { cameraProblem } from "../../lib/camera";
import { PhotoPicker } from "./PhotoPicker";

const original = { secure: window.isSecureContext, media: navigator.mediaDevices };

function giveCamera(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
}

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
});

afterEach(() => {
  Object.defineProperty(window, "isSecureContext", { value: original.secure, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", { value: original.media, configurable: true });
});

it("uses the phone's camera app where the page cannot open the camera itself", () => {
  render(<PhotoPicker onPick={() => {}} />);
  expect(screen.queryByRole("button", { name: /Open the camera/ })).not.toBeInTheDocument();
  expect(screen.getByText("Take a photo")).toBeInTheDocument();
});

it("opens the camera inside the page when it can", () => {
  giveCamera(() => new Promise(() => {})); // never answers: the camera is still starting
  render(<PhotoPicker onPick={() => {}} />);
  expect(screen.getByRole("button", { name: /Open the camera/ })).toBeInTheDocument();
  expect(screen.queryByText("Take a photo")).not.toBeInTheDocument();
});

it("shows the camera with a starting message, and closes it again", async () => {
  giveCamera(() => new Promise(() => {}));
  render(<PhotoPicker onPick={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Open the camera/ }));
  expect(screen.getByLabelText("Camera preview")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Starting the camera");
  expect(screen.getByRole("button", { name: /Take the photo/ })).toBeDisabled(); // no frame yet
  await userEvent.click(screen.getByRole("button", { name: "Close the camera" }));
  expect(screen.getByText("Show us the item")).toBeInTheDocument();
});

it("falls back to the camera app and says why when access is blocked", async () => {
  const blocked = vi.fn(() => Promise.reject(new DOMException("Permission denied", "NotAllowedError")));
  giveCamera(blocked);
  render(<PhotoPicker onPick={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Open the camera/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("blocked for this site");
  expect(screen.getByText("Take a photo")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Open the camera/ })).not.toBeInTheDocument();
});

it("explains each camera problem in plain words", () => {
  expect(cameraProblem(new DOMException("", "NotFoundError"))).toMatch(/No camera was found/);
  expect(cameraProblem(new DOMException("", "NotReadableError"))).toMatch(/Another app is using the camera/);
  expect(cameraProblem(new Error("odd"))).toMatch(/did not start/);
});
