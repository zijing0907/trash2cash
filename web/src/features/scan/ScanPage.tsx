import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Crosshair, Heart } from "lucide-react";
import { useEffect, useState } from "react";

import { PhotoWithBox } from "../../components/PhotoWithBox";
import { Button, Card, ErrorNote, Eyebrow } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/hooks";
import type { ScanResult } from "../../lib/types";
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

  // Free the preview's memory when the photo changes or the page closes
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  const scan = useMutation({
    mutationFn: (v: { file: File; zoom: boolean; donate: boolean }) => api.scan(v.file, v),
    onSuccess: (scanResult, v) => {
      setResult({ scan: scanResult, zoom: v.zoom });
      void qc.invalidateQueries({ queryKey: ["scans"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  function pick(file: File) {
    scan.reset();
    setResult(null);
    setDonate(false); // consent is given per photo, never carried over
    setPhoto({ file, url: URL.createObjectURL(file) });
  }

  function reset() {
    scan.reset();
    setResult(null);
    setDonate(false);
    setPhoto(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <Eyebrow>Scan</Eyebrow>
        <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">
          {result ? "Here's where it goes" : "Which bin does it go in?"}
        </h1>
      </div>

      {!photo && <PhotoPicker onPick={pick} />}

      {photo && !result && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <PhotoWithBox src={photo.url} label="What the model will see" />
          <Card className="flex flex-col gap-5 p-6">
            <div>
              <h2 className="text-2xl font-bold">Looks good?</h2>
              <p className="mt-1 text-sm text-ink-soft">
                The model looks at the bright square. If the item is small or off-centre, let it search the photo.
              </p>
            </div>

            <Toggle
              checked={zoom}
              onChange={setZoom}
              icon={<Crosshair className="size-5 text-leaf-600" aria-hidden />}
              title="Find the item for me"
              text="Searches about 20 crops of the photo. Slower, and its confidence is optimistic."
            />
            <Toggle
              checked={donate}
              onChange={setDonate}
              icon={<Heart className="size-5 text-bin-ewaste" aria-hidden />}
              title="Donate this photo to improve the model"
              text={
                me
                  ? "We keep the photo for retraining. You can delete it any time from My scans."
                  : "We keep the photo for retraining. You can delete it on the next screen."
              }
            />

            {scan.error && <ErrorNote>{scan.error.message}</ErrorNote>}

            <div className="mt-auto flex flex-wrap gap-3">
              <Button size="lg" onClick={() => scan.mutate({ file: photo.file, zoom, donate })} busy={scan.isPending}>
                {scan.isPending ? "Sorting…" : "Sort it"}
                {!scan.isPending && <ArrowRight className="size-5" aria-hidden />}
              </Button>
              <Button size="lg" variant="ghost" onClick={reset} disabled={scan.isPending}>
                Choose another photo
              </Button>
            </div>
          </Card>
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

function Toggle(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4 transition hover:border-leaf-300 has-[:checked]:border-leaf-400 has-[:checked]:bg-leaf-50">
      <span className="mt-0.5">{props.icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-semibold">{props.title}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{props.text}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-line transition peer-checked:bg-leaf-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-leaf-500 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
      />
    </label>
  );
}
