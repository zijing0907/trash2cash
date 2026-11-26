import { clsx } from "clsx";
import { CircleAlert, LoaderCircle, RotateCw } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

type Variant = "primary" | "secondary" | "quiet";

interface Common {
  variant?: Variant;
  small?: boolean;
  className?: string;
}

function classes(variant: Variant, small: boolean | undefined, className?: string) {
  return clsx("btn", variant !== "primary" && `btn--${variant}`, small && "btn--small", className);
}

export function Button({
  variant = "primary",
  small,
  className,
  busy,
  children,
  type = "button",
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type={type}
      className={classes(variant, small, className)}
      disabled={busy || rest.disabled}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <LoaderCircle className="spin" size={16} aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", small, className, ...rest }: Common & LinkProps) {
  return <Link className={classes(variant, small, className)} viewTransition {...rest} />;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="status">
      <LoaderCircle className="spin" size={20} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** Something went wrong, said plainly. `onRetry` adds "Try again" (for anything that failed to load). */
export function ErrorNote({
  children,
  action,
  onRetry,
}: {
  children: ReactNode;
  action?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="notice">
      <CircleAlert size={16} aria-hidden />
      <div>{children}</div>
      {action}
      {onRetry && (
        <Button small variant="secondary" className="notice__retry" onClick={onRetry}>
          <RotateCw size={14} aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}
