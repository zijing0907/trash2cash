import { clsx } from "clsx";
import { CircleAlert, LoaderCircle } from "lucide-react";
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
  return <Link className={classes(variant, small, className)} {...rest} />;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="status">
      <LoaderCircle className="spin" size={20} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="notice">
      <CircleAlert size={16} aria-hidden />
      <div>{children}</div>
      {action}
    </div>
  );
}
