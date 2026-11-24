import { binInfo } from "../lib/recycling";

/** How full a bin is, in the bin's own colour; past 90% the track shows a mark where pickup is planned. */
export function FillBar({ bin, ratio, label }: { bin: string; ratio: number; label: string }) {
  const shown = Math.min(ratio, 1);
  return (
    <div
      className={`fill ${binInfo(bin).cls}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(shown.toFixed(2))}
    >
      <span className="fill__bar" style={{ transform: `scaleX(${shown})` }} />
      <span className="fill__mark" aria-hidden />
    </div>
  );
}
