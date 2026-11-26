import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { BinBadge } from "../components/BinBadge";
import { FillBar } from "../components/FillBar";
import { RoleGate } from "../components/RoleGate";
import { Button, ErrorNote, Spinner } from "../components/ui";
import { api, pickupPhotoUrl, reportPhotoUrl } from "../lib/api";
import { dateTime, day, kgNum, km, ringgit } from "../lib/format";
import type { BinStatus, Board, BoardBin, JobStatus } from "../lib/types";

const STATUS: Record<BinStatus, string> = {
  due: "Collect now",
  soon: "This week",
  later: "Later",
  idle: "No recent deposits",
};

export function AdminBoardPage() {
  return (
    <RoleGate roles={["admin"]} next="/admin">
      <BoardScreen />
    </RoleGate>
  );
}

function BoardScreen() {
  const board = useQuery({ queryKey: ["admin", "board"], queryFn: api.board, refetchInterval: 60_000 });
  return (
    <div className="container app">
      <header className="app__head app__head--row">
        <div>
          <h1>Pickup board</h1>
          {board.data && <p className="lead">{day(board.data.today)}</p>}
        </div>
        <Link to="/admin/setup" className="link">
          Rates, rewards and staff
        </Link>
      </header>
      {board.isPending && <Spinner label="Working out every bin…" />}
      {board.error && <ErrorNote>{board.error.message}</ErrorNote>}
      {board.data && (
        <>
          {board.data.is_demo && (
            <p className="demo-note">
              Demo data: sample drop-off points with six weeks of generated deposits, so the forecasts have
              something to work on.
            </p>
          )}
          <Run board={board.data} />
          <JobsTable />
          <Bins board={board.data} />
          <Month board={board.data} />
        </>
      )}
    </div>
  );
}

function usePickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => api.pickups(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "board"] }),
  });
}

function useOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pointIds: number[]) => api.offerJobs(pointIds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "board"] });
      void qc.invalidateQueries({ queryKey: ["admin", "jobs"] });
    },
  });
}

const JOB_STATE: Record<JobStatus, string> = {
  open: "Offered",
  taken: "Taken",
  done: "Done",
  cancelled: "Withdrawn",
};

function Run({ board }: { board: Board }) {
  const pickup = usePickup();
  const offer = useOffer();
  const [confirm, setConfirm] = useState<number | null>(null);
  const stops = board.run.stops;
  const unoffered = stops.filter((s) => !s.job).map((s) => s.point_id);
  return (
    <section className="account__section" aria-labelledby="run-head">
      <h2 id="run-head">Today’s run</h2>
      {stops.length === 0 ? (
        <p className="empty">Nothing needs collecting today or tomorrow.</p>
      ) : (
        <>
          <div className="run__intro">
            <p className="small-print muted">
              {stops.length === 1
                ? "1 stop."
                : `${stops.length} stops, ${km(board.run.total_km)} between them. Most urgent first, then always the nearest next stop.`}
            </p>
            {unoffered.length > 0 && (
              <Button small onClick={() => offer.mutate(unoffered)} busy={offer.isPending}>
                <Truck size={16} aria-hidden /> Offer {unoffered.length === stops.length ? "the run" : `${unoffered.length} more`} to
                collectors
              </Button>
            )}
          </div>
          {offer.error && <ErrorNote>{offer.error.message}</ErrorNote>}
          <ol className="run">
            {stops.map((s, i) => {
              const point = board.points.find((p) => p.id === s.point_id)!;
              const ids = point.bins.filter((b) => b.status === "due").map((b) => b.container_id);
              return (
                <li key={s.point_id} className="run__stop">
                  <span className="figure-num run__n">{i + 1}</span>
                  <div>
                    <p className="table__main">{s.name}</p>
                    <p className="muted small-print">
                      {i === 0 ? "Start here" : `${km(s.km_from_previous)} from the last stop`}
                    </p>
                  </div>
                  <span className="table__lines">
                    {s.bins.map((b) => (
                      <BinBadge key={b} bin={b} />
                    ))}
                  </span>
                  {s.job ? (
                    <span className={`status ${s.job.status === "taken" ? "status--soon" : ""}`}>
                      {JOB_STATE[s.job.status]}
                      {s.job.collector && ` by ${s.job.collector}`}
                    </span>
                  ) : confirm === s.point_id ? (
                    <span className="confirm-inline">
                      <span>Emptied all {ids.length}?</span>
                      <Button small onClick={() => pickup.mutate(ids, { onSuccess: () => setConfirm(null) })} busy={pickup.isPending}>
                        Record pickup
                      </Button>
                      <Button small variant="quiet" onClick={() => setConfirm(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <Button small variant="secondary" onClick={() => setConfirm(s.point_id)}>
                      <Truck size={16} aria-hidden /> Collected
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
          {pickup.error && <ErrorNote>{pickup.error.message}</ErrorNote>}
        </>
      )}
    </section>
  );
}

/** Jobs offered to collectors, with what the scale said next to what was weighed in, and the photos */
function JobsTable() {
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ["admin", "jobs"], queryFn: api.adminJobs, refetchInterval: 60_000 });
  const cancel = useMutation({
    mutationFn: (id: number) => api.cancelJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "jobs"] });
      void qc.invalidateQueries({ queryKey: ["admin", "board"] });
    },
  });
  return (
    <section className="account__section" aria-labelledby="jobs-head">
      <h2 id="jobs-head">Collector jobs</h2>
      {jobs.isPending && <Spinner label="Loading jobs…" />}
      {jobs.error && <ErrorNote>{jobs.error.message}</ErrorNote>}
      {cancel.error && <ErrorNote>{cancel.error.message}</ErrorNote>}
      {jobs.data && jobs.data.length === 0 && (
        <p className="empty">No jobs in the last two weeks. Offer today’s run to collectors to start one.</p>
      )}
      {jobs.data && jobs.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Drop-off point</th>
                <th scope="col">State</th>
                <th scope="col">Bins: on the scale, and weighed in</th>
                <th scope="col">
                  <span className="visually-hidden">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id}>
                  <td>
                    <span className="table__main">{j.point.name}</span>
                    <span className="muted small-print">Offered {dateTime(j.created_at)}</span>
                  </td>
                  <td>
                    <span className={`status ${j.status === "open" ? "status--soon" : ""}`}>{JOB_STATE[j.status]}</span>
                    <span className="muted small-print status__last">
                      {j.collector ? j.collector.name : "No collector yet"}
                      {j.finished_at && `, ${dateTime(j.finished_at)}`}
                    </span>
                  </td>
                  <td>
                    <ul className="jobitems">
                      {j.items.map((it) => (
                        <li key={it.id}>
                          <BinBadge bin={it.stream_key} />
                          <span className="small-print">
                            {it.state === "collected"
                              ? `${kgNum(it.collected_kg ?? 0)} on the scale, ${kgNum(it.weighed_in_kg ?? 0)} weighed in`
                              : it.state === "skipped"
                                ? `Skipped: ${it.skipped_reason}`
                                : `About ${kgNum(it.expected_kg)} to collect`}
                          </span>
                          {it.has_photo && it.pickup_id && (
                            <a className="link small-print" href={pickupPhotoUrl(it.pickup_id)} target="_blank" rel="noreferrer">
                              Photo
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    {(j.status === "open" || j.status === "taken") && (
                      <Button small variant="quiet" onClick={() => cancel.mutate(j.id)} busy={cancel.isPending && cancel.variables === j.id}>
                        Withdraw
                      </Button>
                    )}
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

function Bins({ board }: { board: Board }) {
  const pickup = usePickup();
  return (
    <section className="account__section" aria-labelledby="bins-head">
      <h2 id="bins-head">Every bin</h2>
      <p className="small-print muted">
        Fill is everything weighed in since the bin was last emptied, scaled by what collectors’ scales showed
        once a bin has two measured pickups. The forecast extends the last two weeks’ daily average; a bin is due
        when it is expected to pass 90%, or when three people report it full.
      </p>
      <div className="table-wrap">
        <table className="table board">
          <thead>
            <tr>
              <th scope="col">Drop-off point</th>
              <th scope="col">Bin</th>
              <th scope="col">Fill</th>
              <th scope="col" className="num">
                Comes in
              </th>
              <th scope="col">Full by</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="visually-hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {board.points.map((p) =>
              p.bins.map((b, i) => (
                <BinRow key={b.container_id} pointName={p.name} address={p.address} bin={b} first={i === 0}
                        rows={p.bins.length} onEmpty={() => pickup.mutate([b.container_id])} busy={pickup.isPending} />
              )),
            )}
          </tbody>
        </table>
      </div>
      {pickup.error && <ErrorNote>{pickup.error.message}</ErrorNote>}
    </section>
  );
}

function BinRow(props: {
  pointName: string;
  address: string;
  bin: BoardBin;
  first: boolean;
  rows: number;
  onEmpty: () => void;
  busy: boolean;
}) {
  const b = props.bin;
  const [confirm, setConfirm] = useState(false);
  return (
    <tr className={props.first ? "board__first" : undefined}>
      {props.first && (
        <th scope="rowgroup" rowSpan={props.rows} className="board__point">
          <span className="table__main">{props.pointName}</span>
          <span className="muted small-print">{props.address}</span>
        </th>
      )}
      <td>
        <BinBadge bin={b.stream_key} />
      </td>
      <td className="board__fill">
        <FillBar bin={b.stream_key} ratio={b.fill_ratio} label={`${b.stream_name} fill`} />
        <span className="small-print">
          {b.correction
            ? `About ${kgNum(b.est_fill_kg ?? b.fill_kg)} of ${kgNum(b.capacity_kg)}, ${Math.round(b.fill_ratio * 100)}%`
            : `${kgNum(b.fill_kg)} of ${kgNum(b.capacity_kg)}, ${Math.round(b.fill_ratio * 100)}%`}
        </span>
        {b.correction && (
          <span className="muted small-print status__last">
            {kgNum(b.fill_kg)} weighed in × {b.correction.factor} from the last {b.correction.pickups} scale weights
          </span>
        )}
      </td>
      <td className="num">{b.rate_kg_per_day > 0 ? `${kgNum(b.rate_kg_per_day)} a day` : "None lately"}</td>
      <td>{b.full_on ? day(b.full_on) : "Not forecast"}</td>
      <td>
        <span className={`status status--${b.status}`}>{STATUS[b.status]}</span>
        {b.reports && (
          <span className="small-print status__last">
            {b.due_because === "reports" ? "Due: " : ""}
            {b.reports.count === 1 ? "1 report" : `${b.reports.count} reports`}
            {b.reports.overflowing && ", overflowing"}
            {b.reports.photo_ids.map((id, i) => (
              <span key={id}>
                {" "}
                <a className="link" href={reportPhotoUrl(id)} target="_blank" rel="noreferrer">
                  photo{b.reports!.photo_ids.length > 1 ? ` ${i + 1}` : ""}
                </a>
              </span>
            ))}
          </span>
        )}
        {b.last_pickup_at && (
          <span className="muted small-print status__last">Emptied {dateTime(b.last_pickup_at)}</span>
        )}
      </td>
      <td>
        {confirm ? (
          <span className="confirm-inline">
            <Button small onClick={() => { props.onEmpty(); setConfirm(false); }} busy={props.busy}>
              Record
            </Button>
            <Button small variant="quiet" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button small variant="quiet" onClick={() => setConfirm(true)} disabled={b.fill_kg === 0}>
            Emptied
          </Button>
        )}
      </td>
    </tr>
  );
}

function Month({ board }: { board: Board }) {
  const m = board.month;
  return (
    <section className="account__section" aria-labelledby="month-head">
      <h2 id="month-head">Since {day(m.from)}</h2>
      <dl className="figures-row">
        <div>
          <dt>Weighed in</dt>
          <dd className="figure-num">{kgNum(m.kg_total)}</dd>
        </div>
        <div>
          <dt>Worth at buy-back prices</dt>
          <dd className="figure-num">{ringgit(m.value_sen)}</dd>
        </div>
        <div>
          <dt>Deposits</dt>
          <dd className="figure-num">{m.deposits.toLocaleString("en-MY")}</dd>
        </div>
        <div>
          <dt>Residents who came</dt>
          <dd className="figure-num">{m.residents.toLocaleString("en-MY")}</dd>
        </div>
        <div>
          <dt>Points given</dt>
          <dd className="figure-num">{m.points_issued.toLocaleString("en-MY")}</dd>
        </div>
        <div>
          <dt>Points spent</dt>
          <dd className="figure-num">{m.points_redeemed.toLocaleString("en-MY")}</dd>
        </div>
      </dl>
      {m.kg_by_stream.length > 0 && (
        <table className="table table--compact">
          <thead>
            <tr>
              <th scope="col">Bin</th>
              <th scope="col" className="num">
                Weighed in
              </th>
            </tr>
          </thead>
          <tbody>
            {m.kg_by_stream.map((s) => (
              <tr key={s.stream_key}>
                <td>
                  <BinBadge bin={s.stream_key} />
                </td>
                <td className="num">{kgNum(s.kg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
