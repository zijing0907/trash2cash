import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";

import { BinBadge } from "../components/BinBadge";
import { Skeleton } from "../components/Skeleton";
import { Button, ButtonLink, ErrorNote } from "../components/ui";
import { api } from "../lib/api";
import { pts } from "../lib/format";
import { useMe } from "../lib/hooks";
import type { Redemption, Reward } from "../lib/types";

export function RewardsPage() {
  const { data: me } = useMe();
  const rewards = useQuery({ queryKey: ["rewards"], queryFn: api.rewards });
  const card = useQuery({ queryKey: ["points", "card"], queryFn: api.card, enabled: !!me });
  const [claimed, setClaimed] = useState<Redemption | null>(null);
  const balance = card.data?.balance ?? null;

  return (
    <div className="container app">
      <header className="app__head">
        <h1>Rewards</h1>
        <p className="lead">
          {me === null
            ? "Earn points by handing in sorted recycling at a drop-off point, then spend them here."
            : balance === null
              ? "Spend the points you earn at drop-off points."
              : `You have ${pts(balance)} to spend.`}
        </p>
      </header>

      {claimed && (
        <div className="claimed" role="status">
          <Check size={20} aria-hidden />
          <div>
            <p className="table__main">{claimed.reward_name} is yours.</p>
            <p>
              Show this code to collect it: <span className="voucher-code">{claimed.code}</span>. It is also under My
              vouchers in your account.
            </p>
          </div>
        </div>
      )}

      {rewards.isPending && <Skeleton label="Loading rewards…" />}
      {rewards.error && <ErrorNote onRetry={() => void rewards.refetch()}>{rewards.error.message}</ErrorNote>}
      {rewards.data && rewards.data.length === 0 && <p className="empty">No rewards are on offer right now.</p>}
      {rewards.data && rewards.data.length > 0 && (
        <>
          {rewards.data.some((r) => r.is_demo) && (
            <p className="demo-note">Sample rewards from the demo data, not a real offer.</p>
          )}
          <ul className="rewards">
            {rewards.data.map((r, i) => (
              <RewardRow key={r.id} i={i} reward={r} balance={balance} signedIn={!!me} onClaimed={setClaimed} />
            ))}
          </ul>
        </>
      )}

      <WhereToHandIn />
    </div>
  );
}

function RewardRow(props: {
  reward: Reward;
  balance: number | null;
  /** Position in the list, for the order the rows arrive in */
  i: number;
  signedIn: boolean;
  onClaimed: (r: Redemption) => void;
}) {
  const { reward: r, balance } = props;
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const redeem = useMutation({
    mutationFn: () => api.redeem(r.id),
    onSuccess: (red) => {
      setConfirming(false);
      props.onClaimed(red);
      void qc.invalidateQueries({ queryKey: ["points"] });
      void qc.invalidateQueries({ queryKey: ["rewards"] });
    },
  });
  const short = balance !== null ? r.cost_points - balance : null;
  const soldOut = r.stock === 0;

  return (
    <li className="reward" style={{ "--i": props.i } as React.CSSProperties}>
      <div>
        <h2 className="reward__name">{r.name}</h2>
        {r.description && <p>{r.description}</p>}
        {r.stock !== null && <p className="muted small-print">{soldOut ? "None left" : `${r.stock} left`}</p>}
      </div>
      <p className="figure-num reward__cost">{pts(r.cost_points)}</p>
      <div className="reward__act">
        {!props.signedIn ? (
          <ButtonLink to="/login?next=/rewards" variant="secondary" small>
            Log in to redeem
          </ButtonLink>
        ) : soldOut ? (
          <span className="muted">Sold out</span>
        ) : short !== null && short > 0 && balance !== null ? (
          <div className="progress">
            <span className="progress__track" aria-hidden>
              <span className="progress__bar" style={{ width: `${(balance / r.cost_points) * 100}%` }} />
            </span>
            <span className="muted small-print">{pts(short)} to go</span>
          </div>
        ) : confirming ? (
          <div className="confirm-inline">
            <span>Spend {pts(r.cost_points)}?</span>
            <Button small onClick={() => redeem.mutate()} busy={redeem.isPending}>
              Redeem
            </Button>
            <Button small variant="quiet" onClick={() => setConfirming(false)} disabled={redeem.isPending}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button small variant="secondary" onClick={() => setConfirming(true)}>
            Redeem
          </Button>
        )}
        {redeem.error && <ErrorNote>{redeem.error.message}</ErrorNote>}
      </div>
    </li>
  );
}

function WhereToHandIn() {
  const points = useQuery({ queryKey: ["drop-points"], queryFn: api.dropPoints });
  return (
    <section className="account__section" id="where" aria-labelledby="where-head">
      <h2 id="where-head">Where to hand it in</h2>
      {points.isPending && <Skeleton label="Loading drop-off points…" lines={3} />}
      {points.error && <ErrorNote onRetry={() => void points.refetch()}>{points.error.message}</ErrorNote>}
      {points.data && points.data.length === 0 && <p className="empty">No drop-off points are open yet.</p>}
      {points.data && points.data.length > 0 && (
        <>
          {points.data.some((p) => p.is_demo) && <p className="demo-note">Sample places from the demo data.</p>}
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Drop-off point</th>
                <th scope="col">Where</th>
                <th scope="col">Takes</th>
              </tr>
            </thead>
            <tbody>
              {points.data.map((p) => (
                <tr key={p.id}>
                  <td className="table__main">{p.name}</td>
                  <td>{p.address}</td>
                  <td>
                    <span className="table__lines">
                      {p.streams.map((s) => (
                        <BinBadge key={s} bin={s} />
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
