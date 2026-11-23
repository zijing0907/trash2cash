import { Camera, ImageUp, Lightbulb } from "lucide-react";
import { useRef, useState } from "react";

import { Card } from "../../components/ui";

export const MAX_UPLOAD_MB = 8;

const TIPS = [
  "One item per photo.",
  "Fill the square with the item; the model only sees the centre square.",
  "Good light helps. Any background is fine.",
];

/** Take a photo (phones open the camera) or pick/drop a file. */
export function PhotoPicker({ onPick }: { onPick: (file: File) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`That photo is larger than ${MAX_UPLOAD_MB} MB. Try a smaller one or a screenshot of it.`);
      return;
    }
    if (file.type && !file.type.startsWith("image/")) {
      setError("That file is not a photo. Use a JPEG, PNG, WebP or HEIC image.");
      return;
    }
    setError(null);
    onPick(file);
  }

  const inputProps = {
    type: "file" as const,
    accept: "image/*,.heic,.heif",
    className: "sr-only",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      accept(e.target.files?.[0]);
      e.target.value = ""; // picking the same file again still fires onChange
    },
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files[0]);
          }}
          className={
            "flex min-h-80 flex-col items-center justify-center gap-6 rounded-2xl border-2 border-dashed p-8 text-center transition " +
            (dragging ? "border-leaf-500 bg-leaf-50" : "border-line bg-paper/60")
          }
        >
          <div className="relative grid size-24 place-items-center">
            <div className="absolute inset-0 rounded-3xl border-2 border-leaf-400/60" />
            <div className="absolute inset-3 rounded-2xl border-2 border-dashed border-leaf-300" />
            <Camera className="size-8 text-leaf-600" aria-hidden />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Show us the item</h2>
            <p className="mt-1 text-ink-soft">Take a photo or drop one here. We'll tell you which bin it goes in.</p>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-leaf-600 px-5 py-3.5 font-semibold text-white shadow-sm transition hover:bg-leaf-700 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-leaf-500">
              <Camera className="size-5" aria-hidden />
              Take a photo
              <input ref={camera} capture="environment" {...inputProps} />
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-line bg-white px-5 py-3.5 font-semibold transition hover:border-leaf-400 hover:bg-leaf-50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-leaf-500">
              <ImageUp className="size-5" aria-hidden />
              Upload
              <input ref={gallery} {...inputProps} aria-label="Upload a photo" />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Lightbulb className="size-5 text-bin-orange" aria-hidden />
          For the best answer
        </h3>
        <ul className="mt-4 space-y-3">
          {TIPS.map((t, i) => (
            <li key={t} className="flex gap-3 text-sm text-ink-soft">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-leaf-100 text-xs font-bold text-leaf-700">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-6 rounded-2xl bg-paper p-4 text-xs leading-relaxed text-ink-soft">
          Your photo is sent to our server, classified and then thrown away. We keep only the answer, unless you
          choose to donate the photo on the next screen.
        </p>
      </Card>
    </div>
  );
}
