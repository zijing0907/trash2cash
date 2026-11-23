import { ImageOff } from "lucide-react";
import { useState } from "react";

import { type Box, boxToPercent, centreBox } from "../lib/image";

/**
 * The user's photo with the square the model looks at. Outside the square is dimmed, so people learn
 * to fill the square with the item (the model centre-crops every photo to a square).
 * `box` is in the photo's pixels (e.g. the crop_box from a zoomed scan); default is the centre square.
 */
export function PhotoWithBox({ src, box, label }: { src: string; box?: Box; label?: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-paper-deep p-6 text-center text-sm text-ink-soft">
        <ImageOff className="size-6" aria-hidden />
        This browser cannot show a preview of this photo (for example iPhone HEIC), but the model can still read it.
      </div>
    );
  }

  const shown = size ? (box ?? centreBox(size.w, size.h)) : null;
  return (
    // The inner wrapper is exactly as big as the shown image, so the box percentages line up with it
    <div className="flex justify-center overflow-hidden rounded-2xl bg-ink">
      <div className="relative">
        <img
          src={src}
          alt="Your photo"
          className="block h-auto max-h-[60vh] w-auto max-w-full"
          onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={() => setFailed(true)}
        />
        {shown && size && (
          <div
            className="pointer-events-none absolute rounded-lg border-2 border-white/90 shadow-[0_0_0_9999px_rgb(22_36_28/0.45)]"
            style={boxToPercent(shown, size.w, size.h)}
            data-testid="model-box"
          >
            {label && (
              <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink">
                {label}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
