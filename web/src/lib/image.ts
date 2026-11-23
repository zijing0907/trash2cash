/** Geometry for showing which part of the photo the model looks at. */

export type Box = [left: number, top: number, right: number, bottom: number];

/** The centre square the model sees by default (same maths as ml-service's center_box). */
export function centreBox(width: number, height: number): Box {
  const s = Math.min(width, height);
  const left = Math.floor((width - s) / 2);
  const top = Math.floor((height - s) / 2);
  return [left, top, left + s, top + s];
}

/** A box in pixels -> CSS percentages of the displayed image. */
export function boxToPercent(box: Box, width: number, height: number) {
  const [l, t, r, b] = box;
  return {
    left: `${(l / width) * 100}%`,
    top: `${(t / height) * 100}%`,
    width: `${((r - l) / width) * 100}%`,
    height: `${((b - t) / height) * 100}%`,
  };
}

/** HEIC photos (iPhone) can be scanned but most browsers cannot display them. */
export function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function percent(p: number): string {
  return `${Math.round(p * 100)}%`;
}
