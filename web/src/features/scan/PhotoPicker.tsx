import { Camera, ImageUp } from "lucide-react";
import { useState } from "react";

export const MAX_UPLOAD_MB = 8;

const TIPS = [
  "One item per photo.",
  "Fill the square with the item; the model only sees the centre square.",
  "Good light helps. Any background is fine.",
];

/** Take a photo (phones open the camera) or pick/drop a file. */
export function PhotoPicker({ onPick }: { onPick: (file: File) => void }) {
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
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      accept(e.target.files?.[0]);
      e.target.value = ""; // picking the same file again still fires onChange
    },
  };

  return (
    <div className="scan-grid" data-capture="picker">
      {/* border-dashed: kept as a hook for the picker's drop test */}
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
        className={dragging ? "drop border-dashed is-over" : "drop border-dashed"}
      >
        <h2>Show us the item</h2>
        <p className="lead">Take a photo or drop one here. We’ll tell you which bin it goes in.</p>
        <div className="drop__buttons">
          <label className="btn filebtn">
            <Camera size={18} aria-hidden />
            Take a photo
            <input capture="environment" {...inputProps} />
          </label>
          <label className="btn btn--secondary filebtn">
            <ImageUp size={18} aria-hidden />
            Upload
            <input {...inputProps} aria-label="Upload a photo" />
          </label>
        </div>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
      </div>

      <div className="picker-side">
        <h3>For the best answer</h3>
        <ol className="tips">
          {TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        <p className="aside-note">
          Your photo is sent to our server, classified and then thrown away. We keep only the answer, unless you
          choose to donate the photo on the next screen.
        </p>
      </div>
    </div>
  );
}
