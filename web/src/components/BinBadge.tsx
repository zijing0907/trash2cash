import { binInfo } from "../lib/recycling";

export function BinBadge({ bin }: { bin: string | null | undefined }) {
  const info = binInfo(bin);
  const Icon = info.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: info.tint, color: info.color }}
    >
      <Icon className="size-3.5" aria-hidden />
      {info.title}
    </span>
  );
}
