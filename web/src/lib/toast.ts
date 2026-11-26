import { createContext, useContext } from "react";

export interface ToastAction {
  label: string;
  run: () => void;
}
export type ShowToast = (message: string, options?: { action?: ToastAction; ms?: number }) => void;

// Without a provider (a page rendered on its own, as in tests) toasts are simply not shown
export const ToastContext = createContext<ShowToast>(() => {});

/** "Booked", "Collected", "Report sent": a short note at the bottom that the action worked, read out politely. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}
