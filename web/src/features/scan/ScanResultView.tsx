import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Heart, RotateCcw, ScanLine, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PhotoWithBox } from "../../components/PhotoWithBox";
import { ProbBars } from "../../components/ProbBars";
import { Button, ErrorNote } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe, useModelInfo } from "../../lib/hooks";
import { percent } from "../../lib/image";
import { binInfo, classesIn, classInfo, OTHER_LABEL } from "../../lib/recycling";
import { binLevelAnswer, type ClassProb, type ScanResult } from "../../lib/types";
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
  // Not sure of the item but sure of the bin (say, glass of an unclear colour): name the bin, ask which item
  const binLevel = binLevelAnswer({ ...result, user_label: label });
  const binClasses = binLevel ? classesIn(binLevel, model?.bins) : [];

  return (
    <div className="scan-grid scan-grid--result">
      {/* The answer first (on phones it is all that fits on the first screen); the photo and heat map follow */}
      <div className="panel" aria-live="polite">
        {/* Safety first: shown above any answer, until the user says what the item is */}
        {result.battery_warning && !label && <BatteryWarning chance={result.battery_chance ?? 0} />}

        {item && bin ? (
          <Verdict item={item} bin={bin} confidence={fromUser ? null : result.confidence} fromUser={fromUser} />
        ) : label === OTHER_LABEL ? (
          <div className="notsure" data-capture="other">
            <h2>Thanks, noted as “something else”</h2>
            <p>
              The model only knows 12 kinds of items so far. Your answer helps us decide what to teach it next. For
              now, check the{" "}
              <Link to="/guide" className="link">
                bin guide
              </Link>{" "}
              or ask your local recycling centre.
            </p>
          </div>
        ) : binLevel ? (
          <BinVerdict bin={binLevel} confidence={result.bin_confidence ?? 0} classes={binClasses} top3={result.top3} />
        ) : (
          <NotSure result={result} onPick={(l) => saveLabel.mutate(l)} busy={saveLabel.isPending} />
        )}

        {saveLabel.error && <ErrorNote>{saveLabel.error.message}</ErrorNote>}

        {/* Confirm or correct a confident answer */}
        {item && !label && !picking && (
          <div className="confirm">
            <p>Did we get it right?</p>
            <div>
              <Button
                variant="secondary"
                small
                onClick={() => saveLabel.mutate(result.predicted_class)}
                busy={saveLabel.isPending}
              >
                <Check size={16} aria-hidden /> Yes
              </Button>
              <Button variant="secondary" small onClick={() => setPicking(true)}>
                <X size={16} aria-hidden /> No, it's…
              </Button>
            </div>
          </div>
        )}
        {/* After a bin-level answer, ask which of the bin's items it was: the label the next model learns from */}
        {binLevel && !picking && (
          <div className="confirm" data-capture="which-one">
            <p>Which one is it? Your answer teaches the model.</p>
            <div>
              {binClasses.map((c) => (
                <Button
                  key={c}
                  variant="secondary"
                  small
                  onClick={() => saveLabel.mutate(c)}
                  disabled={saveLabel.isPending}
                >
                  {classInfo(c).name}
                </Button>
              ))}
              <Button variant="secondary" small onClick={() => setPicking(true)}>
                Something else
              </Button>
            </div>
          </div>
        )}
        {label && !picking && (
          <p className="thanks">
            <Check size={16} aria-hidden /> Thanks! Your answer helps train the next model.
            <Button variant="quiet" small onClick={() => setPicking(true)}>
              Change
            </Button>
          </p>
        )}
        {picking && (
          <div className="panel" data-capture="labels">
            <h3>What is it really?</h3>
            <LabelPicker onPick={(l) => saveLabel.mutate(l)} busy={saveLabel.isPending} />
          </div>
        )}

        <details className="more" data-capture="top3">
          <summary>The model’s top 3 guesses</summary>
          <div className="more__body">
            <ProbBars top3={result.top3} threshold={result.threshold} />
            <p className="muted small-print">
              The green mark sits at {percent(result.threshold)}: below it, the model says it is not sure.
              {result.zoomed && " With zoom search, the answer blends the whole photo with the five crops the model was surest about."}{" "}
              Model {result.model_version}, answered in {Math.round(result.latency_ms)} ms.
            </p>
          </div>
        </details>

        {donated && (
          <p className="thanks">
            <Heart size={16} aria-hidden /> Photo donated. Thank you!
            <Button variant="quiet" small onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>
              Delete it
            </Button>
          </p>
        )}

        <div className="actions">
          <Button onClick={onReset}>
            <ScanLine size={18} aria-hidden /> Scan another item
          </Button>
          {me === null && (
            <Link to="/signup" className="link">
              Sign up to keep your scan history
            </Link>
          )}
        </div>
      </div>

      <div className="panel">
        <PhotoWithBox
          src={photoUrl}
          box={result.crop_box}
          label={result.zoomed ? "Found the item here" : "What the model saw"}
        />
        <GradCamPanel file={file} classIndex={result.class_index} className={result.predicted_class} zoom={zoom} />
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
  return (
    <div className={`answer ${b.cls}`} data-capture="answer">
      <div className="answer__top">
        <p className="answer__said">
          {fromUser ? "You said" : "It's"} {c.name.toLowerCase()}
          {confidence !== null && ` · ${percent(confidence)} sure`}. It goes in the
        </p>
        <h2>{b.title}</h2>
      </div>
      <div className="answer__body">
        <p>{b.where}</p>
        {c.tips.length > 0 && (
          <div>
            <p className="label">Before you bin it</p>
            <ul>
              {c.tips.map((t) => (
                <li key={t}>
                  <Check size={16} aria-hidden />
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

/** Sure of the bin, not of the item: the bin in its colour, what goes in it, and the tips for those items. */
function BinVerdict({
  bin,
  confidence,
  classes,
  top3,
}: {
  bin: string;
  confidence: number;
  classes: string[];
  top3: ClassProb[];
}) {
  const b = binInfo(bin);
  // Tips for the items the model was weighing up first, then the bin's other items; no repeats, at most four
  const rank = (c: string) => {
    const i = top3.findIndex((p) => p.class === c);
    return i === -1 ? top3.length : i;
  };
  const ordered = [...classes].sort((x, y) => rank(x) - rank(y));
  const tips = [...new Set(ordered.flatMap((c) => classInfo(c).tips))].slice(0, 4);
  return (
    <div className={`answer ${b.cls}`} data-capture="bin-answer">
      <div className="answer__top">
        <p className="answer__said">
          {b.itemsAre
            ? `It’s ${b.itemsAre}, but we can’t tell ${b.tellApart}. We’re ${percent(confidence)} sure of the bin. It goes in the`
            : `We can’t tell exactly what it is, but we’re ${percent(confidence)} sure of the bin. It goes in the`}
        </p>
        <h2>{b.title}</h2>
      </div>
      <div className="answer__body">
        <p>{b.where}</p>
        {tips.length > 0 && (
          <div>
            <p className="label">Before you bin it</p>
            <ul>
              {tips.map((t) => (
                <li key={t}>
                  <Check size={16} aria-hidden />
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

/** A battery in a household bin can start a fire in the rubbish truck, so even a small chance is mentioned. */
function BatteryWarning({ chance }: { chance: number }) {
  return (
    <div className="warn bin-ewaste" role="note" data-capture="battery">
      <TriangleAlert size={20} aria-hidden />
      <div>
        <h2>This could be a battery</h2>
        <p>
          The model gives it a {percent(chance)} chance. Batteries never go in a household bin: they can start fires in
          rubbish trucks. If it is one, take it to an e-waste collection point.
        </p>
      </div>
    </div>
  );
}

function NotSure({ result, onPick, busy }: { result: ScanResult; onPick: (l: string) => void; busy: boolean }) {
  const [all, setAll] = useState(false);
  return (
    <div className="notsure" data-capture="notsure">
      <div>
        <h2>Not sure. Which one is it?</h2>
        <p className="notsure__line">
          The model is only {percent(result.confidence)} sure, so we won’t guess. Pick the right one and we’ll tell you
          where it goes.
        </p>
      </div>
      <div className="notsure__choices">
        {result.top3.map((p) => {
          const info = classInfo(p.class);
          const Icon = info.icon;
          return (
            <button
              key={p.class}
              type="button"
              disabled={busy}
              onClick={() => onPick(p.class)}
              className="choice choice--big"
            >
              <Icon size={18} aria-hidden />
              {info.name}
              <span className="pct">{percent(p.prob)}</span>
            </button>
          );
        })}
      </div>
      {all ? (
        <LabelPicker onPick={onPick} busy={busy} />
      ) : (
        <div>
          <Button variant="secondary" small onClick={() => setAll(true)}>
            None of these
          </Button>
        </div>
      )}
      <p className="retake">
        <RotateCcw size={14} aria-hidden />
        Or retake the photo: one item, filling the square, in good light. Try “Find the item for me” if it is small.
      </p>
    </div>
  );
}
