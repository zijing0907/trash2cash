import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Search } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { BinBadge } from "../components/BinBadge";
import { CountUp } from "../components/CountUp";
import { DrawnCheck } from "../components/DrawnCheck";
import { RoleGate } from "../components/RoleGate";
import { Skeleton } from "../components/Skeleton";
import { Button, ErrorNote, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { dateTime, kg, pts, time } from "../lib/format";
import { useMe } from "../lib/hooks";
import type { DepositOut, ResidentLookup, Voucher } from "../lib/types";

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
  if (points.error || streams.error)
    return (
      <ErrorNote
        onRetry={() => {
          void points.refetch();
          void streams.refetch();
        }}
      >
        {(points.error ?? streams.error)!.message}
      </ErrorNote>
    );
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
        <div className="side-stack">
          <VoucherCheck />
          <Today pointId={point.id} isAdmin={isAdmin} />
        </div>
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
  const codeInput = useRef<HTMLInputElement>(null);
  const weightInputs = useRef<(HTMLInputElement | null)[]>([]);

  // The counter is ready to type into, and "/" brings the cursor back to the member code from anywhere
  useEffect(() => {
    codeInput.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        codeInput.current?.focus();
        codeInput.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const find = useMutation({ mutationFn: (c: string) => api.findResident(c), onSuccess: setMember });
  // Once a member is found, straight on to the first bin's weight
  useEffect(() => {
    if (member) weightInputs.current[0]?.focus();
  }, [member]);
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
    setTimeout(() => codeInput.current?.focus(), 0); // ready for the next person
  }

  if (receipt) {
    return (
      <section className="slip" aria-live="polite">
        <p className="slip__done">
          <DrawnCheck size={22} /> Credited <CountUp to={receipt.points} duration={700} format={pts} /> to{" "}
          {receipt.resident_name}
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
        {receipt.balance_after !== null && (
          <p>
            New balance:{" "}
            <CountUp from={receipt.balance_after - receipt.points} to={receipt.balance_after} format={pts} />
          </p>
        )}
        <div className="actions">
          <Button onClick={next}>Next member</Button>
          <Button
            variant="secondary"
            onClick={() => {
              const again = receipt.member_code;
              next();
              setCode(again);
              find.mutate(again);
            }}
          >
            Same member again
          </Button>
        </div>
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
            ref={codeInput}
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
        <p className="small-print muted kbd-hint">
          Press <kbd>/</kbd> to type a code from anywhere. <kbd>Enter</kbd> moves to the next bin, and credits on the
          last one.
        </p>
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
            {bins.map((s, i) => {
              const v = Number((weights[s.key] ?? "").replace(",", "."));
              return (
                <label key={s.key} className="slip__bin">
                  <BinBadge bin={s.key} />
                  <span className="muted small-print">{s.name}</span>
                  <input
                    ref={(el) => {
                      weightInputs.current[i] = el;
                    }}
                    className="input input--weight"
                    inputMode="decimal"
                    enterKeyHint={i < bins.length - 1 ? "next" : "done"}
                    value={weights[s.key] ?? ""}
                    onChange={(e) => setWeights((w) => ({ ...w, [s.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      // Enter steps to the next bin; on the last one it credits, as the form would
                      if (e.key === "Enter" && i < bins.length - 1) {
                        e.preventDefault();
                        weightInputs.current[i + 1]?.focus();
                      }
                    }}
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

/** A resident shows a voucher code: check what it is for, then hand the reward over (once). */
function VoucherCheck() {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Voucher | null>(null);
  const [confirming, setConfirming] = useState(false);
  const look = useMutation({ mutationFn: (c: string) => api.voucher(c), onSuccess: setFound });
  const collect = useMutation({
    mutationFn: (c: string) => api.collectVoucher(c),
    onSuccess: (v) => {
      setFound(v);
      setConfirming(false);
    },
  });
  return (
    <section aria-labelledby="voucher-head">
      <h2 id="voucher-head" className="side-head">
        Collect a voucher
      </h2>
      <form
        className="slip__find voucher-find"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setFound(null);
          collect.reset();
          if (code.trim()) look.mutate(code);
        }}
      >
        <label className="field">
          <span>Voucher code</span>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="For example 9HXW-2RTD"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <Button type="submit" variant="secondary" busy={look.isPending}>
          Check
        </Button>
      </form>
      {look.error && <ErrorNote>{look.error.message}</ErrorNote>}
      {found && (
        <div className="voucher-found" aria-live="polite">
          <p className="table__main">{found.reward_name}</p>
          <p className="muted small-print">
            For {found.member_name} ({found.member_code}), claimed {dateTime(found.created_at)}
          </p>
          {found.used_at ? (
            <p className={collect.isSuccess ? "voucher-state voucher-state--done" : "voucher-state"}>
              {collect.isSuccess ? <Check size={16} aria-hidden /> : null}
              {collect.isSuccess ? "Handed over. " : "Already collected "}
              {dateTime(found.used_at)}
            </p>
          ) : confirming ? (
            <span className="confirm-inline">
              <span>Hand it over now?</span>
              <Button small onClick={() => collect.mutate(found.code)} busy={collect.isPending}>
                Mark collected
              </Button>
              <Button small variant="quiet" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button small variant="secondary" onClick={() => setConfirming(true)}>
              Hand over
            </Button>
          )}
          {collect.error && <ErrorNote>{collect.error.message}</ErrorNote>}
        </div>
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
      {q.isPending && <Skeleton label="Loading today’s deposits…" lines={3} />}
      {q.error && <ErrorNote onRetry={() => void q.refetch()}>{q.error.message}</ErrorNote>}
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
