// Read-point type icons — Bartender Track & Trace Simulator
// Source: Claude Design icon package (package/), integrated 2026-08-26.
// 64x64 grid, 3px stroke, currentColor. Render at 20px or larger.
// `type` matches GET /reference/read-point-types codes; unknown codes fall back to SIMPLE_READER.
// See CHARTE-GRAPHIQUE.md "Iconography" for the design rules, and package/README.md for the full source docs.
import type { SVGProps } from "react";

export const READ_POINT_GLYPHS = {
  PORTAL: (
    <>
      <path d="M18 48V20h28v28" />
      <path d="M27 34h10" />
      <path d="M33 30l4 4-4 4" />
    </>
  ),
  CONVEYOR: (
    <>
      <rect x="21" y="16" width="22" height="12" rx="2" />
      <path d="M28 32q4 3.5 8 0" />
      <path d="M24.5 36.5q7.5 6 15 0" />
      <path d="M10 42h44" />
      <circle cx="16" cy="47" r="3.5" />
      <circle cx="26" cy="47" r="3.5" />
      <circle cx="36" cy="47" r="3.5" />
      <circle cx="46" cy="47" r="3.5" />
    </>
  ),
  OVERHEAD: (
    <>
      <path d="M14 16h36" />
      <path d="M32 16v6" />
      <rect x="25" y="22" width="14" height="9" rx="2" />
      <path d="M26 36a7 7 0 0 0 12 0" />
      <path d="M20 41a13.5 13.5 0 0 0 24 0" />
    </>
  ),
  SHELF: (
    <>
      <path d="M15 15v34" />
      <path d="M49 15v34" />
      <path d="M15 24h34" />
      <path d="M15 35h34" />
      <path d="M15 46h34" />
      <rect x="21" y="16" width="9" height="8" rx="1" />
      <rect x="34" y="16" width="9" height="8" rx="1" />
      <rect x="21" y="27" width="9" height="8" rx="1" />
    </>
  ),
  TABLETOP: (
    <>
      <path d="M12 46h40" />
      <rect x="20" y="38" width="24" height="6" rx="3" />
      <path d="M26 33q6-6 12 0" />
      <path d="M21 28q11-10 22 0" />
    </>
  ),
  ENCLOSURE: (
    <>
      <rect x="10" y="17" width="44" height="30" rx="3" />
      <rect x="15" y="22" width="34" height="20" rx="2" />
      <rect x="25" y="34" width="14" height="5" rx="2.5" />
      <path d="M28 31q4-3.5 8 0" />
      <path d="M24.5 27.5q7.5-6 15 0" />
    </>
  ),
  DOORFRAME: (
    <>
      <path d="M18 48V19h28v29" />
      <path d="M9 48h9" />
      <path d="M46 48h9" />
      <path d="M24 27v14" />
      <path d="M40 27v14" />
    </>
  ),
  LIFT_LOBBY: (
    <>
      <rect x="19" y="16" width="26" height="32" rx="2.5" />
      <path d="M32 16v32" />
      <path d="M13 30V21" />
      <path d="M10 24l3-3 3 3" />
      <path d="M13 34v9" />
      <path d="M10 40l3 3 3-3" />
    </>
  ),
  SIMPLE_READER: (
    <>
      <rect x="14" y="23" width="24" height="18" rx="3" />
      <path d="M22 32h8" />
      <path d="M43 27q5 5 0 10" />
      <path d="M48.5 23q9 9 0 18" />
    </>
  ),
  MIDDLEWARE: (
    <>
      <rect x="11" y="26" width="13" height="13" rx="2" />
      <rect x="40" y="26" width="13" height="13" rx="2" />
      <path d="M32 27l5.5 5.5L32 38l-5.5-5.5z" />
      <path d="M24 32.5h2.5" />
      <path d="M37.5 32.5h2.5" />
    </>
  ),
  MES: (
    <>
      <path d="M9 48h26" />
      <path d="M13 48V30l6 8v-8l6 8v-8l6 8v10" />
      <path d="M54.3 22.0L54.3 26.0L51.9 26.2L51.7 26.6L53.2 28.4L50.4 31.2L48.6 29.7L48.2 29.9L48.0 32.3L44.0 32.3L43.8 29.9L43.4 29.7L41.6 31.2L38.8 28.4L40.3 26.6L40.1 26.2L37.7 26.0L37.7 22.0L40.1 21.8L40.3 21.4L38.8 19.6L41.6 16.8L43.4 18.3L43.8 18.1L44.0 15.7L48.0 15.7L48.2 18.1L48.6 18.3L50.4 16.8L53.2 19.6L51.7 21.4L51.9 21.8L54.3 22.0Z" />
      <circle cx="46" cy="24" r="2.5" />
    </>
  ),
  WCS: (
    <>
      <path d="M6 48h28" />
      <path d="M10 48V30h20v18" />
      <path d="M5 30L20 20l15 10" />
      <path d="M16 48V37h8v11" />
      <path d="M53.8 18.1L53.8 21.9L51.5 22.1L51.4 22.4L52.8 24.2L50.2 26.8L48.4 25.4L48.1 25.5L47.9 27.8L44.1 27.8L43.9 25.5L43.6 25.4L41.8 26.8L39.2 24.2L40.6 22.4L40.5 22.1L38.2 21.9L38.2 18.1L40.5 17.9L40.6 17.6L39.2 15.8L41.8 13.2L43.6 14.6L43.9 14.5L44.1 12.2L47.9 12.2L48.1 14.5L48.4 14.6L50.2 13.2L52.8 15.8L51.4 17.6L51.5 17.9L53.8 18.1Z" />
      <circle cx="46" cy="20" r="2.4" />
    </>
  ),
  APP: (
    <>
      <rect x="19" y="14" width="19" height="36" rx="4" />
      <path d="M25 19h7" />
      <path d="M25 45h7" />
      <path d="M43 27q6 5 0 10" />
      <path d="M48 23q9 9 0 18" />
    </>
  ),
} as const;

export type ReadPointType = keyof typeof READ_POINT_GLYPHS;

export const READ_POINT_TYPES = Object.keys(READ_POINT_GLYPHS) as ReadPointType[];

// Human-readable labels, from public/icons/read-point/manifest.json — kept
// in sync manually since that file is a static asset, not importable at
// build time. Used by the device config screen / palette (BL-042 to BL-047).
export const READ_POINT_LABELS: Record<ReadPointType, string> = {
  PORTAL: "Portal / Gate",
  CONVEYOR: "Conveyor / Tunnel",
  OVERHEAD: "Overhead / Ceiling Mount",
  SHELF: "Shelf / Embedded",
  TABLETOP: "Open Tabletop",
  ENCLOSURE: "Shielded Enclosure",
  DOORFRAME: "Room-to-Room (Doorframe)",
  LIFT_LOBBY: "Floor-to-Floor (Lift Lobby)",
  SIMPLE_READER: "Simple Reader",
  MIDDLEWARE: "Middleware",
  MES: "Manufacturing Execution System",
  WCS: "Warehouse Control System",
  APP: "Mobile / Web Application",
};

export interface ReadPointIconProps extends Omit<SVGProps<SVGSVGElement>, "type"> {
  type: string;
  size?: number;
  strokeWidth?: number;
  title?: string;
}

export default function ReadPointIcon({ type, size = 24, strokeWidth, title, ...rest }: ReadPointIconProps) {
  const glyph = READ_POINT_GLYPHS[type as ReadPointType] ?? READ_POINT_GLYPHS.SIMPLE_READER;
  const sw = strokeWidth ?? (size <= 24 ? 3.5 : 3);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {glyph}
    </svg>
  );
}
