import { clsx } from "clsx";
import { CircleAlert, LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition " +
  "disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]";
const variants: Record<Variant, string> = {
  primary: "bg-leaf-600 text-white shadow-sm hover:bg-leaf-700",
  secondary: "border border-line bg-white text-ink hover:border-leaf-400 hover:bg-leaf-50",
  ghost: "text-ink-soft hover:bg-paper-deep hover:text-ink",
};
const sizes = { md: "px-5 py-2.5 text-sm", lg: "px-6 py-3.5 text-base" };

interface Common {
  variant?: Variant;
  size?: keyof typeof sizes;
  className?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  busy,
  children,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} disabled={busy || rest.disabled} {...rest}>
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", className, ...rest }: Common & LinkProps) {
  return <Link className={clsx(base, variants[variant], sizes[size], className)} {...rest} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("rounded-3xl border border-line/70 bg-white shadow-card", className)}>{children}</div>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-ink-soft">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-leaf-600">{children}</p>;
}
