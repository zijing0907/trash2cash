import type { ReactNode } from "react";

import { useMe } from "../lib/hooks";
import type { Role } from "../lib/types";
import { ButtonLink, Spinner } from "./ui";

/** Shows its children to signed-in users with one of `roles`; everyone else gets a plain explanation. */
export function RoleGate({ roles, next, children }: { roles: Role[]; next: string; children: ReactNode }) {
  const { data: me, isPending } = useMe();
  if (isPending) return <Spinner label="Loading…" />;
  if (!me) {
    return (
      <div className="container gone">
        <h1>Staff only</h1>
        <p className="lead">Log in with a staff account to use this screen.</p>
        <ButtonLink to={`/login?next=${encodeURIComponent(next)}`}>Log in</ButtonLink>
      </div>
    );
  }
  if (!roles.includes(me.role)) {
    return (
      <div className="container gone">
        <h1>Staff only</h1>
        <p className="lead">Your account cannot use this screen. An admin can give it the right role.</p>
        <ButtonLink to="/me" variant="secondary">
          Back to my account
        </ButtonLink>
      </div>
    );
  }
  return <>{children}</>;
}
