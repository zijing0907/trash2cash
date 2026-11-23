import { classInfo } from "../lib/recycling";
import type { ClassProb } from "../lib/types";
import { percent } from "../lib/image";

/** The model's top guesses as bars. The threshold marker shows where "not sure" begins. */
export function ProbBars({ top3, threshold }: { top3: ClassProb[]; threshold?: number }) {
  return (
    <ul className="space-y-2.5">
      {top3.map((p, i) => (
        <li key={p.class}>
          <div className="mb-1 flex justify-between text-sm">
            <span className={i === 0 ? "font-semibold" : "text-ink-soft"}>{classInfo(p.class).name}</span>
            <span className="tabular-nums text-ink-soft">{percent(p.prob)}</span>
          </div>
          <div
            className="relative h-2 overflow-hidden rounded-full bg-paper-deep"
            role="meter"
            aria-label={`${classInfo(p.class).name} probability`}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={p.prob}
          >
            <div
              className={i === 0 ? "h-full rounded-full bg-leaf-500" : "h-full rounded-full bg-leaf-200"}
              style={{ width: `${Math.max(2, p.prob * 100)}%` }}
            />
            {threshold !== undefined && (
              <div className="absolute inset-y-0 w-0.5 bg-ink/40" style={{ left: `${threshold * 100}%` }} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
