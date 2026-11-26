import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { Link } from "react-router";

import { BinBadge } from "../components/BinBadge";
import { Skeleton } from "../components/Skeleton";
import { Button, ErrorNote } from "../components/ui";
import { api } from "../lib/api";
import { useModelInfo } from "../lib/hooks";
import { percent } from "../lib/image";
import { binInfo, classInfo, OTHER_LABEL } from "../lib/recycling";
import { binLevelAnswer, type Scan } from "../lib/types";

/** The scans part of the account page: per-bin summary and the list, newest first. */
export function ScanHistory() {
  return (
    <section className="account__section" aria-labelledby="scans-head">
      <h2 id="scans-head">My scans</h2>
      <Summary />
      <ScanList />
    </section>
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
  if (scans.isPending) return <Skeleton label="Loading your scans…" />;
  if (scans.error) return <ErrorNote onRetry={() => void scans.refetch()}>{scans.error.message}</ErrorNote>;
  const items = scans.data.pages.flatMap((p) => p.items);
  if (items.length === 0) {
    return (
      <p className="empty">
        No scans yet.{" "}
        <Link to="/scan" className="link">
          Scan an item
        </Link>{" "}
        to start your history.
      </p>
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
  const binLevel = binLevelAnswer(scan); // sure of the bin, not of the item
  const bin =
    label === OTHER_LABEL
      ? null
      : label
        ? (model?.bins[label] ?? classInfo(label).bin)
        : (binLevel ?? scan.predicted_bin);
  const info = classInfo(shown);
  const binItems = binLevel ? binInfo(binLevel).itemsAre : undefined;
  const when = new Date(scan.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <li>
      <div>
        <h3>
          {label === OTHER_LABEL
            ? "Something else"
            : binItems
              ? binItems.charAt(0).toUpperCase() + binItems.slice(1)
              : info.name}
          {label && label !== scan.predicted_class && (
            <small>model said {classInfo(scan.predicted_class).name.toLowerCase()}</small>
          )}
        </h3>
        <p>
          <time dateTime={scan.created_at}>{when}</time>,{" "}
          {binLevel
            ? `${percent(scan.bin_confidence ?? 0)} sure of the bin`
            : scan.unsure && !label
              ? "model not sure"
              : `${percent(scan.confidence)} sure`}
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
