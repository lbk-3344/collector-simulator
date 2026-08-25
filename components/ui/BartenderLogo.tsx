import Image from "next/image";

// Mirrors Supplier Connect's BartenderLogo.tsx pattern: the official mark
// (unaltered) plus a real-text wordmark, not baked into the image.
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
      <Image src="/brand/bartender-logo.png" alt="BarTender" width={w} height={h} style={{ objectFit: "contain" }} priority />
      {showWordmark && (
        <div className="side-brand-text">
          <span className="side-brand-word" style={{ fontSize: wordSize }}>
            BarTender<span>.</span>
          </span>
          {showTag && (
            <span className="side-brand-tag" style={{ fontSize: tagSize }}>
              Track &amp; Trace Sim.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
