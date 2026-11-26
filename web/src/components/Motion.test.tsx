import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { remember, remembered, withViewTransition } from "../lib/motion";
import { useToast } from "../lib/toast";
import { CountUp } from "./CountUp";
import { Skeleton } from "./Skeleton";
import { ToastProvider } from "./Toast";

function allowMotion(allowed: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: !allowed, addEventListener() {}, removeEventListener() {} })),
  });
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
  vi.useRealTimers();
});

describe("counting up", () => {
  it("shows only the final number when motion is not wanted", () => {
    allowMotion(false);
    render(<CountUp from={100} to={1250} />);
    expect(document.body.textContent).toBe("1,250");
  });

  it("counts towards the number, and screen readers hear only the final one", async () => {
    allowMotion(true);
    render(<CountUp from={0} to={500} duration={50} />);
    expect(document.querySelector(".visually-hidden")).toHaveTextContent("500");
    expect(document.querySelector(".countup")).toHaveAttribute("aria-hidden", "true");
    await act(() => new Promise((r) => setTimeout(r, 200)));
    expect(document.querySelector(".countup")).toHaveTextContent("500");
  });
});

describe("view transitions", () => {
  it("just applies the change where the browser has none", () => {
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("wraps the change in one where it is supported and motion is welcome", () => {
    allowMotion(true);
    const start = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    const update = vi.fn();
    withViewTransition(update);
    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: undefined });
  });
});

it("remembers a number for the next visit", () => {
  remember("balance:TEST", 320);
  expect(remembered("balance:TEST")).toBe(320);
  expect(remembered("never-set")).toBeNull();
});

it("tells screen readers what is loading", () => {
  render(<Skeleton label="Loading jobs…" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading jobs…");
});

describe("notes at the bottom", () => {
  function Booker({ onUndo }: { onUndo: () => void }) {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast("Pickup cancelled", { action: { label: "Undo", run: onUndo } })}>
        Cancel it
      </button>
    );
  }

  it("says the action worked, offers Undo, and goes away by itself", async () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Booker onUndo={onUndo} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel it" }));
    expect(screen.getByRole("status")).toHaveTextContent("Pickup cancelled");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByText("Pickup cancelled")).not.toBeInTheDocument();
  });

  it("is quietly left out where no provider is mounted", async () => {
    render(<Booker onUndo={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel it" }));
    expect(screen.queryByText("Pickup cancelled")).not.toBeInTheDocument();
  });
});
