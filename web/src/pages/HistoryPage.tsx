import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, ScanLine } from "lucide-react";

import { BinBadge } from "../components/BinBadge";
import { Button, ButtonLink, Card, ErrorNote, Eyebrow, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useMe, useModelInfo } from "../lib/hooks";
import { percent } from "../lib/image";
import { binInfo, classInfo, OTHER_LABEL } from "../lib/recycling";
import type { Scan } from "../lib/types";

export function HistoryPage() {
  const { data: me, isPending } = useMe();
  if (isPending) return <Spinner label="Loading…" />;
  if (!me) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-3xl font-extrabold">Your scans live here</h1>
        <p className="mt-2 text-ink-soft">Log in to see everything you've scanned and labelled.</p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink to="/login?next=/me">Log in</ButtonLink>
          <ButtonLink to="/signup?next=/me" variant="secondary">
            Sign up
          </ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Eyebrow>My scans</Eyebrow>
      <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">Hi {me.display_name}</h1>
      <Summary />
      <ScanList />
    </div>
  );
}

function Summary() {
  const { data } = useQuery({ queryKey: ["scans", "summary"], queryFn: api.summary });
  if (!data || data.total === 0) return null;
  return (
    <section className="mt-8 grid gap-3 sm:grid-cols-3">
      <Card className="p-5">
        <p className="text-sm font-semibold text-ink-soft">Items scanned</p>
        <p className="mt-1 font-display text-4xl font-extrabold">{data.total}</p>
        <p className="mt-1 text-xs text-ink-soft">{data.labelled} confirmed or corrected by you</p>
      </Card>
      <Card className="p-5 sm:col-span-2">
        <p className="text-sm font-semibold text-ink-soft">Where they went</p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-paper-deep">
          {data.by_bin.map((b) => (
            <div
              key={b.bin}
              title={`${binInfo(b.bin).title}: ${b.count}`}
              style={{ width: `${(b.count / data.total) * 100}%`, backgroundColor: binInfo(b.bin).color }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {data.by_bin.map((b) => (
            <li key={b.bin} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: binInfo(b.bin).color }} />
              {binInfo(b.bin).title} <span className="text-ink-soft">{b.count}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function ScanList() {
  const scans = useInfiniteQuery({
    queryKey: ["scans", "list"],
    queryFn: ({ pageParam }) => api.scans(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_before,
  });
  if (scans.isPending) return <Spinner label="Loading your scans…" />;
  if (scans.error) return <ErrorNote>{scans.error.message}</ErrorNote>;
  const items = scans.data.pages.flatMap((p) => p.items);
  if (items.length === 0) {
    return (
      <Card className="mt-8 p-10 text-center">
        <p className="text-lg font-semibold">No scans yet</p>
        <p className="mt-1 text-sm text-ink-soft">Scan your first item to start your history.</p>
        <ButtonLink to="/scan" className="mt-6">
          <ScanLine className="size-4" aria-hidden /> Scan an item
        </ButtonLink>
      </Card>
    );
  }
  return (
    <section className="mt-8">
      <ul className="divide-y divide-line/70 overflow-hidden rounded-3xl border border-line/70 bg-white shadow-card">
        {items.map((s) => (
          <ScanRow key={s.id} scan={s} />
        ))}
      </ul>
      {scans.hasNextPage && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => scans.fetchNextPage()} busy={scans.isFetchingNextPage}>
            Show older scans
          </Button>
        </div>
      )}
    </section>
  );
}

function ScanRow({ scan }: { scan: Scan }) {
  const qc = useQueryClient();
  const { data: model } = useModelInfo();
  const deletePhoto = useMutation({
    mutationFn: () => api.deletePhoto(scan.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scans"] }),
  });
  const label = scan.user_label;
  const shown = label && label !== OTHER_LABEL ? label : scan.predicted_class;
  const bin = label === OTHER_LABEL ? null : label ? (model?.bins[label] ?? classInfo(label).bin) : scan.predicted_bin;
  const info = classInfo(shown);
  const when = new Date(scan.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4">
      <span className="grid size-11 place-items-center rounded-2xl" style={{ backgroundColor: binInfo(bin).tint }}>
        <info.icon className="size-5" style={{ color: binInfo(bin).color }} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {label === OTHER_LABEL ? "Something else" : info.name}
          {label && label !== scan.predicted_class && (
            <span className="ml-2 text-xs font-normal text-ink-soft">
              (model said {classInfo(scan.predicted_class).name.toLowerCase()})
            </span>
          )}
        </p>
        <p className="text-xs text-ink-soft">
          {when} · {scan.unsure && !label ? "model not sure" : `${percent(scan.confidence)} sure`}
        </p>
      </div>
      {bin && <BinBadge bin={bin} />}
      {scan.photo_donated && (
        <button
          type="button"
          onClick={() => deletePhoto.mutate()}
          disabled={deletePhoto.isPending}
          className="inline-flex items-center gap-1 text-xs text-ink-soft underline hover:text-ink disabled:opacity-50"
          title="Delete the donated photo"
        >
          <Heart className="size-3.5 text-bin-ewaste" aria-hidden /> Delete donated photo
        </button>
      )}
    </li>
  );
}
