import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";

import { BinBadge } from "../components/BinBadge";
import { RoleGate } from "../components/RoleGate";
import { Button, ErrorNote, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { pts } from "../lib/format";
import type { DropPoint, Reward, Staff, Stream } from "../lib/types";

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
        <Rates />
        <Rewards />
        <StaffRoles />
      </div>
    </RoleGate>
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
      {streams.error && <ErrorNote>{streams.error.message}</ErrorNote>}
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
      {rewards.error && <ErrorNote>{rewards.error.message}</ErrorNote>}
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
      {staff.error && <ErrorNote>{staff.error.message}</ErrorNote>}
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
        </select>
      </td>
      <td>
        <select className="input" value={point} onChange={(e) => setPoint(e.target.value)} disabled={role === "resident"}
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
