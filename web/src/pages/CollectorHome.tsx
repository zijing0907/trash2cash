import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { House } from "lucide-react";
import { useState } from "react";

import { BinBadge } from "../components/BinBadge";
import { Skeleton } from "../components/Skeleton";
import { Button, ErrorNote } from "../components/ui";
import { ApiError, homeApi, homePhotoUrl } from "../lib/api";
import { day as showDay, kg, km, pts } from "../lib/format";
import { distanceKm, type LatLng } from "../lib/geo";
import { SLOTS } from "../lib/home";
import { useToast } from "../lib/toast";
import { binInfo } from "../lib/recycling";
import type { HomePickup } from "../lib/types";

function useHomeAction<T>(
  fn: (v: T) => Promise<HomePickup>,
  done?: (p: HomePickup) => string,
  undo?: (p: HomePickup) => Promise<unknown>,
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (p) => {
      if (!done) return;
      const action = undo && {
        label: "Undo",
        run: () =>
          undo(p).then(
            () => qc.invalidateQueries({ queryKey: ["collector", "home"] }),
            (e: Error) => toast(e.message),
          ),
      };
      toast(done(p), action ? { action } : undefined);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["collector", "home"] }),
  });
}

/** Home pickups on the collector's screen: the ones they took, in full, and the ones waiting, by area only. */
export function CollectorHome({ me }: { me: LatLng | null }) {
  const list = useQuery({ queryKey: ["collector", "home"], queryFn: homeApi.forCollector, refetchInterval: 30_000 });
  const take = useHomeAction(
    (id: number) => homeApi.take(id),
    (p) => `Home pickup taken: ${p.address ?? "the address is now shown"}`,
  );
  // An API from before home pickups has no such route: leave the section out rather than show an error
  if (list.error instanceof ApiError && list.error.status === 404) return null;
  return (
    <section className="account__section" aria-labelledby="home-head">
      <h2 id="home-head">Home pickups</h2>
      <p className="small-print muted">
        Residents with 5 kg or more book a pickup. You see the address once you take one; until then, only the area.
      </p>
      {list.isPending && <Skeleton label="Loading home pickups…" lines={3} />}
      {list.error && <ErrorNote onRetry={() => void list.refetch()}>{list.error.message}</ErrorNote>}
      {list.data && (
        <>
          {list.data.mine.length > 0 && (
            <ul className="jobs">
              {list.data.mine.map((p) => (
                <MyHomePickup key={p.id} p={p} />
              ))}
            </ul>
          )}
          <h3 className="subhead">Waiting for a collector</h3>
          {take.error && <ErrorNote>{take.error.message}</ErrorNote>}
          {list.data.open.length === 0 ? (
            <p className="empty">No home pickups are waiting.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Items</th>
                    <th scope="col">Area</th>
                    <th scope="col">
                      <span className="visually-hidden">Take</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.open.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="table__main">{showDay(p.day)}</span>
                        <span className="muted small-print">{SLOTS[p.slot]}</span>
                      </td>
                      <td>
                        <span className="table__lines">
                          {p.streams.map((s) => (
                            <BinBadge key={s} bin={s} />
                          ))}
                        </span>
                        <span className="muted small-print">About {p.rough_kg} kg</span>
                      </td>
                      <td className="nowrap">
                        {me ? `About ${km(distanceKm(me, p.area))} away` : `Near ${p.area[0]}, ${p.area[1]}`}
                      </td>
                      <td>
                        <Button
                          small
                          onClick={() => take.mutate(p.id)}
                          busy={take.isPending && take.variables === p.id}
                        >
                          Take
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.data.done.length > 0 && (
            <>
              <h3 className="subhead">Done this week</h3>
              <ul className="plain-list">
                {list.data.done.map((p) => (
                  <li key={p.id} className="small-print">
                    {showDay(p.day)}, {p.resident?.name}:{" "}
                    {p.status === "done"
                      ? `${kg(p.weighed.reduce((s, l) => s + l.weight_g, 0))}, ${pts(p.points ?? 0)} for them`
                      : `missed (${p.missed_reason})`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function MyHomePickup({ p }: { p: HomePickup }) {
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const collect = useHomeAction(
    (lines: { stream_key: string; weight_kg: number }[]) => homeApi.collect(p.id, lines),
    (done) => `Collected. ${done.resident?.name ?? "They"} got ${done.points ?? 0} points`,
  );
  const missed = useHomeAction(
    (why: string) => homeApi.missed(p.id, why),
    () => "Marked as missed",
  );
  const release = useHomeAction(
    () => homeApi.release(p.id),
    () => "Handed back for another collector",
    (back) => homeApi.take(back.id),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lines = p.streams
      .map((s) => ({ stream_key: s, weight_kg: Number((weights[s] ?? "").replace(",", ".")) }))
      .filter((l) => l.weight_kg > 0);
    if (lines.length === 0) return setProblem("Enter what the scale showed for at least one bin.");
    setProblem(null);
    collect.mutate(lines);
  }

  return (
    <li className="job">
      <div className="job__head">
        <House size={28} aria-hidden className="job__icon" />
        <div>
          <h3>{p.resident?.name}</h3>
          <p className="muted small-print">
            {p.address}. {showDay(p.day)}, {SLOTS[p.slot].toLowerCase()}.
          </p>
          {p.note && <p className="small-print">Note: {p.note}</p>}
        </div>
        <span className="job__links">
          <a
            className="link small-print"
            href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Directions
          </a>
          <a className="link small-print" href={homePhotoUrl(p.id)} target="_blank" rel="noreferrer">
            Their photo
          </a>
        </span>
      </div>
      {missing ? (
        <form
          className="bintask__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) return setProblem("Say briefly why you could not collect it.");
            setProblem(null);
            missed.mutate(reason.trim());
          }}
        >
          <label className="field">
            <span>Why could you not collect it?</span>
            <input
              className="input"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nobody home, much more than booked…"
            />
          </label>
          <div className="bintask__actions">
            <Button small type="submit" busy={missed.isPending}>
              Mark as missed
            </Button>
            <Button small variant="quiet" onClick={() => setMissing(false)}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <form className="bintask__form" onSubmit={submit} noValidate>
          {p.streams.map((s) => (
            <label key={s} className="field">
              <span>{binInfo(s).title} on the scale (kg)</span>
              <input
                className="input"
                inputMode="decimal"
                value={weights[s] ?? ""}
                onChange={(e) => setWeights({ ...weights, [s]: e.target.value })}
              />
            </label>
          ))}
          <div className="bintask__actions">
            <Button small type="submit" busy={collect.isPending}>
              Weighed and collected
            </Button>
            <Button small variant="quiet" onClick={() => setMissing(true)}>
              Couldn’t collect
            </Button>
            <Button small variant="quiet" onClick={() => release.mutate(undefined)} busy={release.isPending}>
              Hand it back
            </Button>
          </div>
        </form>
      )}
      <p className="small-print muted">They guessed about {p.rough_kg} kg. Points come from your weights.</p>
      {problem && (
        <p role="alert" className="notice">
          {problem}
        </p>
      )}
      {(collect.error || missed.error || release.error) && (
        <ErrorNote>{(collect.error ?? missed.error ?? release.error)!.message}</ErrorNote>
      )}
    </li>
  );
}
