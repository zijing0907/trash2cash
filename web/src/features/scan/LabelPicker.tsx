import { CircleHelp } from "lucide-react";

import { useModelInfo } from "../../lib/hooks";
import { CLASSES, classInfo, OTHER_LABEL } from "../../lib/recycling";

/** Every class the model knows, plus "something else". Used to confirm or correct an answer. */
export function LabelPicker({ onPick, busy }: { onPick: (label: string) => void; busy?: boolean }) {
  const { data: model } = useModelInfo();
  const names = model?.class_names ?? Object.keys(CLASSES);
  return (
    <div className="labels">
      {names.map((c) => {
        const info = classInfo(c);
        const Icon = info.icon;
        return (
          <button key={c} type="button" disabled={busy} onClick={() => onPick(c)} className="choice">
            <Icon size={16} aria-hidden />
            {info.name}
          </button>
        );
      })}
      <button type="button" disabled={busy} onClick={() => onPick(OTHER_LABEL)} className="choice choice--other">
        <CircleHelp size={16} aria-hidden />
        Something else
      </button>
    </div>
  );
}
