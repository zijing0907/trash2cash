import { ArrowRight, CircleAlert, Crop, Grid3x3, Layers, ScanLine } from "lucide-react";
import type { ReactNode } from "react";

import { BinBadge } from "../components/BinBadge";
import { Card, ErrorNote, Eyebrow, Spinner } from "../components/ui";
import { useModelInfo } from "../lib/hooks";
import { percent } from "../lib/image";
import { classInfo } from "../lib/recycling";

// Labels for the test metrics notebooks 01 and 03 write into meta.json
const METRICS: Record<string, { label: string; hint: string }> = {
  test_macro_f1: { label: "Macro F1", hint: "Main metric: F1 averaged so every class counts equally" },
  test_balanced_acc: { label: "Balanced accuracy", hint: "Average recall over the 12 classes" },
  test_accuracy: { label: "Accuracy", hint: "Share of test photos classified correctly" },
  test_bin_accuracy: { label: "Right bin", hint: "Share of test photos sent to the right bin" },
};

export function ModelPage() {
  const { data: model, isPending, error } = useModelInfo();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Eyebrow>Model card</Eyebrow>
      <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">How the model works</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        A convolutional neural network trained from random weights (no pretrained models) for UECS2523 Applied
        Machine Learning. Everything on this page about the running model comes live from its own export file.
      </p>

      {isPending && <Spinner label="Asking the model about itself…" />}
      {error && (
        <div className="mt-8">
          <ErrorNote>The classifier is offline right now, so live numbers are missing. {error.message}</ErrorNote>
        </div>
      )}

      {model && (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-ink px-3 py-1 font-mono text-xs text-white">{model.version}</span>
            <span className="text-ink-soft">
              {model.class_names.length} classes · {model.img_size}×{model.img_size} px input · dataset{" "}
              <code className="text-xs">{model.dataset}</code>
            </span>
            {model.quick_run && (
              <span className="rounded-full bg-bin-orange/15 px-3 py-1 text-xs font-semibold text-bin-orange">
                Test export (2 epochs): numbers are not meaningful
              </span>
            )}
          </div>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.keys(METRICS)
              .filter((k) => k in model.metrics)
              .map((k) => (
                <Card key={k} className="p-5">
                  <p className="text-sm font-semibold text-ink-soft">{METRICS[k]!.label}</p>
                  <p className="mt-1 font-display text-4xl font-extrabold text-leaf-600">{percent(model.metrics[k]!)}</p>
                  <p className="mt-2 text-xs text-ink-soft">{METRICS[k]!.hint}</p>
                </Card>
              ))}
            <Card className="p-5">
              <p className="text-sm font-semibold text-ink-soft">“Not sure” below</p>
              <p className="mt-1 font-display text-4xl font-extrabold text-ink">{percent(model.threshold)}</p>
              <p className="mt-2 text-xs text-ink-soft">
                The lowest confidence at which the model was right at least 90% of the time on validation data
              </p>
            </Card>
          </section>
          <p className="mt-3 text-xs text-ink-soft">
            Test metrics are on the held-out test split of the dataset (photos never used for training or tuning).
            Real phone photos are harder than dataset photos, so expect lower accuracy in daily use.
          </p>
        </>
      )}

      <section className="mt-14">
        <h2 className="text-3xl font-extrabold">From photo to bin</h2>
        <ol className="mt-6 grid gap-3 md:grid-cols-4">
          <Step icon={<ScanLine className="size-5" />} title="Photo">
            Rotation fixed from EXIF, transparency turned white, converted to RGB.
          </Step>
          <Step icon={<Crop className="size-5" />} title="Centre square">
            Cropped to the centre square and resized to {model?.img_size ?? 128}×{model?.img_size ?? 128} pixels, as
            in training. Optionally, zoom search tries ~20 crops.
          </Step>
          <Step icon={<Layers className="size-5" />} title="CNN">
            4 blocks of two 3×3 convolutions with batch norm, then global average pooling and a dense layer.
          </Step>
          <Step icon={<Grid3x3 className="size-5" />} title="12 probabilities">
            The top class decides the bin, unless its probability is below the “not sure” threshold.
          </Step>
        </ol>
      </section>

      {model && (
        <section className="mt-14">
          <h2 className="text-3xl font-extrabold">What it knows</h2>
          <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {model.class_names.map((c) => {
              const info = classInfo(c);
              return (
                <div key={c} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <info.icon className="size-4 text-ink-soft" aria-hidden />
                    {info.name}
                  </span>
                  <BinBadge bin={model.bins[c]} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-14 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-2xl font-extrabold">How it was trained</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-soft">
            <Li>Data audit first: unreadable files and exact duplicates removed; near-duplicates kept in one split so no picture is in both training and test.</Li>
            <Li>70 / 15 / 15 split, stratified by class. The test set was opened once, for models fixed in advance.</Li>
            <Li>Class weights for the imbalance (clothes are about a third of the data) and macro F1 as the main metric, so small classes like batteries count.</Li>
            <Li>Augmentation (flips, rotation, zoom, shifts, contrast, brightness), label smoothing, early stopping on validation macro F1.</Li>
            <Li>The robust version also pastes objects onto new backgrounds, adds real-world photos from other datasets, and shrinks and moves objects, to weaken the “white background = battery” shortcut found in the data.</Li>
            <Li>Compared against fully-connected networks with paired statistical tests (McNemar, bootstrap intervals).</Li>
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-2xl font-extrabold">
            <CircleAlert className="size-6 text-bin-orange" aria-hidden /> Known limits
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-soft">
            <Li>One item per photo. It classifies the whole square; it cannot find several items in a pile.</Li>
            <Li>Only 12 kinds of items. Styrofoam, drink cartons and mixed packaging are not classes yet: use “Something else”.</Li>
            <Li>It cannot tell whether a container is clean, or which plastic type it is.</Li>
            <Li>Trained mostly on tidy photos. Cluttered real-life scenes are harder; that's why it says “not sure”.</Li>
            <Li>With zoom search, the shown confidence is the best of ~20 crops, so it is optimistic.</Li>
          </ul>
        </Card>
      </section>

      <p className="mt-10 text-sm text-ink-soft">
        Credits: Benjamin Thio Zi Liang, Chew Zi Jing and Jeremy Gabriel Lee Ji Hin (UECS2523). Data: Garbage
        Classification (mostafaabla, Kaggle), RealWaste (Single et al., 2023), Garbage Classification v2 (sumn2u).{" "}
        <a href="/api/docs" className="inline-flex items-center gap-1 font-semibold text-leaf-700 hover:underline">
          API docs <ArrowRight className="size-3.5" aria-hidden />
        </a>
      </p>
    </div>
  );
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="rounded-3xl border border-line/70 bg-white p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-leaf-100 text-leaf-700">{icon}</span>
      <h3 className="mt-3 font-sans text-base font-bold">{title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{children}</p>
    </li>
  );
}

function Li({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-leaf-400" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
