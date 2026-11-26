import { ImageOff } from "lucide-react";
import { useState } from "react";

import { type Box, boxToPercent, centreBox } from "../lib/image";

/**
 * The user's photo with the square the model looks at. Outside the square is dimmed, so people learn
 * to fill the square with the item (the model centre-crops every photo to a square).
 * `box` is in the photo's pixels (e.g. the crop_box from a zoomed scan); default is the centre square.
 * `scanning` draws a line passing over what the model is reading while it works: the square, or with zoom
 * search the whole photo.
 */
export function PhotoWithBox({
  src,
  box,
  label,
  scanning,
}: {
  src: string;
  box?: Box;
  label?: string;
  scanning?: "box" | "photo";
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="photo__none">
        <ImageOff size={24} aria-hidden />
        This browser cannot show a preview of this photo (for example iPhone HEIC), but the model can still read it.
      </div>
    );
  }

  const shown = size ? (box ?? centreBox(size.w, size.h)) : null;
  return (
    // The inner frame is exactly as big as the shown image, so the box percentages line up with it
    <div className="photo">
      <div className="photo__frame">
        <img
          src={src}
          alt="Your photo"
          onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={() => setFailed(true)}
        />
        {scanning === "photo" && <div className="sweep" aria-hidden />}
        {shown && size && (
          <div
            className={scanning ? "photo__box is-scanning" : "photo__box"}
            style={boxToPercent(shown, size.w, size.h)}
            data-testid="model-box"
          >
            {scanning === "box" && <div className="sweep" aria-hidden />}
            {label && <span>{label}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
