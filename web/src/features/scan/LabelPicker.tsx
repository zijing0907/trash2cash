import { CircleHelp } from "lucide-react";

import { useModelInfo } from "../../lib/hooks";
import { CLASSES, classInfo, OTHER_LABEL } from "../../lib/recycling";

/** Every class the model knows, plus "something else". Used to confirm or correct an answer. */
export function LabelPicker({ onPick, busy }: { onPick: (label: string) => void; busy?: boolean }) {
  const { data: model } = useModelInfo();
  const names = model?.class_names ?? Object.keys(CLASSES);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {names.map((c) => {
        const info = classInfo(c);
        const Icon = info.icon;
        return (
          <button
            key={c}
            type="button"
            disabled={busy}
            onClick={() => onPick(c)}
            className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-left text-sm font-medium transition hover:border-leaf-400 hover:bg-leaf-50 disabled:opacity-50"
          >
            <Icon className="size-4 shrink-0 text-ink-soft" aria-hidden />
            {info.name}
          </button>
        );
      })}
      <button
        type="button"
        disabled={busy}
        onClick={() => onPick(OTHER_LABEL)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm font-medium text-ink-soft transition hover:border-leaf-400 hover:bg-leaf-50 disabled:opacity-50"
      >
        <CircleHelp className="size-4 shrink-0" aria-hidden />
        Something else
      </button>
    </div>
  );
}
