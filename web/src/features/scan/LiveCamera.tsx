import { Aperture } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, Spinner } from "../../components/ui";
import { cameraProblem } from "../../lib/camera";
import { frameToPhoto } from "../../lib/photo";

interface Props {
  onCapture: (photo: File) => void;
  onCancel: () => void;
  onFail: (message: string) => void;
}

/**
 * The camera inside the page, with the square the model looks at drawn over it, so people fill the square
 * with the item before they take the photo. The whole frame is sent (zoom search can use all of it); the
 * square is the part the model reads by default.
 */
export function LiveCamera({ onCapture, onCancel, onFail }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [taking, setTaking] = useState(false);
  // The latest callback, without restarting the camera when the parent re-renders
  const fail = useRef(onFail);
  useEffect(() => {
    fail.current = onFail;
  }, [onFail]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {}); // autoplay is allowed for a muted stream; a refusal shows no frame
        }
      })
      .catch((e: unknown) => {
        if (!stopped) fail.current(cameraProblem(e));
      });
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop()); // the camera light goes off when the view closes
    };
  }, []);

  function measure() {
    const v = video.current;
    if (v?.videoWidth) setSize({ w: v.videoWidth, h: v.videoHeight });
  }

  async function take() {
    if (!video.current) return;
    setTaking(true);
    const photo = await frameToPhoto(video.current);
    setTaking(false);
    if (photo) onCapture(photo);
    else fail.current("The camera gave an empty picture. Try again, or upload a photo.");
  }

  const shape = size && size.h > size.w ? "tall" : "wide";
  return (
    <div className="cam" data-capture="camera">
      <div
        className={`cam__view cam__view--${shape}`}
        style={size ? ({ "--cam-ar": `${size.w} / ${size.h}` } as React.CSSProperties) : undefined}
      >
        <video
          ref={video}
          muted
          playsInline
          autoPlay
          aria-label="Camera preview"
          onLoadedMetadata={measure}
          onResize={measure}
        />
        {size ? (
          <div className="cam__guide" aria-hidden>
            <span>Fill this square</span>
          </div>
        ) : (
          <div className="cam__wait">
            <Spinner label="Starting the camera…" />
          </div>
        )}
      </div>
      <div className="cam__actions">
        <Button onClick={() => void take()} disabled={!size} busy={taking}>
          <Aperture size={18} aria-hidden /> Take the photo
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Close the camera
        </Button>
      </div>
    </div>
  );
}
