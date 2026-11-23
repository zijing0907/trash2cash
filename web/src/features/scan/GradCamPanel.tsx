import { useMutation } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useEffect, useState } from "react";

import { ErrorNote } from "../../components/ui";
import { api } from "../../lib/api";
import { classInfo } from "../../lib/recycling";

/** Grad-CAM: which pixels pushed the model towards its answer. Fetched only when asked for. */
export function GradCamPanel({
  file,
  classIndex,
  className,
  zoom,
}: {
  file: File;
  classIndex: number;
  className: string;
  zoom: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const explain = useMutation({
    mutationFn: () => api.explain(file, classIndex, zoom),
    onSuccess: (blob) => setUrl(URL.createObjectURL(blob)),
  });
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  if (!url) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => explain.mutate()}
          disabled={explain.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-semibold transition hover:border-leaf-400 hover:bg-leaf-50 disabled:opacity-60"
        >
          <Eye className="size-4" aria-hidden />
          {explain.isPending ? "Looking…" : "Where did the model look?"}
        </button>
        {explain.error && <ErrorNote>{explain.error.message}</ErrorNote>}
      </div>
    );
  }
  return (
    <figure className="animate-rise rounded-2xl border border-line bg-white p-3">
      <img src={url} alt={`Heat map of where the model looked for ${classInfo(className).name}`} className="w-full rounded-xl" />
      <figcaption className="mt-3 text-xs leading-relaxed text-ink-soft">
        <strong className="text-ink">Grad-CAM heat map.</strong> Red areas pushed the model towards “
        {classInfo(className).name}”. If the red sits on the background instead of the item, retake the photo with
        the item filling the square.
      </figcaption>
    </figure>
  );
}
