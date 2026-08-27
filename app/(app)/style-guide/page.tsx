import ReadPointIcon from "@/components/ui/ReadPointIcon";
import manifest from "@/public/icons/read-point/manifest.json";

// Temporary review page for design-system assets that don't have a real UI
// home yet — right now just the read-point type icon set (BL-029). Not
// linked from the sidebar; reachable directly at /style-guide. Delete once
// the Devices feature (BACKLOG.md BL-003) actually renders these icons.
const CATEGORY_LABELS: Record<string, string> = {
  fixed_rfid: "Fixed RFID",
  software: "Software",
};

export default function StyleGuidePage() {
  const categories = Array.from(new Set(manifest.icons.map((icon) => icon.category)));

  return (
    <section className="fade-in">
      <h1 className="page-title">Style guide</h1>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-head">
          <h2>Read-point type icons</h2>
        </div>
        <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--ink-2)" }}>
          13 line-art icons for Bartender read-point/device types (BL-029) — see{" "}
          <code>CHARTE-GRAPHIQUE.md</code> &quot;Iconography&quot; for the design rules. Not wired into any
          real page yet since Devices (BL-003) isn&apos;t built.
        </div>
      </div>

      {categories.map((category) => (
        <div key={category} className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-head">
            <h2>{CATEGORY_LABELS[category] ?? category}</h2>
            <span className="chip chip-brand">{category.toUpperCase()}</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 1,
              background: "var(--border)",
            }}
          >
            {manifest.icons
              .filter((icon) => icon.category === category)
              .map((icon) => (
                <div
                  key={icon.code}
                  style={{
                    background: "var(--surface)",
                    padding: "20px 16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    gap: 10,
                  }}
                >
                  <ReadPointIcon type={icon.code} size={32} />
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{icon.label}</div>
                  <code style={{ fontSize: 11, color: "var(--ink-2)" }}>{icon.code}</code>
                </div>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}
