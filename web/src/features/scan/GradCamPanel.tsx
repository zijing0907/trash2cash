import { useMutation } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, ErrorNote } from "../../components/ui";
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
      <div className="panel">
        <Button variant="secondary" onClick={() => explain.mutate()} busy={explain.isPending}>
          <Eye size={18} aria-hidden />
          {explain.isPending ? "Looking…" : "Where did the model look?"}
        </Button>
        {explain.error && <ErrorNote>{explain.error.message}</ErrorNote>}
      </div>
    );
  }
  return (
    <figure className="heatmap capture">
      <img src={url} alt={`Heat map of where the model looked for ${classInfo(className).name}`} />
      <figcaption>
        Grad-CAM heat map. Red areas pushed the model towards “{classInfo(className).name}”. If the red sits on the
        background instead of the item, retake the photo with the item filling the square.
      </figcaption>
    </figure>
  );
}
