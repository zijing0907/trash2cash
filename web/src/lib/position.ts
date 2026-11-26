import { useState } from "react";

import type { LatLng } from "./geo";

/** What to say when the browser does not give a position. */
export function positionProblem(error: GeolocationPositionError | null): string {
  if (!error) return "This browser cannot share your location here. It needs a secure (https) link.";
  if (error.code === error.PERMISSION_DENIED)
    return "Location is blocked for this site. Allow it in the browser’s site settings, or find the place on the map.";
  if (error.code === error.TIMEOUT) return "Finding your location took too long. Try again outside or near a window.";
  return "Your location could not be found. Try again, or find the place on the map.";
}

/** The person's position, asked for only when they press a button, and never sent to the server. */
export function useMyPosition() {
  const [at, setAt] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function locate() {
    if (!window.isSecureContext || !navigator.geolocation) {
      setProblem(positionProblem(null));
      return;
    }
    setBusy(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAt([pos.coords.latitude, pos.coords.longitude]);
        setBusy(false);
      },
      (err) => {
        setProblem(positionProblem(err));
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return { at, busy, problem, locate };
}
