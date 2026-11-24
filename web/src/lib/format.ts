/** Formatting shared by the points, operator and admin screens. */

const DAY = new Intl.DateTimeFormat("en-MY", { weekday: "short", day: "numeric", month: "short" });
const DATE_TIME = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const TIME = new Intl.DateTimeFormat("en-MY", { hour: "numeric", minute: "2-digit" });

export const kg = (grams: number) => `${(grams / 1000).toLocaleString("en-MY", { maximumFractionDigits: 2 })}\u00a0kg`;
export const kgNum = (kilos: number) => `${kilos.toLocaleString("en-MY", { maximumFractionDigits: 1 })}\u00a0kg`;
export const ringgit = (sen: number) =>
  `RM\u00a0${(sen / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pts = (n: number) => `${n.toLocaleString("en-MY")}\u00a0${Math.abs(n) === 1 ? "point" : "points"}`;
/** A YYYY-MM-DD date from the API, read as a local calendar day */
export const day = (iso: string) => DAY.format(new Date(`${iso}T00:00:00`));
export const dateTime = (iso: string) => DATE_TIME.format(new Date(iso));
export const time = (iso: string) => TIME.format(new Date(iso));
export const km = (n: number) => `${n.toLocaleString("en-MY", { maximumFractionDigits: 1 })}\u00a0km`;
