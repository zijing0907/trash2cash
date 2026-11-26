import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, LocateFixed } from "lucide-react";
import { useState } from "react";

import { BinBadge } from "../components/BinBadge";
import { MapView } from "../components/MapView";
import { Skeleton } from "../components/Skeleton";
import { Button, ButtonLink, ErrorNote, Spinner } from "../components/ui";
import { api, homeApi } from "../lib/api";
import { day as showDay, dateTime, kg, pts } from "../lib/format";
import type { LatLng } from "../lib/geo";
import { useMe } from "../lib/hooks";
import { shrinkPhoto } from "../lib/photo";
import { useMyPosition } from "../lib/position";
import { useToast } from "../lib/toast";
import { HOME_STATE, SLOTS } from "../lib/home";
import type { HomePickup, Slot } from "../lib/types";

/** YYYY-MM-DD in the person's own time zone */
function isoDay(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function HomePickupPage() {
  const { data: me, isPending } = useMe();
  return (
    <div className="container app">
      <header className="app__head">
        <h1>Book a home pickup</h1>
        <p className="lead">
          For 5 kg or more: boxes, newspapers, a bag of cans, old electronics. A collector comes, weighs it at your
          door, and you get points for what they weigh.
        </p>
      </header>
      {isPending && <Spinner label="Loading…" />}
      {me === null && (
        <div className="panel">
          <p>Log in to book a pickup, so the points go to your account.</p>
          <div>
            <ButtonLink to="/login?next=/pickup">Log in</ButtonLink>
          </div>
        </div>
      )}
      {me && (
        <>
          <BookingForm />
          <MyPickups />
        </>
      )}
    </div>
  );
}

function BookingForm() {
  const qc = useQueryClient();
  const streams = useQuery({ queryKey: ["streams"], queryFn: api.streams });
  const position = useMyPosition();
  const today = new Date();
  const [chosen, setChosen] = useState<string[]>([]);
  const [roughKg, setRoughKg] = useState("");
  const [address, setAddress] = useState("");
  const [at, setAt] = useState<LatLng | null>(null);
  const [day, setDay] = useState(isoDay(new Date(today.getTime() + 86_400_000)));
  const [slot, setSlot] = useState<Slot>("morning");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // A click on the map wins; "Use my location" clears it, so the pin goes where the person is
  const pin = at ?? position.at;

  const toast = useToast();
  const book = useMutation({
    mutationFn: homeApi.book,
    onSuccess: (p) => {
      toast(`Booked for ${showDay(p.day)}. You will see here when a collector takes it`);
      setChosen([]);
      setRoughKg("");
      setNote("");
      setPhoto(null);
      void qc.invalidateQueries({ queryKey: ["home", "mine"] });
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const kgNum = Number(roughKg.replace(",", "."));
    if (chosen.length === 0) return setProblem("Choose which bins the items belong in.");
    if (!(kgNum >= 5 && kgNum <= 500))
      return setProblem("Home pickups are for 5 to 500 kg. Less fits a drop-off point.");
    if (address.trim().length < 3) return setProblem("Enter the address the collector should come to.");
    if (!pin) return setProblem("Put the pin on your home: click the map, or use your location.");
    if (!photo) return setProblem("Add a photo of the items, so the collector knows what to bring.");
    setProblem(null);
    book.mutate({ streams: chosen, rough_kg: kgNum, address, lat: pin[0], lng: pin[1], day, slot, note, photo });
  }

  return (
    <section className="account__section" aria-labelledby="book-head">
      <h2 id="book-head">What, where and when</h2>
      <form className="form form--grid form--in-section" onSubmit={submit} noValidate>
        <fieldset className="bins-fieldset">
          <legend>Which bins do the items belong in?</legend>
          {streams.isPending && <Spinner label="Loading bins…" />}
          {streams.data?.map((s) => (
            <label key={s.key} className="check">
              <input
                type="checkbox"
                checked={chosen.includes(s.key)}
                onChange={(e) => setChosen(e.target.checked ? [...chosen, s.key] : chosen.filter((k) => k !== s.key))}
              />
              <BinBadge bin={s.key} />
              <span className="muted small-print">{s.name}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>About how much, in kg</span>
          <input className="input" inputMode="decimal" value={roughKg} onChange={(e) => setRoughKg(e.target.value)} />
          <small className="field__help">A guess is fine. Points come from the collector’s scale, not from this.</small>
        </label>
        <label className="field">
          <span>Address</span>
          <input className="input" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
          <small className="field__help">Only you, admins and the collector who takes the pickup see it.</small>
        </label>
        <div className="field">
          <span>Your home on the map</span>
          <Button
            small
            variant="secondary"
            onClick={() => {
              setAt(null);
              position.locate();
            }}
            busy={position.busy}
          >
            <LocateFixed size={16} aria-hidden /> Use my location
          </Button>
          {position.problem && <small className="field__help">{position.problem}</small>}
        </div>
        <MapView
          className="map--picker"
          label="Click your home to put the pin there"
          pins={[]}
          picked={pin}
          onPick={setAt}
        />
        <label className="field">
          <span>Day</span>
          <input
            className="input"
            type="date"
            value={day}
            min={isoDay(today)}
            max={isoDay(new Date(today.getTime() + 14 * 86_400_000))}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <fieldset className="report__level">
          <legend>Time of day</legend>
          {(Object.keys(SLOTS) as Slot[]).map((s) => (
            <label key={s} className="check">
              <input type="radio" name="slot" checked={slot === s} onChange={() => setSlot(s)} />
              {SLOTS[s]}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>A note for the collector (optional)</span>
          <input
            className="input"
            maxLength={200}
            value={note}
            placeholder="Gate code, which floor…"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="field">
          <span>A photo of the items</span>
          <label className="btn btn--secondary filebtn">
            <Camera size={18} aria-hidden />
            {photo ? "Change the photo" : "Add a photo"}
            <input
              type="file"
              accept="image/*"
              aria-label="Photo of the items"
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
          {photo && <small className="field__help">Photo added</small>}
        </div>
        {problem && (
          <p role="alert" className="notice">
            {problem}
          </p>
        )}
        {book.error && <ErrorNote>{book.error.message}</ErrorNote>}
        <div className="actions">
          <Button type="submit" busy={book.isPending || preparing}>
            Book the pickup
          </Button>
        </div>
      </form>
    </section>
  );
}

function MyPickups() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["home", "mine"], queryFn: homeApi.mine, refetchInterval: 60_000 });
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: homeApi.cancel,
    onSuccess: () => toast("Pickup cancelled"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["home", "mine"] }),
  });
  return (
    <section className="account__section" aria-labelledby="mine-head">
      <h2 id="mine-head">Your pickups</h2>
      {list.isPending && <Skeleton label="Loading your pickups…" lines={3} />}
      {list.error && <ErrorNote>{list.error.message}</ErrorNote>}
      {cancel.error && <ErrorNote>{cancel.error.message}</ErrorNote>}
      {list.data && list.data.length === 0 && <p className="empty">You have not booked a pickup yet.</p>}
      {list.data && list.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Items</th>
                <th scope="col">State</th>
                <th scope="col">
                  <span className="visually-hidden">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((p) => (
                <PickupRow key={p.id} p={p} onCancel={() => cancel.mutate(p.id)} cancelling={cancel.isPending} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PickupRow({ p, onCancel, cancelling }: { p: HomePickup; onCancel: () => void; cancelling: boolean }) {
  const weighed = p.weighed.reduce((sum, l) => sum + l.weight_g, 0);
  return (
    <tr>
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
      <td>
        <span className={`status ${p.status === "taken" ? "status--soon" : ""}`}>{HOME_STATE[p.status]}</span>
        <span className="small-print status__last">
          {p.status === "taken" && p.collector && `${p.collector.name} is coming`}
          {p.status === "done" && `${kg(weighed)} weighed at the door, ${pts(p.points ?? 0)}`}
          {p.status === "missed" && p.missed_reason}
          {p.status === "requested" && `Booked ${dateTime(p.created_at)}`}
        </span>
      </td>
      <td>
        {p.status === "requested" && (
          <Button small variant="quiet" onClick={onCancel} busy={cancelling}>
            Cancel
          </Button>
        )}
      </td>
    </tr>
  );
}
