import { useEffect, useState } from "react";

import { easeOutCubic, motionAllowed } from "../lib/motion";

const plain = (n: number) => n.toLocaleString("en-MY");

/**
 * A number that counts from `from` to `to`, so a change reads as a change. Screen readers get only the final
 * number; with reduced motion the final number is all there is.
 */
export function CountUp({
  to,
  from = 0,
  duration = 900,
  format = plain,
}: {
  to: number;
  from?: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [moving] = useState(() => motionAllowed() && from !== to);
  const [shown, setShown] = useState(moving ? from : to);

  useEffect(() => {
    if (!moving) return;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      // Time from the first frame's own timestamp: frames can be stamped a little before any clock read here
      start ??= now;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      setShown(from + (to - from) * easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving, from, to, duration]);

  if (!moving) return <>{format(to)}</>;
  return (
    <>
      <span aria-hidden className="countup">
        {format(Math.round(shown))}
      </span>
      <span className="visually-hidden">{format(to)}</span>
    </>
  );
}
