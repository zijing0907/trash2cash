/** Words for home pickups (Phase 6b), shared by the resident's, the collector's and the admin's screens. */
import type { HomeStatus, Slot } from "./types";

export const SLOTS: Record<Slot, string> = {
  morning: "Morning, 8 am to 12 pm",
  afternoon: "Afternoon, 12 to 5 pm",
  evening: "Evening, 5 to 8 pm",
};

export const HOME_STATE: Record<HomeStatus, string> = {
  requested: "Waiting for a collector",
  taken: "A collector is coming",
  done: "Collected",
  missed: "Missed",
  cancelled: "Cancelled",
};
