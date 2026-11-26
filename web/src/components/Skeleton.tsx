/**
 * The shape of what is loading, shimmering softly, instead of a spinner: the page does not jump when the data
 * arrives. `label` is what a screen reader hears.
 */
export function Skeleton({
  label,
  lines = 4,
  variant = "rows",
}: {
  label: string;
  lines?: number;
  variant?: "rows" | "block";
}) {
  return (
    <div role="status" className={`skeleton skeleton--${variant}`}>
      <span className="visually-hidden">{label}</span>
      {variant === "block" ? (
        <span className="skeleton__block" aria-hidden />
      ) : (
        Array.from({ length: lines }, (_, i) => (
          <span key={i} className="skeleton__line" style={{ width: `${92 - ((i * 17) % 35)}%` }} aria-hidden />
        ))
      )}
    </div>
  );
}
