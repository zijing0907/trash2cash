import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { BinBadge } from "../components/BinBadge";
import { CountUp } from "../components/CountUp";
import { Skeleton } from "../components/Skeleton";
import { ErrorNote } from "../components/ui";
import { api } from "../lib/api";
import { useModelInfo } from "../lib/hooks";
import { day, kgNum } from "../lib/format";
import { binInfo, classInfo } from "../lib/recycling";
import type { Community, Confusion } from "../lib/types";

const shortDay = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short" });
const weekOf = (iso: string) => shortDay.format(new Date(`${iso}T00:00:00`));
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

export function CommunityPage() {
  const page = useQuery({ queryKey: ["community"], queryFn: api.community, refetchInterval: 5 * 60_000 });
  return (
    <div className="container app">
      <header className="app__head">
        <h1>Recycled together</h1>
        <p className="lead">
          Everything staff weighed at drop-off points and home pickups. Totals by place and by bin, never by person.
        </p>
      </header>
      {page.isPending && <Skeleton label="Adding it all up…" variant="block" />}
      {page.error && <ErrorNote>{page.error.message}</ErrorNote>}
      {page.data && (
        <>
          {page.data.is_demo && (
            <p className="demo-note">Demo data: sample drop-off points with generated drop-offs and scans.</p>
          )}
          <ThisMonth c={page.data} />
          <Weeks c={page.data} />
          <Places c={page.data} />
          <Bins c={page.data} />
        </>
      )}
      <Confusing />
    </div>
  );
}

function ThisMonth({ c }: { c: Community }) {
  const m = c.month;
  return (
    <section className="account__section" aria-labelledby="month-head">
      <h2 id="month-head">Since {day(m.from)}</h2>
      {m.deposits === 0 && m.home_kg === 0 ? (
        <p className="empty">Nothing has been weighed in yet this month.</p>
      ) : (
        <dl className="figures-row">
          <div>
            <dt>Weighed in</dt>
            <dd className="figure-num">
              <CountUp to={m.kg_total} format={kgNum} />
            </dd>
          </div>
          <div>
            <dt>Drop-offs</dt>
            <dd className="figure-num">
              <CountUp to={m.deposits} />
            </dd>
          </div>
          <div>
            <dt>Residents taking part</dt>
            <dd className="figure-num">
              <CountUp to={m.residents} />
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

/** One series, so one colour and no legend: the heading names it. The latest week is drawn as "so far". */
function Weeks({ c }: { c: Community }) {
  const max = Math.max(...c.weeks.map((w) => w.kg), 1);
  const peak = c.weeks.reduce((best, w) => (w.kg > best.kg ? w : best), c.weeks[0]!);
  return (
    <section className="account__section" aria-labelledby="weeks-head">
      <h2 id="weeks-head">Weighed in, week by week</h2>
      <ol className="weeks" aria-label="Kilograms weighed in each week, oldest first">
        {c.weeks.map((w, i) => {
          const label = `Week of ${weekOf(w.from)}${w.partial ? " so far" : ""}: ${kgNum(w.kg)}`;
          const shown = w === peak || w.partial; // the high point and the latest week carry their number
          return (
            <li
              key={w.from}
              className={w.partial ? "week is-partial" : "week"}
              tabIndex={0}
              aria-label={label}
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="week__plot" aria-hidden>
                {shown && <span className="week__value">{kgNum(w.kg)}</span>}
                <span className="week__bar" style={{ height: `${(w.kg / max) * 85}%` }} />
              </span>
              <span className="week__day" aria-hidden>
                {weekOf(w.from)}
              </span>
              <span className="week__tip" aria-hidden>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <details className="more">
        <summary>The same as a table</summary>
        <table className="table table--compact">
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col" className="num">
                Weighed in
              </th>
            </tr>
          </thead>
          <tbody>
            {c.weeks.map((w) => (
              <tr key={w.from}>
                <td>
                  {weekOf(w.from)}
                  {w.partial && " (so far)"}
                </td>
                <td className="num">{kgNum(w.kg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function Places({ c }: { c: Community }) {
  const rows = [
    ...c.places.map((p) => ({ key: String(p.id), name: p.name, now: p.kg_month, before: p.kg_last_month })),
    ...(c.month.home_kg || c.month.home_kg_last_month
      ? [{ key: "home", name: "Home pickups", now: c.month.home_kg, before: c.month.home_kg_last_month }]
      : []),
  ];
  const max = Math.max(...rows.map((r) => r.now), 1);
  return (
    <section className="account__section" aria-labelledby="places-head">
      <h2 id="places-head">By drop-off point</h2>
      {rows.length === 0 ? (
        <p className="empty">No drop-off points are open yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Place</th>
                <th scope="col">This month</th>
                <th scope="col" className="num">
                  Last month
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={r.key}>
                  <td className="table__main">{r.name}</td>
                  <td>
                    <div className="hbar">
                      <span className="hbar__track" aria-hidden>
                        <span className="hbar__bar" style={{ width: `${(r.now / max) * 100}%`, "--i": ri } as React.CSSProperties} />
                      </span>
                      <span className="figure-num">{kgNum(r.now)}</span>
                    </div>
                  </td>
                  <td className="num">{kgNum(r.before)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Bins({ c }: { c: Community }) {
  if (c.streams.length === 0) return null;
  const max = Math.max(...c.streams.map((s) => s.kg_month), 1);
  return (
    <section className="account__section" aria-labelledby="bins-head">
      <h2 id="bins-head">By bin, this month</h2>
      <div className="table-wrap">
        <table className="table">
          <tbody>
            {c.streams.map((s, si) => (
              <tr key={s.stream_key}>
                <td>
                  <BinBadge bin={s.stream_key} />
                </td>
                <td>
                  <div className="hbar">
                    {/* The bar is in the bin's own colour: it names the bin, as everywhere else */}
                    <span className="hbar__track" aria-hidden>
                      <span
                        className={`hbar__bar hbar__bar--bin ${binInfo(s.stream_key).cls}`}
                        style={{ width: `${(s.kg_month / max) * 100}%`, "--i": si } as React.CSSProperties}
                      />
                    </span>
                    <span className="figure-num">{kgNum(s.kg_month)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Confusing() {
  const [pointId, setPointId] = useState<number | null>(null);
  const points = useQuery({ queryKey: ["drop-points"], queryFn: api.dropPoints });
  const data = useQuery({ queryKey: ["confusion", pointId], queryFn: () => api.confusion(pointId) });
  return (
    <section className="account__section" aria-labelledby="confusing-head">
      <div className="section-head">
        <h2 id="confusing-head">What people find confusing</h2>
        <label className="field field--inline">
          <span>Residents who usually hand in at</span>
          <select
            className="input"
            value={pointId ?? ""}
            onChange={(e) => setPointId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Every place</option>
            {points.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small-print muted">
        From the last 90 days of scans by signed-in residents. Scans carry no location, so a place here means the
        residents whose drop-offs were mostly weighed there. An item shows once at least 3 different people are in it.
      </p>
      {data.isPending && <Skeleton label="Looking through the scans…" />}
      {data.error && <ErrorNote>{data.error.message}</ErrorNote>}
      {data.data && <ConfusionTables c={data.data} />}
    </section>
  );
}

function ConfusionTables({ c }: { c: Confusion }) {
  const { data: model } = useModelInfo();
  const binOf = (item: string) => model?.bins[item] ?? classInfo(item).bin;
  const name = (item: string) => classInfo(item).name.toLowerCase();
  if (c.asked.length === 0 && c.disagreements.length === 0 && !c.unknown) {
    return (
      <p className="empty">
        Not enough scans here yet: every item needs at least {c.min_people} different people before it shows.
      </p>
    );
  }
  return (
    <>
      {c.is_demo && <p className="demo-note">Demo data: these scans were generated, not made by real residents.</p>}
      <div className="confusion">
        <div>
          <h3>Asked about most</h3>
          <p className="small-print muted">The items people scanned because they were not sure where they go.</p>
          <table className="table">
            <tbody>
              {c.asked.map((a) => (
                <tr key={a.item}>
                  <td>
                    <span className="table__main">{classInfo(a.item).name}</span>
                    <BinBadge bin={binOf(a.item)} />
                  </td>
                  <td className="num">{people(a.people)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>Where people and the model disagreed</h3>
          <p className="small-print muted">
            What the next model should learn, and what is worth explaining on a poster by the bins.
          </p>
          {c.disagreements.length === 0 ? (
            <p className="empty">No disagreement shared by {c.min_people} or more people.</p>
          ) : (
            <table className="table">
              <tbody>
                {c.disagreements.map((d) => (
                  <tr key={`${d.model_said}-${d.people_said}`}>
                    <td>
                      The model said {name(d.model_said)}; people said {name(d.people_said)}
                      {binOf(d.model_said) !== binOf(d.people_said) && (
                        <span className="muted small-print status__last">
                          A different bin: {binInfo(binOf(d.model_said)).title.toLowerCase()} instead of{" "}
                          {binInfo(binOf(d.people_said)).title.toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td className="num">{people(d.people)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {c.unknown && (
            <p className="small-print">
              {people(c.unknown.people)} scanned something that is none of the 12 kinds the model knows.{" "}
              <Link to="/guide" className="link">
                The bin guide
              </Link>{" "}
              covers more items.
            </p>
          )}
        </div>
      </div>
      {c.hidden > 0 && (
        <p className="small-print muted">
          {c.hidden} more {c.hidden === 1 ? "item has" : "items have"} fewer than {c.min_people} people and{" "}
          {c.hidden === 1 ? "is" : "are"} not shown.
        </p>
      )}
    </>
  );
}
