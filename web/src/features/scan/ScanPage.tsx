import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PhotoWithBox } from "../../components/PhotoWithBox";
import { Button, ErrorNote } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/hooks";
import { withViewTransition } from "../../lib/motion";
import { shrinkPhoto } from "../../lib/photo";
import type { ScanResult } from "../../lib/types";
import { FirstScanGuide } from "./FirstScanGuide";
import { PhotoPicker } from "./PhotoPicker";
import { ScanResultView } from "./ScanResultView";

interface Photo {
  file: File;
  url: string;
}

export function ScanPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [result, setResult] = useState<{ scan: ScanResult; zoom: boolean } | null>(null);
  const [zoom, setZoom] = useState(false);
  const [donate, setDonate] = useState(false);
  // The smaller copy that is uploaded; the photo shows at once and is swapped for the copy when it is ready
  const upload = useRef<Promise<File> | null>(null);

  // Free the preview's memory when the photo changes or the page closes
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  const scan = useMutation({
    mutationFn: async (v: { file: File; zoom: boolean; donate: boolean }) =>
      api.scan(await (upload.current ?? v.file), v),
    onSuccess: (scanResult, v) => {
      // The photo glides from the preview into its place on the result, rather than the page swapping under it
      withViewTransition(() => setResult({ scan: scanResult, zoom: v.zoom }));
      void qc.invalidateQueries({ queryKey: ["scans"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  function pick(file: File) {
    scan.reset();
    setResult(null);
    setDonate(false); // consent is given per photo, never carried over
    setPhoto({ file, url: URL.createObjectURL(file) });
    const ready = shrinkPhoto(file);
    upload.current = ready;
    void ready.then((small) => {
      // The result screen draws the model's box in the uploaded photo's pixels, so it must show that copy
      if (upload.current === ready && small !== file) setPhoto({ file: small, url: URL.createObjectURL(small) });
    });
  }

  function reset() {
    scan.reset();
    setResult(null);
    setDonate(false);
    setPhoto(null);
    upload.current = null;
  }

  return (
    <div className="container app">
      <header className="app__head">
        <h1>{result ? "Here's where it goes" : "Which bin does it go in?"}</h1>
      </header>

      {!photo && <FirstScanGuide />}
      {!photo && <PhotoPicker onPick={pick} />}

      {photo && !result && (
        <div className="scan-grid">
          <PhotoWithBox
            src={photo.url}
            morph="scan-photo"
            label={scan.isPending ? (zoom ? "Searching the photo" : "Reading the square") : "What the model will see"}
            scanning={scan.isPending ? (zoom ? "photo" : "box") : undefined}
          />
          <div className="panel">
            <h2>Looks good?</h2>
            <p>The model looks at the bright square. If the item is small or off-centre, let it search the photo.</p>
            <div>
              <Toggle
                checked={zoom}
                onChange={setZoom}
                title="Find the item for me"
                text="Also checks about 20 crops of the photo and blends in the five it is surest about. Slower."
              />
              <Toggle
                checked={donate}
                onChange={setDonate}
                title="Donate this photo to improve the model"
                text={
                  me
                    ? "We keep the photo for retraining. You can delete it any time from My scans."
                    : "We keep the photo for retraining. You can delete it on the next screen."
                }
              />
            </div>

            {scan.error && <ErrorNote>{scan.error.message}</ErrorNote>}

            <div className="panel__actions">
              <Button onClick={() => scan.mutate({ file: photo.file, zoom, donate })} busy={scan.isPending}>
                {scan.isPending ? "Sorting…" : "Sort it"}
                {!scan.isPending && <ArrowRight size={18} aria-hidden />}
              </Button>
              <Button variant="quiet" onClick={reset} disabled={scan.isPending}>
                Choose another photo
              </Button>
            </div>
          </div>
        </div>
      )}

      {photo && result && (
        <ScanResultView
          key={result.scan.id}
          result={result.scan}
          file={photo.file}
          photoUrl={photo.url}
          zoom={result.zoom}
          onReset={reset}
        />
      )}
    </div>
  );
}

function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <label className="toggle">
      <span className="toggle__text">
        <strong>{props.title}</strong>
        <span>{props.text}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="toggle__track" aria-hidden />
    </label>
  );
}
