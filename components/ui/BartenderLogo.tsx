import Image from "next/image";

// Mirrors Supplier Connect's BartenderLogo.tsx pattern: a mark plus a
// real-text wordmark, not baked into the image. Not currently used anywhere
// (AppShell.tsx/login/pending pages render their own inline version) — kept
// in case a reusable component is wanted later.
//
// BL-077: the mark is now this app's own original design (diagonal notch
// triangle + signal arcs), not the BarTender logo — see CLAUDE-CONCEPT.md
// "App icon / favicon" for why. Component name kept as-is to avoid a
// pointless rename of dead code; update if this ever gets wired in for real.
// See CHARTE-GRAPHIQUE.md "Logo".
interface BartenderLogoProps {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  showTag?: boolean;
}

const sizeMap = {
  sm: { w: 26, h: 21, wordSize: 14.5, tagSize: 9.5 },
  md: { w: 30, h: 24, wordSize: 16, tagSize: 11 },
  lg: { w: 40, h: 32, wordSize: 20, tagSize: 12 },
};

export function BartenderLogo({ size = "md", showWordmark = true, showTag = false }: BartenderLogoProps) {
  const { w, h, wordSize, tagSize } = sizeMap[size];

  return (
    <div className="side-brand" style={{ padding: 0 }}>
      <Image src="/brand/app-icon.png" alt="" width={w} height={h} style={{ objectFit: "contain" }} priority />
      {showWordmark && (
        <div className="side-brand-text">
          <span className="side-brand-word" style={{ fontSize: wordSize }}>
            BarTender<span>.</span>
          </span>
          {showTag && (
            <span className="side-brand-tag" style={{ fontSize: tagSize }}>
              Track &amp; Trace Simulator
            </span>
          )}
        </div>
      )}
    </div>
  );
}
