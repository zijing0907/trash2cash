import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Search } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { BinBadge } from "../components/BinBadge";
import { RoleGate } from "../components/RoleGate";
import { Button, ErrorNote, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { kg, pts, time } from "../lib/format";
import { useMe } from "../lib/hooks";
import type { DepositOut, ResidentLookup } from "../lib/types";

export function OperatorPage() {
  return (
    <RoleGate roles={["operator", "admin"]} next="/operator">
      <WeighIn />
    </RoleGate>
  );
}

function WeighIn() {
  const { data: me } = useMe();
  const points = useQuery({ queryKey: ["drop-points"], queryFn: api.dropPoints });
  const streams = useQuery({ queryKey: ["streams"], queryFn: api.streams });
  const isAdmin = me?.role === "admin";
  const [chosen, setChosen] = useState<number | null>(null);
  const pointId = isAdmin ? (chosen ?? points.data?.[0]?.id ?? null) : (me?.drop_point_id ?? null);
  const point = points.data?.find((p) => p.id === pointId) ?? null;

  if (points.isPending || streams.isPending) return <Spinner label="Loading…" />;
  if (points.error || streams.error) return <ErrorNote>{(points.error ?? streams.error)!.message}</ErrorNote>;
  if (!point) {
    return (
      <div className="container gone">
        <h1>No drop-off point yet</h1>
        <p className="lead">You are not assigned to a drop-off point. Ask an admin to assign you.</p>
      </div>
    );
  }
  return (
    <div className="container app">
      <header className="app__head app__head--row">
        <h1>Weigh-in</h1>
        {isAdmin ? (
          <label className="field field--inline">
            <span>Drop-off point</span>
            <select className="input" value={point.id} onChange={(e) => setChosen(Number(e.target.value))}>
              {points.data!.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="lead">{point.name}</p>
        )}
      </header>
      <div className="weigh-grid">
        <Counter key={point.id} pointId={point.id} pointStreams={point.streams} streams={streams.data!} isAdmin={isAdmin} />
        <Today pointId={point.id} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

function Counter(props: {
  pointId: number;
  pointStreams: string[];
  streams: { key: string; name: string; points_per_kg: number }[];
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [member, setMember] = useState<ResidentLookup | null>(null);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<DepositOut | null>(null);
  const [scanning, setScanning] = useState(false);
  const bins = props.streams.filter((s) => props.pointStreams.includes(s.key));

  const find = useMutation({ mutationFn: (c: string) => api.findResident(c), onSuccess: setMember });
  const lines = useMemo(
    () =>
      bins
        .map((s) => ({ s, kg: Number((weights[s.key] ?? "").replace(",", ".")) }))
        .filter((x) => Number.isFinite(x.kg) && x.kg > 0),
    [bins, weights],
  );
  const total = lines.reduce((sum, x) => sum + Math.round(x.kg * x.s.points_per_kg), 0);
  const save = useMutation({
    mutationFn: () =>
      api.deposit({
        member_code: member!.member_code,
        point_id: props.isAdmin ? props.pointId : null,
        lines: lines.map((x) => ({ stream_key: x.s.key, weight_kg: x.kg })),
      }),
    onSuccess: (d) => {
      setReceipt(d);
      void qc.invalidateQueries({ queryKey: ["operator", "today"] });
    },
  });

  function next() {
    setCode("");
    setMember(null);
    setWeights({});
    setReceipt(null);
    find.reset();
    save.reset();
  }

  if (receipt) {
    return (
      <section className="slip" aria-live="polite">
        <p className="slip__done">
          <Check size={20} aria-hidden /> Credited {pts(receipt.points)} to {receipt.resident_name}
        </p>
        <ul className="slip__lines">
          {receipt.lines.map((ln) => (
            <li key={ln.stream_key}>
              <BinBadge bin={ln.stream_key} />
              <span>{kg(ln.weight_g)}</span>
              <span className="num">{pts(ln.points)}</span>
            </li>
          ))}
        </ul>
        {receipt.balance_after !== null && <p>New balance: {pts(receipt.balance_after)}</p>}
        <Button onClick={next}>Next member</Button>
      </section>
    );
  }

  return (
    <section className="slip" aria-label="Record a deposit">
      <form
        className="slip__find"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (code.trim()) find.mutate(code);
        }}
      >
        <label className="field">
          <span>Member code</span>
          <input
            className="input"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setMember(null);
            }}
            placeholder="For example 7KQM-3XPA"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="actions">
          <Button type="submit" variant="secondary" busy={find.isPending}>
            <Search size={18} aria-hidden /> Find
          </Button>
          {"BarcodeDetector" in window && (
            <Button variant="secondary" onClick={() => setScanning(true)}>
              <Camera size={18} aria-hidden /> Scan QR
            </Button>
          )}
        </div>
      </form>
      {scanning && (
        <QrScanner
          onCode={(c) => {
            setScanning(false);
            setCode(c);
            find.mutate(c);
          }}
          onClose={() => setScanning(false)}
        />
      )}
      {find.error && <ErrorNote>{find.error.message}</ErrorNote>}

      {member && (
        <form
          className="slip__weigh"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (lines.length) save.mutate();
          }}
        >
          <p className="slip__member">
            <span className="table__main">{member.display_name}</span>
            <span className="muted">
              {member.member_code}, {pts(member.balance)} now
            </span>
          </p>
          <fieldset className="slip__bins">
            <legend>Weight per bin, in kg</legend>
            {bins.map((s) => {
              const v = Number((weights[s.key] ?? "").replace(",", "."));
              return (
                <label key={s.key} className="slip__bin">
                  <BinBadge bin={s.key} />
                  <span className="muted small-print">{s.name}</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={weights[s.key] ?? ""}
                    onChange={(e) => setWeights((w) => ({ ...w, [s.key]: e.target.value }))}
                    aria-label={`${s.name} in kg`}
                    placeholder="0.0"
                  />
                  <span className="num muted">{v > 0 ? pts(Math.round(v * s.points_per_kg)) : ""}</span>
                </label>
              );
            })}
          </fieldset>
          {save.error && <ErrorNote>{save.error.message}</ErrorNote>}
          <div className="slip__total">
            <p>
              Total <span className="figure-num">{pts(total)}</span>
            </p>
            <Button type="submit" busy={save.isPending} disabled={!lines.length}>
              Credit {pts(total)}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function Today({ pointId, isAdmin }: { pointId: number; isAdmin: boolean }) {
  const q = useQuery({
    queryKey: ["operator", "today", pointId],
    queryFn: () => api.todaysDeposits(isAdmin ? pointId : null),
  });
  return (
    <section aria-labelledby="today-head">
      <h2 id="today-head" className="side-head">
        Today here
      </h2>
      {q.isPending && <Spinner label="Loading today’s deposits…" />}
      {q.error && <ErrorNote>{q.error.message}</ErrorNote>}
      {q.data && q.data.length === 0 && <p className="empty">No deposits yet today.</p>}
      {q.data && q.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Member</th>
              <th scope="col" className="num">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((d) => (
              <tr key={d.id}>
                <td className="nowrap">{time(d.created_at)}</td>
                <td>
                  <span className="table__main">{d.resident_name}</span>
                  <span className="table__lines">
                    {d.lines.map((ln) => (
                      <span key={ln.stream_key}>
                        <BinBadge bin={ln.stream_key} /> {kg(ln.weight_g)}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="num">{d.points.toLocaleString("en-MY")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface Detector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}

/** Reads a member QR code with the camera, where the browser has a built-in barcode reader (Chrome, Android). */
function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onCode);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const Ctor = (window as unknown as { BarcodeDetector: new (o: object) => Detector }).BarcodeDetector;
    const detector = new Ctor({ formats: ["qr_code"] });
    const tick = async () => {
      if (stopped || !video.current) return;
      try {
        const found = await detector.detect(video.current);
        if (found[0]) return done.current(found[0].rawValue);
      } catch {
        // a frame that is not ready yet: try the next one
      }
      timer = window.setTimeout(tick, 250);
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        void tick();
      })
      .catch(() => setError("The camera is not available. Type the member code instead."));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="scanner">
      {error ? <ErrorNote>{error}</ErrorNote> : <video ref={video} muted playsInline aria-label="Camera view" />}
      <Button variant="quiet" onClick={onClose}>
        Close camera
      </Button>
    </div>
  );
}
