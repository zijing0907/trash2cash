import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";

import { BinBadge } from "../components/BinBadge";
import { MapView } from "../components/MapView";
import { RoleGate } from "../components/RoleGate";
import { Button, ErrorNote, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { pts } from "../lib/format";
import { parseCoords } from "../lib/geo";
import type { DropPoint, DropPointAdmin, Reward, Staff, Stream } from "../lib/types";

export function AdminSetupPage() {
  return (
    <RoleGate roles={["admin"]} next="/admin/setup">
      <div className="container app">
        <header className="app__head app__head--row">
          <h1>Setup</h1>
          <Link to="/admin" className="link">
            Back to the pickup board
          </Link>
        </header>
        <Points />
        <Rates />
        <Rewards />
        <StaffRoles />
      </div>
    </RoleGate>
  );
}

const NO_POINT = { name: "", address: "", coords: "", active: true, bins: {} as Record<string, string> };

function Points() {
  const qc = useQueryClient();
  const points = useQuery({ queryKey: ["admin", "points"], queryFn: api.adminPoints });
  const streams = useQuery({ queryKey: ["streams"], queryFn: api.streams });
  const [editing, setEditing] = useState<DropPointAdmin | null>(null);
  const [form, setForm] = useState(NO_POINT);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.savePoint>[1]) => api.savePoint(editing?.id ?? null, body),
    onSuccess: () => {
      setEditing(null);
      setForm(NO_POINT);
      for (const key of [["admin", "points"], ["drop-points"], ["admin", "board"]]) void qc.invalidateQueries({ queryKey: key });
    },
  });
  function edit(p: DropPointAdmin) {
    setEditing(p);
    setProblem(null);
    setForm({ name: p.name, address: p.address, coords: `${p.lat}, ${p.lng}`, active: p.active,
              bins: Object.fromEntries(p.bins.map((b) => [b.stream_key, String(b.capacity_kg)])) });  // prettier-ignore
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const coords = parseCoords(form.coords);
    const bins = Object.entries(form.bins)
      .filter(([, v]) => v.trim() !== "")
      .map(([stream_key, v]) => ({ stream_key, capacity_kg: Math.round(Number(v)) }));
    if (!coords) return setProblem("Paste the map position as two numbers, latitude then longitude, e.g. 4.3375, 101.1436.");
    if (!bins.length) return setProblem("Give at least one bin a size in kg.");
    if (bins.some((b) => !(b.capacity_kg > 0))) return setProblem("Bin sizes must be whole numbers of kg above 0.");
    setProblem(null);
    save.mutate({ name: form.name.trim(), address: form.address.trim(), lat: coords[0], lng: coords[1], active: form.active, bins });
  }
  return (
    <section className="account__section" aria-labelledby="points-head">
      <h2 id="points-head">Drop-off points</h2>
      {points.isPending && <Spinner label="Loading drop-off points…" />}
      {points.error && <ErrorNote onRetry={() => void points.refetch()}>{points.error.message}</ErrorNote>}
      {points.data && points.data.length === 0 && <p className="empty">No drop-off points yet. Add the first one below.</p>}
      {points.data && points.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Drop-off point</th>
              <th scope="col">Bins and sizes</th>
              <th scope="col">Open</th>
              <th scope="col">
                <span className="visually-hidden">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {points.data.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="table__main">{p.name}</span>
                  <span className="muted small-print">
                    {p.address}
                    {p.is_demo && ", sample"}
                  </span>
                </td>
                <td>
                  <span className="table__lines">
                    {p.bins.map((b) => (
                      <span key={b.stream_key}>
                        <BinBadge bin={b.stream_key} /> {b.capacity_kg}&nbsp;kg
                      </span>
                    ))}
                  </span>
                </td>
                <td>{p.active ? "Open" : "Closed"}</td>
                <td>
                  <Button small variant="quiet" onClick={() => edit(p)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form className="form form--grid" onSubmit={submit} noValidate>
        <h3>{editing ? `Edit ${editing.name}` : "Add a drop-off point"}</h3>
        <label className="field">
          <span>Name</span>
          <input className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Address or where to find it</span>
          <input className="input" required maxLength={200} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <label className="field">
          <span>Map position (latitude, longitude)</span>
          <input className="input" inputMode="decimal" value={form.coords} placeholder="4.3375, 101.1436"
                 onChange={(e) => setForm({ ...form, coords: e.target.value })} />
          <small className="field__help">
            Click the place on the map, or paste its coordinates from Google Maps or OpenStreetMap (right-click the place).
          </small>
        </label>
        <MapView
          className="map--picker"
          label="Click to set the drop-off point's position"
          pins={[]}
          picked={parseCoords(form.coords)}
          onPick={([lat, lng]) => setForm((f) => ({ ...f, coords: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }))}
        />
        <label className="check">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Open (residents can see it and staff can weigh deposits there)
        </label>
        <fieldset className="bins-fieldset">
          <legend>Bins it holds, with their size in kg (leave empty for none)</legend>
          {streams.data?.map((st) => (
            <label key={st.key} className="bin-size">
              <BinBadge bin={st.key} />
              <span className="muted small-print">{st.name}</span>
              <input className="input input--num" inputMode="numeric" value={form.bins[st.key] ?? ""}
                     onChange={(e) => setForm({ ...form, bins: { ...form.bins, [st.key]: e.target.value } })}
                     aria-label={`Size of the ${st.name.toLowerCase()} bin in kg`} placeholder="kg" />
            </label>
          ))}
        </fieldset>
        {(problem || save.error) && <ErrorNote>{problem ?? save.error!.message}</ErrorNote>}
        <div className="actions">
          <Button type="submit" busy={save.isPending}>
            {editing ? "Save drop-off point" : "Add drop-off point"}
          </Button>
          {editing && (
            <Button variant="quiet" onClick={() => { setEditing(null); setForm(NO_POINT); setProblem(null); }}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function Rates() {
  const streams = useQuery({ queryKey: ["streams"], queryFn: api.streams });
  return (
    <section className="account__section" aria-labelledby="rates-head">
      <h2 id="rates-head">Points and prices per bin</h2>
      <p className="small-print muted">
        Points are what residents earn per kg. The buy-back price is what a recycler pays per kg; the board uses it to
        value what was collected. Set both to your scheme’s real values.
      </p>
      {streams.isPending && <Spinner label="Loading bins…" />}
      {streams.error && <ErrorNote onRetry={() => void streams.refetch()}>{streams.error.message}</ErrorNote>}
      {streams.data && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Bin</th>
              <th scope="col">Points per kg</th>
              <th scope="col">Buy-back, RM per kg</th>
              <th scope="col">
                <span className="visually-hidden">Save</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {streams.data.map((s) => (
              <RateRow key={s.key} stream={s} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RateRow({ stream }: { stream: Stream }) {
  const qc = useQueryClient();
  const [points, setPoints] = useState(String(stream.points_per_kg));
  const [price, setPrice] = useState((stream.price_sen_per_kg / 100).toFixed(2));
  const save = useMutation({
    mutationFn: () =>
      api.updateStream(stream.key, {
        points_per_kg: Math.round(Number(points)),
        price_sen_per_kg: Math.round(Number(price.replace(",", ".")) * 100),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["streams"] }),
  });
  const changed = points !== String(stream.points_per_kg) || price !== (stream.price_sen_per_kg / 100).toFixed(2);
  return (
    <tr>
      <td>
        <BinBadge bin={stream.key} />
        <span className="muted small-print"> {stream.name}</span>
      </td>
      <td>
        <input className="input input--num" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)}
               aria-label={`Points per kg for ${stream.name}`} />
      </td>
      <td>
        <input className="input input--num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)}
               aria-label={`Buy-back price per kg for ${stream.name}`} />
      </td>
      <td>
        <Button small variant="secondary" onClick={() => save.mutate()} busy={save.isPending} disabled={!changed}>
          Save
        </Button>
        {save.error && <span className="field__error">{save.error.message}</span>}
      </td>
    </tr>
  );
}

const EMPTY = { name: "", description: "", cost_points: "", stock: "", active: true };

function Rewards() {
  const qc = useQueryClient();
  const rewards = useQuery({ queryKey: ["admin", "rewards"], queryFn: api.adminRewards });
  const [editing, setEditing] = useState<Reward | null>(null);
  const [form, setForm] = useState(EMPTY);
  const save = useMutation({
    mutationFn: () =>
      api.saveReward(editing?.id ?? null, {
        name: form.name.trim(),
        description: form.description.trim(),
        cost_points: Math.round(Number(form.cost_points)),
        stock: form.stock === "" ? null : Math.round(Number(form.stock)),
        active: form.active,
      }),
    onSuccess: () => {
      setEditing(null);
      setForm(EMPTY);
      void qc.invalidateQueries({ queryKey: ["admin", "rewards"] });
      void qc.invalidateQueries({ queryKey: ["rewards"] });
    },
  });
  function edit(r: Reward) {
    setEditing(r);
    setForm({ name: r.name, description: r.description, cost_points: String(r.cost_points),
              stock: r.stock === null ? "" : String(r.stock), active: r.active });  // prettier-ignore
  }
  return (
    <section className="account__section" aria-labelledby="rewards-head">
      <h2 id="rewards-head">Rewards</h2>
      {rewards.isPending && <Spinner label="Loading rewards…" />}
      {rewards.error && <ErrorNote onRetry={() => void rewards.refetch()}>{rewards.error.message}</ErrorNote>}
      {rewards.data && rewards.data.length === 0 && <p className="empty">No rewards yet. Add the first one below.</p>}
      {rewards.data && rewards.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Reward</th>
              <th scope="col" className="num">Cost</th>
              <th scope="col" className="num">Left</th>
              <th scope="col">Shown</th>
              <th scope="col">
                <span className="visually-hidden">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rewards.data.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="table__main">{r.name}</span>
                  {r.is_demo && <span className="muted small-print"> sample</span>}
                </td>
                <td className="num">{pts(r.cost_points)}</td>
                <td className="num">{r.stock ?? "No limit"}</td>
                <td>{r.active ? "Yes" : "Hidden"}</td>
                <td>
                  <Button small variant="quiet" onClick={() => edit(r)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        className="form form--grid"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h3>{editing ? `Edit ${editing.name}` : "Add a reward"}</h3>
        <label className="field">
          <span>Name</span>
          <input className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          <span>How to collect it</span>
          <input className="input" maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="field">
          <span>Cost in points</span>
          <input className="input" required inputMode="numeric" value={form.cost_points} onChange={(e) => setForm({ ...form, cost_points: e.target.value })} />
        </label>
        <label className="field">
          <span>How many (empty for no limit)</span>
          <input className="input" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Show it to residents
        </label>
        {save.error && <ErrorNote>{save.error.message}</ErrorNote>}
        <div className="actions">
          <Button type="submit" busy={save.isPending}>
            {editing ? "Save reward" : "Add reward"}
          </Button>
          {editing && (
            <Button variant="quiet" onClick={() => { setEditing(null); setForm(EMPTY); }}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function StaffRoles() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const staff = useQuery({ queryKey: ["admin", "staff", search], queryFn: () => api.staff(search) });
  const points = useQuery({ queryKey: ["drop-points"], queryFn: api.dropPoints });
  return (
    <section className="account__section" aria-labelledby="staff-head">
      <h2 id="staff-head">Staff</h2>
      <form
        className="search-row"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setSearch(q);
        }}
      >
        <label className="field">
          <span>Find someone by e-mail or name</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Leave empty to list staff" />
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {staff.isPending && <Spinner label="Loading…" />}
      {staff.error && <ErrorNote onRetry={() => void staff.refetch()}>{staff.error.message}</ErrorNote>}
      {staff.data && staff.data.length === 0 && <p className="empty">Nobody matches.</p>}
      {staff.data && staff.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Role</th>
              <th scope="col">Drop-off point</th>
              <th scope="col">
                <span className="visually-hidden">Save</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.data.map((u) => (
              <StaffRow key={u.id} user={u} points={points.data ?? []} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function StaffRow({ user, points }: { user: Staff; points: DropPoint[] }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<string>(user.role);
  const [point, setPoint] = useState<string>(user.drop_point_id ? String(user.drop_point_id) : "");
  const save = useMutation({
    mutationFn: () => api.setRole(user.id, { role, drop_point_id: point ? Number(point) : null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "staff"] }),
  });
  const changed = role !== user.role || point !== (user.drop_point_id ? String(user.drop_point_id) : "");
  return (
    <tr>
      <td>
        <span className="table__main">{user.display_name}</span>
        <span className="muted small-print">{user.email}</span>
      </td>
      <td>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)} aria-label={`Role of ${user.display_name}`}>
          <option value="resident">Resident</option>
          <option value="operator">Operator</option>
          <option value="admin">Admin</option>
          <option value="collector">Collector</option>
        </select>
      </td>
      <td>
        <select className="input" value={point} onChange={(e) => setPoint(e.target.value)} disabled={role === "resident" || role === "collector"}
                aria-label={`Drop-off point of ${user.display_name}`}>
          <option value="">None</option>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <Button small variant="secondary" onClick={() => save.mutate()} busy={save.isPending} disabled={!changed}>
          Save
        </Button>
        {save.error && <span className="field__error">{save.error.message}</span>}
      </td>
    </tr>
  );
}
