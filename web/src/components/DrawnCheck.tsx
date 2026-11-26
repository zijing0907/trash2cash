/** A tick that draws itself when it appears: the action worked. Static under reduced motion. */
export function DrawnCheck({ size = 18 }: { size?: number }) {
  return (
    <svg className="drawn-check" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}
