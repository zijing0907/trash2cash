/** The camera inside the page: whether the browser offers it, and what to say when it fails. */

/** Browsers only offer the camera to secure pages (https, or localhost while developing). */
export function liveCameraAvailable(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

/** What to tell people when the camera does not start. */
export function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "The camera is blocked for this site. Allow it in the browser’s site settings, or take a photo with your camera app instead.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera was found. Take a photo with your camera app or upload one instead.";
  if (name === "NotReadableError") return "Another app is using the camera. Close it and try again, or upload a photo.";
  return "The camera did not start. Take a photo with your camera app or upload one instead.";
}
