import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, ScanLine } from "lucide-react";

import { BinBadge } from "../components/BinBadge";
import { Button, ButtonLink, ErrorNote, Spinner } from "../components/ui";
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
      <div className="container gone">
        <h1>Your scans live here</h1>
        <p className="lead">Log in to see everything you’ve scanned and labelled.</p>
        <div className="actions">
          <ButtonLink to="/login?next=/me">Log in</ButtonLink>
          <ButtonLink to="/signup?next=/me" variant="secondary">
            Sign up
          </ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <div className="container app">
      <header className="app__head">
        <h1>Hi {me.display_name}</h1>
      </header>
      <Summary />
      <ScanList />
    </div>
  );
}

function Summary() {
  const { data } = useQuery({ queryKey: ["scans", "summary"], queryFn: api.summary });
  if (!data || data.total === 0) return null;
  return (
    <dl className="summary">
      <div>
        <dt>Items scanned</dt>
        <dd className="figure-num">{data.total}</dd>
        <dd>{data.labelled} confirmed or corrected by you</dd>
      </div>
      <div>
        <dt>Where they went</dt>
        <dd className="binbar" aria-hidden>
          {data.by_bin.map((b) => (
            <span
              key={b.bin}
              className={binInfo(b.bin).cls}
              title={`${binInfo(b.bin).title}: ${b.count}`}
              style={{ flexGrow: b.count }}
            />
          ))}
        </dd>
        <dd>
          <ul className="binlegend">
            {data.by_bin.map((b) => (
              <li key={b.bin}>
                <BinBadge bin={b.bin} /> <span className="muted">{b.count}</span>
              </li>
            ))}
          </ul>
        </dd>
      </div>
    </dl>
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
      <div className="gone">
        <h2>No scans yet</h2>
        <p>Scan your first item to start your history.</p>
        <ButtonLink to="/scan">
          <ScanLine size={18} aria-hidden /> Scan an item
        </ButtonLink>
      </div>
    );
  }
  return (
    <section>
      <ul className="scanlist">
        {items.map((s) => (
          <ScanRow key={s.id} scan={s} />
        ))}
      </ul>
      {scans.hasNextPage && (
        <div className="more-rows">
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
    <li>
      <div>
        <h3>
          {label === OTHER_LABEL ? "Something else" : info.name}
          {label && label !== scan.predicted_class && (
            <small>model said {classInfo(scan.predicted_class).name.toLowerCase()}</small>
          )}
        </h3>
        <p>
          <time dateTime={scan.created_at}>{when}</time>, {scan.unsure && !label ? "model not sure" : `${percent(scan.confidence)} sure`}
        </p>
      </div>
      {bin && <BinBadge bin={bin} />}
      {scan.photo_donated && (
        <Button
          variant="quiet"
          small
          onClick={() => deletePhoto.mutate()}
          disabled={deletePhoto.isPending}
          title="Delete the donated photo"
        >
          <Heart size={16} aria-hidden /> Delete donated photo
        </Button>
      )}
    </li>
  );
}
