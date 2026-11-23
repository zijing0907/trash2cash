import { binInfo } from "../lib/recycling";

/** A bin named in a row: a square of its colour, then its name. */
export function BinBadge({ bin }: { bin: string | null | undefined }) {
  const info = binInfo(bin);
  return (
    <span className={`binname ${info.cls}`}>
      <span className="swatch" aria-hidden />
      {info.title}
    </span>
  );
}
