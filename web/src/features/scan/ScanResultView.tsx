import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleHelp, Heart, RotateCcw, ScanLine, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PhotoWithBox } from "../../components/PhotoWithBox";
import { ProbBars } from "../../components/ProbBars";
import { Button, Card, ErrorNote } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe, useModelInfo } from "../../lib/hooks";
import { percent } from "../../lib/image";
import { binInfo, classInfo, OTHER_LABEL } from "../../lib/recycling";
import type { ScanResult } from "../../lib/types";
import { GradCamPanel } from "./GradCamPanel";
import { LabelPicker } from "./LabelPicker";

interface Props {
  result: ScanResult;
  file: File;
  photoUrl: string;
  zoom: boolean;
  onReset: () => void;
}

export function ScanResultView({ result, file, photoUrl, zoom, onReset }: Props) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: model } = useModelInfo();
  const [label, setLabel] = useState<string | null>(result.user_label);
  const [picking, setPicking] = useState(false);
  const [donated, setDonated] = useState(result.photo_donated);

  const saveLabel = useMutation({
    mutationFn: (l: string) => api.label(result.id, l),
    onSuccess: (scan) => {
      setLabel(scan.user_label);
      setPicking(false);
      void qc.invalidateQueries({ queryKey: ["scans"] });
    },
  });
  const withdraw = useMutation({ mutationFn: () => api.deletePhoto(result.id), onSuccess: () => setDonated(false) });

  // The item the answer is about: the user's own label wins; an unsure model answer is not shown as fact
  const item = label && label !== OTHER_LABEL ? label : !result.unsure && !label ? result.predicted_class : null;
  const bin = item
    ? (model?.bins[item] ?? (item === result.predicted_class ? result.predicted_bin : classInfo(item).bin))
    : null;
  // The answer came from the user (a correction, or a pick after "not sure"): show no model confidence
  const fromUser = label !== null && (result.unsure || label !== result.predicted_class);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      <div className="order-2 space-y-4 lg:order-1">
        <PhotoWithBox
          src={photoUrl}
          box={result.crop_box}
          label={result.zoomed ? "Found the item here" : "What the model saw"}
        />
        <GradCamPanel file={file} classIndex={result.class_index} className={result.predicted_class} zoom={zoom} />
      </div>

      {/* On phones the answer comes first; the photo and heat map follow */}
      <div className="order-1 space-y-4 lg:order-2" aria-live="polite">
        {item && bin ? (
          <Verdict item={item} bin={bin} confidence={fromUser ? null : result.confidence} fromUser={fromUser} />
        ) : label === OTHER_LABEL ? (
          <Card className="animate-rise p-6">
            <h2 className="text-2xl font-bold">Thanks, noted as “something else”</h2>
            <p className="mt-2 text-ink-soft">
              The model only knows 12 kinds of items so far. Your answer helps us decide what to teach it next. For
              now, check the <Link to="/guide" className="font-semibold text-leaf-700 underline">bin guide</Link> or
              ask your local recycling centre.
            </p>
          </Card>
        ) : (
          <NotSure result={result} onPick={(l) => saveLabel.mutate(l)} busy={saveLabel.isPending} />
        )}

        {saveLabel.error && <ErrorNote>{saveLabel.error.message}</ErrorNote>}

        {/* Confirm or correct a confident answer */}
        {item && !label && !picking && (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm font-medium">Did we get it right?</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => saveLabel.mutate(result.predicted_class)} busy={saveLabel.isPending}>
                <Check className="size-4" aria-hidden /> Yes
              </Button>
              <Button variant="secondary" onClick={() => setPicking(true)}>
                <X className="size-4" aria-hidden /> No, it's…
              </Button>
            </div>
          </Card>
        )}
        {label && !picking && (
          <p className="flex items-center gap-2 text-sm text-leaf-700">
            <Check className="size-4" aria-hidden /> Thanks! Your answer helps train the next model.
            <button type="button" className="ml-auto text-ink-soft underline" onClick={() => setPicking(true)}>
              Change
            </button>
          </p>
        )}
        {picking && (
          <Card className="animate-rise p-4">
            <p className="mb-3 text-sm font-semibold">What is it really?</p>
            <LabelPicker onPick={(l) => saveLabel.mutate(l)} busy={saveLabel.isPending} />
          </Card>
        )}

        <details className="group rounded-2xl border border-line bg-white p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold">
            <span className="group-open:hidden">Show the model's top 3 guesses</span>
            <span className="hidden group-open:inline">The model's top 3 guesses</span>
          </summary>
          <div className="mt-4">
            <ProbBars top3={result.top3} threshold={result.threshold} />
            <p className="mt-3 text-xs text-ink-soft">
              The line marks {percent(result.threshold)}: below it, the model says it is not sure.
              {result.zoomed && " Zoom search picked the crop it was most sure about, so its percentage is optimistic."}{" "}
              Model {result.model_version}, answered in {Math.round(result.latency_ms)} ms.
            </p>
          </div>
        </details>

        {donated && (
          <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-leaf-50 p-3 text-sm text-leaf-800">
            <Heart className="size-4" aria-hidden /> Photo donated. Thank you!
            <button
              type="button"
              className="ml-auto underline disabled:opacity-50"
              onClick={() => withdraw.mutate()}
              disabled={withdraw.isPending}
            >
              Delete it
            </button>
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Button size="lg" onClick={onReset}>
            <ScanLine className="size-5" aria-hidden /> Scan another item
          </Button>
          {me === null && (
            <Link to="/signup" className="self-center text-sm font-semibold text-leaf-700 hover:underline">
              Sign up to keep your scan history →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Verdict({
  item,
  bin,
  confidence,
  fromUser,
}: {
  item: string;
  bin: string;
  confidence: number | null;
  fromUser: boolean;
}) {
  const b = binInfo(bin);
  const c = classInfo(item);
  const BinIcon = b.icon;
  return (
    <div className="animate-rise overflow-hidden rounded-3xl shadow-card" style={{ backgroundColor: b.tint }}>
      <div className="flex items-center gap-4 p-6 text-white" style={{ backgroundColor: b.color }}>
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20">
          <BinIcon className="size-7" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-medium text-white/85">
            {fromUser ? "You said" : "It's"} {c.name.toLowerCase()}
            {confidence !== null && ` · ${percent(confidence)} sure`}. It goes in the
          </p>
          <h2 className="text-3xl font-extrabold">{b.title}</h2>
        </div>
      </div>
      <div className="space-y-4 p-6">
        <p className="text-sm text-ink">{b.where}</p>
        {c.tips.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">Before you bin it</p>
            <ul className="space-y-1.5">
              {c.tips.map((t) => (
                <li key={t} className="flex gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0" style={{ color: b.color }} aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function NotSure({ result, onPick, busy }: { result: ScanResult; onPick: (l: string) => void; busy: boolean }) {
  const [all, setAll] = useState(false);
  return (
    <Card className="animate-rise p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-paper-deep">
          <CircleHelp className="size-6 text-ink-soft" aria-hidden />
        </span>
        <div>
          <h2 className="text-2xl font-bold">Not sure. Which one is it?</h2>
          <p className="mt-1 text-sm text-ink-soft">
            The model is only {percent(result.confidence)} sure, so we won't guess. Pick the right one and we'll tell
            you where it goes.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        {result.top3.map((p) => {
          const info = classInfo(p.class);
          const Icon = info.icon;
          return (
            <button
              key={p.class}
              type="button"
              disabled={busy}
              onClick={() => onPick(p.class)}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-left transition hover:border-leaf-400 hover:bg-leaf-50 disabled:opacity-50"
            >
              <Icon className="size-5 text-ink-soft" aria-hidden />
              <span className="flex-1 font-semibold">{info.name}</span>
              <span className="text-sm tabular-nums text-ink-soft">{percent(p.prob)}</span>
            </button>
          );
        })}
      </div>
      {all ? (
        <div className="mt-4">
          <LabelPicker onPick={onPick} busy={busy} />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setAll(true)}>
            None of these
          </Button>
        </div>
      )}
      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-paper p-3 text-xs text-ink-soft">
        <RotateCcw className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Or retake the photo: one item, filling the square, in good light. Try “Find the item for me” if it is small.
      </p>
    </Card>
  );
}
