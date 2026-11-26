import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";

import type { LatLng } from "../lib/geo";
import { motionAllowed } from "../lib/motion";

export interface Pin {
  id: number;
  at: LatLng;
  /** One or two characters shown on the pin: a number in a route, or a letter */
  label: string;
  /** Read out by screen readers and shown on hover */
  title: string;
  /** due and soon pins are drawn heavier, like the board's status tags */
  tone?: "due" | "soon" | "later" | "idle";
}

interface Props {
  pins: Pin[];
  /** What the map shows, for screen readers */
  label: string;
  selected?: number | null;
  onSelect?: (id: number) => void;
  /** Straight lines between stops, in order */
  route?: LatLng[];
  /** The person's own position, if they shared it */
  me?: LatLng | null;
  /** Click to choose a position (the admin's drop-off point form) */
  onPick?: (at: LatLng) => void;
  picked?: LatLng | null;
  className?: string;
}

// The campus the demo points sit around; any real map fits itself to its pins
const DEFAULT_CENTER: LatLng = [4.3375, 101.1436];

function pinIcon(html: string, cls: string, size = 30, style = "") {
  return L.divIcon({
    className: "",
    html: `<span class="${cls}"${style ? ` style="${style}"` : ""}>${html}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * An OpenStreetMap map with square pins. Tiles are shown in grey so the pins and the route carry the colour.
 * If the tiles cannot load (offline, blocked), the pins still work and a note says so.
 */
export function MapView({ pins, label, selected, onSelect, route, me, onPick, picked, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef("");
  const dropped = useRef(false); // pins drop in once, not on every redraw
  const drawnRoute = useRef("");
  const lastSelected = useRef<number | null | undefined>(selected);
  const [tilesFailed, setTilesFailed] = useState(false);
  const select = useRef(onSelect);
  const pick = useRef(onPick);
  useEffect(() => {
    select.current = onSelect;
    pick.current = onPick;
  }, [onSelect, onPick]);

  useEffect(() => {
    const m = L.map(box.current!, { scrollWheelZoom: false, zoomSnap: 0.5 }).setView(DEFAULT_CENTER, 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .on("tileerror", () => setTilesFailed(true))
      .addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => pick.current?.([e.latlng.lat, e.latlng.lng]));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // A fresh map (also React's second mount in development) starts with nothing dropped, drawn or fitted yet
    dropped.current = false;
    drawnRoute.current = "";
    fitted.current = "";
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const moving = motionAllowed();
    if (route && route.length > 1) {
      const line = L.polyline(route, { className: "map-route", interactive: false }).addTo(g);
      // A new route draws itself from the first stop to the last, then settles into its dashes
      const routeKey = route.map((p) => p.join(",")).join(";");
      const path = line.getElement() as SVGPathElement | undefined;
      if (moving && path && routeKey !== drawnRoute.current && typeof path.getTotalLength === "function") {
        path.style.setProperty("--len", String(Math.ceil(path.getTotalLength())));
        path.classList.add("map-route--draw");
        path.addEventListener("animationend", () => path.classList.remove("map-route--draw"), { once: true });
      }
      drawnRoute.current = routeKey;
    }
    const enter = moving && !dropped.current && pins.length > 0;
    pins.forEach((p, i) => {
      const cls = `pin pin--${p.tone ?? "later"}${p.id === selected ? " is-selected" : ""}${enter ? " pin--enter" : ""}`;
      L.marker(p.at, {
        icon: pinIcon(escape(p.label), cls, 30, enter ? `--i:${i}` : ""),
        title: p.title,
        alt: p.title,
        keyboard: true,
      })
        .on("click", () => select.current?.(p.id))
        .addTo(g);
    });
    if (pins.length > 0) dropped.current = true;
    // Under the places' pins, so standing at a drop-off point never hides its number
    if (me)
      L.marker(me, {
        icon: pinIcon("", "pin pin--me", 18),
        title: "You are here",
        alt: "You are here",
        zIndexOffset: -1000,
      }).addTo(g);
    if (picked) L.marker(picked, { icon: pinIcon("", "pin pin--picked", 22), title: "Chosen position" }).addTo(g);

    // Fit the view when the set of places changes, not on every redraw (that would undo the person's zooming)
    const places = [...pins.map((p) => p.at), ...(me ? [me] : []), ...(picked ? [picked] : [])];
    const key = places.map((p) => p.join(",")).join(";");
    if (key && key !== fitted.current) {
      fitted.current = key;
      // A single place already in view (say, a spot just clicked) leaves the map where it is
      if (places.length === 1) {
        if (!m.getBounds().contains(places[0]!)) m.setView(places[0]!, Math.max(m.getZoom(), 15));
      } else m.fitBounds(L.latLngBounds(places), { padding: [36, 36], maxZoom: 16 });
    }

    // A place chosen in the list: the map flies to it (or jumps there, under reduced motion)
    if (selected !== lastSelected.current) {
      lastSelected.current = selected;
      const target = pins.find((p) => p.id === selected);
      if (target) {
        const zoom = Math.max(m.getZoom(), 16);
        if (moving) m.flyTo(target.at, zoom, { duration: 0.6 });
        else m.setView(target.at, zoom);
      }
    }
  }, [pins, selected, route, me, picked]);

  return (
    <div className={`map ${className ?? ""}`}>
      <div ref={box} className="map__canvas" role="region" aria-label={label} />
      {tilesFailed && <p className="map__note">The map background could not load. The pins still work.</p>}
    </div>
  );
}
