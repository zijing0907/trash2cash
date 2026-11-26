import { percent } from "../lib/image";
import { classInfo } from "../lib/recycling";
import type { ClassProb } from "../lib/types";

/** The model's top guesses as bars. The green mark shows where "not sure" begins. */
export function ProbBars({ top3, threshold }: { top3: ClassProb[]; threshold?: number }) {
  return (
    <ul className="probs">
      {top3.map((p) => (
        <li key={p.class} className="probs__row">
          <b>{classInfo(p.class).name}</b>
          <span>{percent(p.prob)}</span>
          <div
            className="probs__track"
            role="meter"
            aria-label={`${classInfo(p.class).name} probability`}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={p.prob}
          >
            <span className="probs__fill" style={{ transform: `scaleX(${Math.max(0.02, p.prob)})` }} />
            {threshold !== undefined && <span className="probs__mark" style={{ left: `${threshold * 100}%` }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
