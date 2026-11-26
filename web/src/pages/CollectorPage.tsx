import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, LocateFixed } from "lucide-react";
import { useState } from "react";

import { BinBadge } from "../components/BinBadge";
import { MapView } from "../components/MapView";
import { RoleGate } from "../components/RoleGate";
import { Button, ErrorNote, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { dateTime, kgNum, km } from "../lib/format";
import { distanceKm, type LatLng, nearestFirst } from "../lib/geo";
import { shrinkPhoto } from "../lib/photo";
import { useMyPosition } from "../lib/position";
import type { Job, JobItem } from "../lib/types";

export function CollectorPage() {
  return (
    <RoleGate roles={["collector"]} next="/collect">
      <Jobs />
    </RoleGate>
  );
}

const at = (j: Job): LatLng => [j.point.lat, j.point.lng];
const expectedKg = (j: Job) => j.items.reduce((sum, it) => sum + it.expected_kg, 0);

function useJobAction<T>(fn: (v: T) => Promise<Job>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ["collector", "jobs"] }) });
}

function Jobs() {
  const jobs = useQuery({ queryKey: ["collector", "jobs"], queryFn: api.collectorJobs, refetchInterval: 30_000 });
  const position = useMyPosition();
  return (
    <div className="container app">
      <header className="app__head app__head--row">
        <div>
          <h1>Pickup jobs</h1>
          <p className="lead">Take a job, empty each bin, weigh what you took and photograph the empty bin.</p>
        </div>
        <Button variant="secondary" onClick={position.locate} busy={position.busy}>
          <LocateFixed size={18} aria-hidden /> Use my location
        </Button>
      </header>
      {position.problem && <ErrorNote>{position.problem}</ErrorNote>}
      {jobs.isPending && <Spinner label="Loading jobs…" />}
      {jobs.error && <ErrorNote>{jobs.error.message}</ErrorNote>}
      {jobs.data && (
        <>
          <Mine jobs={jobs.data.mine} me={position.at} />
          <Open jobs={jobs.data.open} me={position.at} />
          <Done jobs={jobs.data.done} />
        </>
      )}
    </div>
  );
}

function Mine({ jobs, me }: { jobs: Job[]; me: LatLng | null }) {
  // Nearest first from where the collector is (or from the first job), the same rule as the board's run
  const order = nearestFirst(
    jobs.map((j) => ({ job: j, at: at(j) })),
    me,
  ).map((x) => x.job);
  return (
    <section className="account__section" aria-labelledby="mine-head">
      <h2 id="mine-head">Your jobs</h2>
      {order.length === 0 ? (
        <p className="empty">You have no jobs. Take one from the open jobs below.</p>
      ) : (
        <>
          <MapView
            className="map--route"
            label="Your jobs in visiting order"
            pins={order.map((j, i) => ({
              id: j.id,
              at: at(j),
              label: String(i + 1),
              title: `${i + 1}. ${j.point.name}`,
              tone: "due",
            }))}
            route={[...(me ? [me] : []), ...order.map(at)]}
            me={me}
          />
          <p className="small-print muted">
            Nearest next{me ? ", starting from where you are" : ""}. Lines are straight, not roads.
          </p>
          <ol className="jobs">
            {order.map((j, i) => (
              <MyJob key={j.id} n={i + 1} job={j} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function MyJob({ n, job }: { n: number; job: Job }) {
  const release = useJobAction(() => api.releaseJob(job.id));
  const started = job.items.some((it) => it.state !== "to_do");
  return (
    <li className="job">
      <div className="job__head">
        <span className="figure-num run__n">{n}</span>
        <div>
          <h3>{job.point.name}</h3>
          <p className="muted small-print">{job.point.address}</p>
        </div>
        <a
          className="link small-print"
          href={`https://www.google.com/maps/dir/?api=1&destination=${job.point.lat},${job.point.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          Directions
        </a>
      </div>
      <ul className="job__bins">
        {job.items.map((it) => (
          <BinTask key={it.id} job={job} item={it} />
        ))}
      </ul>
      {!started && (
        <div>
          <Button small variant="quiet" onClick={() => release.mutate(undefined)} busy={release.isPending}>
            Hand this job back
          </Button>
        </div>
      )}
      {release.error && <ErrorNote>{release.error.message}</ErrorNote>}
    </li>
  );
}

function BinTask({ job, item }: { job: Job; item: JobItem }) {
  const [weight, setWeight] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false); // the photo is being made smaller
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const collect = useJobAction((v: { kg: number; photo: File }) => api.collectBin(job.id, item.id, v.kg, v.photo));
  const skip = useJobAction((why: string) => api.skipBin(job.id, item.id, why));

  if (item.state !== "to_do") {
    return (
      <li className="bintask is-done">
        <BinBadge bin={item.stream_key} />
        <p className="small-print with-icon">
          {item.state === "collected" ? (
            <>
              <Check size={14} aria-hidden /> Collected {kgNum(item.collected_kg ?? 0)} on the scale
            </>
          ) : (
            <>Skipped: {item.skipped_reason}</>
          )}
        </p>
      </li>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const kg = Number(weight.replace(",", "."));
    if (!(kg > 0)) return setProblem("Enter the weight the scale showed, in kg.");
    if (!photo) return setProblem("Add a photo of the emptied bin.");
    setProblem(null);
    collect.mutate({ kg, photo });
  }

  const label = `${item.stream_name} bin`;
  return (
    <li className="bintask">
      <div>
        <BinBadge bin={item.stream_key} />
        <p className="muted small-print">About {kgNum(item.expected_kg)} weighed in when the job was offered</p>
      </div>
      {skipping ? (
        <form
          className="bintask__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) return setProblem("Say briefly why the bin could not be emptied.");
            setProblem(null);
            skip.mutate(reason.trim());
          }}
        >
          <label className="field">
            <span>Why could it not be emptied?</span>
            <input
              className="input"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Locked, missing, blocked by a car…"
            />
          </label>
          <div className="bintask__actions">
            <Button small type="submit" busy={skip.isPending}>
              Skip this bin
            </Button>
            <Button small variant="quiet" onClick={() => setSkipping(false)}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <form className="bintask__form" onSubmit={submit} noValidate>
          <label className="field">
            <span>Weight on the scale (kg)</span>
            <input
              className="input"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              aria-label={`Weight of the ${label} in kg`}
            />
          </label>
          <label className="btn btn--secondary btn--small filebtn">
            <Camera size={16} aria-hidden />
            {photo ? "Change the photo" : "Photo of the empty bin"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              aria-label={`Photo of the emptied ${label}`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPreparing(true);
                  void shrinkPhoto(f)
                    .then(setPhoto)
                    .finally(() => setPreparing(false));
                }
                e.target.value = "";
              }}
            />
          </label>
          {photo && <span className="small-print muted">Photo added</span>}
          <div className="bintask__actions">
            <Button small type="submit" busy={collect.isPending || preparing}>
              Collected
            </Button>
            <Button small variant="quiet" onClick={() => setSkipping(true)}>
              Can’t empty it
            </Button>
          </div>
        </form>
      )}
      {problem && (
        <p role="alert" className="notice">
          {problem}
        </p>
      )}
      {(collect.error || skip.error) && <ErrorNote>{(collect.error ?? skip.error)!.message}</ErrorNote>}
    </li>
  );
}

function Open({ jobs, me }: { jobs: Job[]; me: LatLng | null }) {
  const take = useJobAction((id: number) => api.takeJob(id));
  const rows = jobs
    .map((j) => ({ job: j, km: me ? distanceKm(me, at(j)) : null }))
    .sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : 0));
  return (
    <section className="account__section" aria-labelledby="open-head">
      <h2 id="open-head">Open jobs</h2>
      {take.error && <ErrorNote>{take.error.message}</ErrorNote>}
      {rows.length === 0 ? (
        <p className="empty">No open jobs right now. New ones appear when an admin offers bins to collect.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Drop-off point</th>
                <th scope="col">Bins</th>
                <th scope="col" className="num">
                  Weighed in
                </th>
                {me && (
                  <th scope="col" className="num">
                    Distance
                  </th>
                )}
                <th scope="col">
                  <span className="visually-hidden">Take</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job: j, km: d }) => (
                <tr key={j.id}>
                  <td>
                    <span className="table__main">{j.point.name}</span>
                    <span className="muted small-print">
                      {j.point.address}, offered {dateTime(j.created_at)}
                    </span>
                  </td>
                  <td>
                    <span className="table__lines">
                      {j.items.map((it) => (
                        <BinBadge key={it.id} bin={it.stream_key} />
                      ))}
                    </span>
                  </td>
                  <td className="num">{kgNum(expectedKg(j))}</td>
                  {me && <td className="num">{d !== null ? km(d) : ""}</td>}
                  <td>
                    <Button small onClick={() => take.mutate(j.id)} busy={take.isPending && take.variables === j.id}>
                      Take
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Done({ jobs }: { jobs: Job[] }) {
  return (
    <section className="account__section" aria-labelledby="done-head">
      <h2 id="done-head">Done this week</h2>
      {jobs.length === 0 ? (
        <p className="empty">Finished jobs from the last seven days show here.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Drop-off point</th>
                <th scope="col">Finished</th>
                <th scope="col" className="num">
                  On the scale
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <span className="table__main">{j.point.name}</span>
                    {j.items.some((it) => it.state === "skipped") && (
                      <span className="muted small-print">
                        {j.items.filter((it) => it.state === "skipped").length} skipped
                      </span>
                    )}
                  </td>
                  <td className="nowrap">{j.finished_at ? dateTime(j.finished_at) : ""}</td>
                  <td className="num">{kgNum(j.items.reduce((s, it) => s + (it.collected_kg ?? 0), 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
