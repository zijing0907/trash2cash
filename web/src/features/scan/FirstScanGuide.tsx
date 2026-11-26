import { useState } from "react";

import { Button } from "../../components/ui";
import { remember, remembered } from "../../lib/motion";

const STEPS = [
  { title: "Photograph one item", text: "Fill the square with it. Any background works." },
  { title: "We tell you the bin", text: "Or, when the model is not sure, we ask instead of guessing." },
  { title: "Say if we got it right", text: "One tap. It is what the next model learns from." },
];

/** Shown on a person's first visit to Scan, until they say they have got it. */
export function FirstScanGuide() {
  const [seen, setSeen] = useState(() => remembered("seen:scan-guide") === 1);
  if (seen) return null;
  return (
    <aside className="firsttime" aria-labelledby="firsttime-head">
      <h2 id="firsttime-head" className="visually-hidden">
        How scanning works
      </h2>
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.title} style={{ "--i": i } as React.CSSProperties}>
            <span className="figure-num firsttime__n">{i + 1}</span>
            <span>
              <strong>{s.title}</strong>
              <span className="muted small-print">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button
        small
        variant="quiet"
        onClick={() => {
          remember("seen:scan-guide", 1);
          setSeen(true);
        }}
      >
        Got it
      </Button>
    </aside>
  );
}
