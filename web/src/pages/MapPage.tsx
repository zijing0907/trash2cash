import { useQuery } from "@tanstack/react-query";
import { LocateFixed } from "lucide-react";
import { useMemo, useState } from "react";

import { BinBadge } from "../components/BinBadge";
import { FillBar } from "../components/FillBar";
import { MapView, type Pin } from "../components/MapView";
import { Button, ErrorNote, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { howKnown } from "../lib/certainty";
import { day, kgNum, km } from "../lib/format";
import { distanceKm, type LatLng } from "../lib/geo";
import { useMyPosition } from "../lib/position";
import type { MapBin, MapPoint } from "../lib/types";

/** What the forecast says, always called an estimate */
function outlook(b: MapBin): string {
  if (b.status === "due") return "Nearly full: a pickup is due";
  if (b.status === "idle") return "No drop-offs in the last two weeks";
  return b.full_on ? `Full around ${day(b.full_on)} (estimate from the last two weeks)` : "Not filling up";
}

export function MapPage() {
  const map = useQuery({ queryKey: ["map"], queryFn: api.dropOffMap, refetchInterval: 5 * 60_000 });
  const position = useMyPosition();
  const [selected, setSelected] = useState<number | null>(null);

  // Alphabetical, or nearest first once the person shares where they are
  const points = useMemo(() => {
    const list = (map.data?.points ?? []).map((p) => ({
      ...p,
      km: position.at ? distanceKm(position.at, [p.lat, p.lng]) : null,
    }));
    return list.sort((a, b) => (a.km !== null && b.km !== null ? a.km - b.km : a.name.localeCompare(b.name)));
  }, [map.data, position.at]);

  const pins: Pin[] = points.map((p, i) => ({
    id: p.id,
    at: [p.lat, p.lng] as LatLng,
    label: String(i + 1),
    title: `${i + 1}. ${p.name}`,
    tone: p.status,
  }));

  function choose(id: number) {
    setSelected(id);
    document.getElementById(`point-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="container app">
      <header className="app__head app__head--row">
        <div>
          <h1>Drop-off points</h1>
          <p className="lead">Where to hand in recycling, and how full each bin is.</p>
        </div>
        <Button variant="secondary" onClick={position.locate} busy={position.busy}>
          <LocateFixed size={18} aria-hidden /> Nearest to me
        </Button>
      </header>
      {position.problem && <ErrorNote>{position.problem}</ErrorNote>}

      {map.isPending && <Spinner label="Loading the drop-off points…" />}
      {map.error && <ErrorNote>{map.error.message}</ErrorNote>}
      {map.data && points.length === 0 && (
        <p className="empty">No drop-off points are open yet. Once an admin adds one, it shows up here.</p>
      )}
      {map.data && points.length > 0 && (
        <>
          {points.some((p) => p.is_demo) && (
            <p className="demo-note">Demo data: sample drop-off points with generated drop-offs.</p>
          )}
          <div className="mapgrid">
            <MapView
              className="mapgrid__map"
              label="Map of the drop-off points"
              pins={pins}
              selected={selected}
              onSelect={choose}
              me={position.at}
            />
            <ol className="places">
              {points.map((p, i) => (
                <Place key={p.id} n={i + 1} point={p} distance={p.km} selected={p.id === selected} onSelect={choose} />
              ))}
            </ol>
          </div>
          <p className="small-print muted">
            There are no sensors in the bins. A bin’s fill is what staff have weighed in since it was last emptied, so
            each one says when that last happened; anything left without weighing is not counted.
          </p>
        </>
      )}
    </div>
  );
}

function Place(props: {
  n: number;
  point: MapPoint;
  distance: number | null;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  const { point: p } = props;
  const now = new Date();
  return (
    <li id={`point-${p.id}`} className={props.selected ? "place is-selected" : "place"}>
      <div className="place__head">
        <span className="figure-num place__n">{props.n}</span>
        <div>
          <h2>
            <button type="button" className="place__name" onClick={() => props.onSelect(p.id)}>
              {p.name}
            </button>
          </h2>
          <p className="muted small-print">
            {p.address}
            {props.distance !== null &&
              (props.distance < 0.1 ? ", less than 100 m away" : `, ${km(props.distance)} away in a straight line`)}
          </p>
        </div>
        <a
          className="link small-print"
          href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          Directions
        </a>
      </div>
      {p.bins.length === 0 ? (
        <p className="muted small-print">No bins set up here yet.</p>
      ) : (
        <ul className="place__bins">
          {p.bins.map((b) => {
            const known = howKnown(b, now);
            return (
              <li key={b.stream_key}>
                <BinBadge bin={b.stream_key} />
                <FillBar
                  bin={b.stream_key}
                  ratio={b.fill_ratio}
                  label={`${b.stream_name}: ${kgNum(b.fill_kg)} of ${kgNum(b.capacity_kg)}`}
                />
                <p className="small-print">
                  {kgNum(b.fill_kg)} of {kgNum(b.capacity_kg)}. {known.basis}
                  {known.stale && ", so it may be out of date"}.
                </p>
                <p className="small-print muted">{outlook(b)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
