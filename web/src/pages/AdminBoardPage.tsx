import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { BinBadge } from "../components/BinBadge";
import { FillBar } from "../components/FillBar";
import { RoleGate } from "../components/RoleGate";
import { Button, ErrorNote, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { dateTime, day, kgNum, km, ringgit } from "../lib/format";
import type { BinStatus, Board, BoardBin } from "../lib/types";

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

function Run({ board }: { board: Board }) {
  const pickup = usePickup();
  const [confirm, setConfirm] = useState<number | null>(null);
  const stops = board.run.stops;
  return (
    <section className="account__section" aria-labelledby="run-head">
      <h2 id="run-head">Today’s run</h2>
      {stops.length === 0 ? (
        <p className="empty">Nothing needs collecting today or tomorrow.</p>
      ) : (
        <>
          <p className="small-print muted">
            {stops.length} {stops.length === 1 ? "stop" : "stops"}, {km(board.run.total_km)}{" "}
            between them. Most urgent first, then always the nearest next stop.
          </p>
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
                  {confirm === s.point_id ? (
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

function Bins({ board }: { board: Board }) {
  const pickup = usePickup();
  return (
    <section className="account__section" aria-labelledby="bins-head">
      <h2 id="bins-head">Every bin</h2>
      <p className="small-print muted">
        Fill is everything weighed in since the bin was last emptied. The forecast extends the last two weeks’ daily
        average; a bin is due when it is expected to pass 90%.
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
          {kgNum(b.fill_kg)} of {kgNum(b.capacity_kg)}, {Math.round(b.fill_ratio * 100)}%
        </span>
      </td>
      <td className="num">{b.rate_kg_per_day > 0 ? `${kgNum(b.rate_kg_per_day)} a day` : "None lately"}</td>
      <td>{b.full_on ? day(b.full_on) : "Not forecast"}</td>
      <td>
        <span className={`status status--${b.status}`}>{STATUS[b.status]}</span>
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
