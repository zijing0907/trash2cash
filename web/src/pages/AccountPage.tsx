import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { Link } from "react-router";

import { BinBadge } from "../components/BinBadge";
import { MemberQR } from "../components/MemberQR";
import { Button, ButtonLink, ErrorNote, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { dateTime, kg } from "../lib/format";
import { useMe } from "../lib/hooks";
import { ScanHistory } from "./HistoryPage";

export function AccountPage() {
  const { data: me, isPending } = useMe();
  if (isPending) return <Spinner label="Loading…" />;
  if (!me) {
    return (
      <div className="container gone">
        <h1>Your account lives here</h1>
        <p className="lead">Log in to see your points, your member card and everything you’ve scanned.</p>
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
      <MemberCard />
      <PointsHistory />
      <Vouchers />
      <ScanHistory />
    </div>
  );
}

function MemberCard() {
  const card = useQuery({ queryKey: ["points", "card"], queryFn: api.card });
  if (card.isPending) return <Spinner label="Loading your card…" />;
  if (card.error) return <ErrorNote>{card.error.message}</ErrorNote>;
  const c = card.data;
  return (
    <section className="member" aria-label="Member card">
      <div className="member__balance">
        <p className="label">Your points</p>
        <p className="figure-num member__figure">{c.balance.toLocaleString("en-MY")}</p>
        <p>
          Hand in sorted recycling at a drop-off point, or{" "}
          <Link to="/pickup" className="link">
            book a home pickup
          </Link>{" "}
          for 5 kg or more. Staff weigh it and add the points here.
        </p>
        <ButtonLink to="/rewards" variant="secondary">
          <Gift size={18} aria-hidden /> See rewards
        </ButtonLink>
      </div>
      <figure className="member__card">
        <MemberQR code={c.member_code} />
        <figcaption>
          <span className="member__code">{c.member_code}</span>
          Show this at the counter, or read the code out.
        </figcaption>
      </figure>
    </section>
  );
}

function PointsHistory() {
  const q = useInfiniteQuery({
    queryKey: ["points", "history"],
    queryFn: ({ pageParam }) => api.points(pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next_before,
  });
  return (
    <section className="account__section" aria-labelledby="points-head">
      <h2 id="points-head">Points history</h2>
      {q.isPending && <Spinner label="Loading your points…" />}
      {q.error && <ErrorNote>{q.error.message}</ErrorNote>}
      {q.data && q.data.pages[0]!.items.length === 0 && (
        <p className="empty">
          No points yet. Take your sorted recycling to a drop-off point; the points appear here as soon as staff
          weigh it. <Link to="/rewards#where" className="link">Where to hand it in</Link>
        </p>
      )}
      {q.data && q.data.pages[0]!.items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">What</th>
              <th scope="col" className="num">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {q.data.pages
              .flatMap((p) => p.items)
              .map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{dateTime(e.created_at)}</td>
                  <td>
                    {e.reason === "deposit" ? (
                      <>
                        <span className="table__main">Handed in at {e.point_name}</span>
                        <span className="table__lines">
                          {e.lines.map((ln) => (
                            <span key={ln.stream_key}>
                              <BinBadge bin={ln.stream_key} /> {kg(ln.weight_g)}
                            </span>
                          ))}
                        </span>
                      </>
                    ) : e.reason === "redemption" ? (
                      <span className="table__main">Redeemed: {e.reward_name}</span>
                    ) : (
                      <span className="table__main">Adjustment</span>
                    )}
                  </td>
                  <td className={e.delta >= 0 ? "num plus" : "num"}>
                    {e.delta >= 0 ? "+" : "−"}
                    {Math.abs(e.delta).toLocaleString("en-MY")}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {q.hasNextPage && (
        <div className="more-rows">
          <Button variant="secondary" onClick={() => q.fetchNextPage()} busy={q.isFetchingNextPage}>
            Show older
          </Button>
        </div>
      )}
    </section>
  );
}

function Vouchers() {
  const q = useQuery({ queryKey: ["points", "redemptions"], queryFn: api.redemptions });
  if (!q.data || q.data.length === 0) return null;
  return (
    <section className="account__section" aria-labelledby="vouchers-head">
      <h2 id="vouchers-head">My vouchers</h2>
      <ul className="vouchers">
        {q.data.map((r) => (
          <li key={r.id}>
            <span className="table__main">{r.reward_name}</span>
            <span className="voucher-code">{r.code}</span>
            <span className="muted">
              {r.used_at ? `Collected ${dateTime(r.used_at)}` : "Not collected yet: show this code at a drop-off point"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
