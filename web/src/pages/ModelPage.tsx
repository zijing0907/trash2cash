import type { ReactNode } from "react";

import { BinBadge } from "../components/BinBadge";
import { ErrorNote, Spinner } from "../components/ui";
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
    <>
      <header className="container doc-hero">
        <h1>How the model works</h1>
        <p className="lead">
          A convolutional neural network trained from random weights (no pretrained models) for UECS2523 Applied
          Machine Learning. Everything on this page about the running model comes live from its own export file.
        </p>
        {model && (
          <dl className="version">
            <div>
              <dt>Version</dt>
              <dd>{model.version}</dd>
            </div>
            <div>
              <dt>Classes</dt>
              <dd>{model.class_names.length}</dd>
            </div>
            <div>
              <dt>Input</dt>
              <dd>
                {model.img_size}×{model.img_size} px
              </dd>
            </div>
            <div>
              <dt>Dataset</dt>
              <dd>{model.dataset}</dd>
            </div>
          </dl>
        )}
      </header>

      {(isPending || error) && (
        <div className="container">
          {isPending && <Spinner label="Asking the model about itself…" />}
          {error && (
            <ErrorNote>The classifier is offline right now, so live numbers are missing. {error.message}</ErrorNote>
          )}
        </div>
      )}

      {model && (
        <section className="container" aria-label="Test results">
          {model.quick_run && <ErrorNote>Test export (2 epochs): these numbers are not meaningful.</ErrorNote>}
          <dl className="metrics">
            {Object.keys(METRICS)
              .filter((k) => k in model.metrics)
              .map((k) => (
                <div key={k}>
                  <dt>{METRICS[k]!.label}</dt>
                  <dd className="figure-num">{percent(model.metrics[k]!)}</dd>
                  <dd>{METRICS[k]!.hint}</dd>
                </div>
              ))}
            <div>
              <dt>“Not sure” below</dt>
              <dd className="figure-num">{percent(model.threshold)}</dd>
              <dd>The lowest confidence at which the model was right at least 90% of the time on validation data</dd>
            </div>
            {model.battery_warn_at !== undefined && (
              <div>
                <dt>Battery warning from</dt>
                <dd className="figure-num">{percent(model.battery_warn_at)}</dd>
                <dd>Chosen, not measured: just above chance for 12 classes. Checked on real photos in a later phase</dd>
              </div>
            )}
          </dl>
          <p className="small-print muted metrics__note">
            Test metrics are on the held-out test split of the dataset (photos never used for training or tuning).
            Real phone photos are harder than dataset photos, so expect lower accuracy in daily use.
          </p>
        </section>
      )}

      <section className="container doc-section">
        <h2>From photo to bin</h2>
        <ol className="pipeline">
          <Step title="Photo">Rotation fixed from EXIF, transparency turned white, converted to RGB.</Step>
          <Step title="Centre square">
            Cropped to the centre square and resized to {model?.img_size ?? 128}×{model?.img_size ?? 128} pixels, as
            in training. Optionally, zoom search tries about 20 crops.
          </Step>
          <Step title="CNN">
            4 blocks of two 3×3 convolutions with batch norm, then global average pooling and a dense layer.
          </Step>
          <Step title="12 probabilities">
            The top class decides the bin, unless its probability is below the “not sure” threshold. Then the
            probabilities are added up per bin: if one bin clears the threshold (glass, but not sure which colour), the
            app names that bin. Any real chance of a battery brings a warning.
          </Step>
        </ol>
      </section>

      {model && (
        <section className="container doc-section">
          <h2>What it knows</h2>
          <div className="classes-wrap">
            <table className="classes">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Goes in</th>
                </tr>
              </thead>
              <tbody>
                {model.class_names.map((c) => (
                  <tr key={c}>
                    <td>{classInfo(c).name}</td>
                    <td>
                      <BinBadge bin={model.bins[c]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="container doc-section two-lists">
        <div>
          <h2>How it was trained</h2>
          <ul>
            <li>
              Data audit first: unreadable files and exact duplicates removed; near-duplicates kept in one split so no
              picture is in both training and test.
            </li>
            <li>70 / 15 / 15 split, stratified by class. The test set was opened once, for models fixed in advance.</li>
            <li>
              Class weights for the imbalance (clothes are about a third of the data) and macro F1 as the main metric,
              so small classes like batteries count.
            </li>
            <li>
              Augmentation (flips, rotation, zoom, shifts, contrast, brightness), label smoothing, early stopping on
              validation macro F1.
            </li>
            <li>
              The robust version also pastes objects onto new backgrounds, adds real-world photos from other datasets,
              and shrinks and moves objects, to weaken the “white background = battery” shortcut found in the data.
            </li>
            <li>Compared against fully-connected networks with paired statistical tests (McNemar, bootstrap intervals).</li>
          </ul>
        </div>
        <div>
          <h2>Known limits</h2>
          <ul>
            <li>One item per photo. It classifies the whole square; it cannot find several items in a pile.</li>
            <li>
              Only 12 kinds of items. Styrofoam, drink cartons and mixed packaging are not classes yet: use “Something
              else”.
            </li>
            <li>It cannot tell whether a container is clean, or which plastic type it is.</li>
            <li>Trained mostly on tidy photos. Cluttered real-life scenes are harder; that’s why it says “not sure”.</li>
            <li>With zoom search, the answer blends the whole photo with the five crops the model was surest about, so it leans a little optimistic.</li>
          </ul>
        </div>
        <p className="credits">
        Credits: Benjamin Thio Zi Liang, Chew Zi Jing and Jeremy Gabriel Lee Ji Hin (UECS2523). Data: Garbage
        Classification (mostafaabla, Kaggle), RealWaste (Single et al., 2023), Garbage Classification v2 (sumn2u).{" "}
        <a href="/api/docs" className="link">
          API docs
        </a>
        </p>
      </section>

    </>
  );
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li>
      <h3>{title}</h3>
      <p>{children}</p>
    </li>
  );
}
