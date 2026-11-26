import QRCode from "qrcode";
import { useMemo } from "react";

/** The member code as a QR code an operator can scan. Drawn in the current ink colour on a paper quiet zone. */
export function MemberQR({ code, size = 168 }: { code: string; size?: number }) {
  const { n, path } = useMemo(() => {
    const qr = QRCode.create(code, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    return { n, path: d };
  }, [code]);
  return (
    <svg
      className="qr"
      width={size}
      height={size}
      viewBox={`-3 -3 ${n + 6} ${n + 6}`}
      role="img"
      aria-label={`QR code of member code ${code}`}
      shapeRendering="crispEdges"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
