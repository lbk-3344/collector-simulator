// Overview — lightweight stat placeholders in the mockup's tone. Devices,
// Workflows, and Serialized Items are all still to be built (BACKLOG.md
// sections 5-7), so these numbers are illustrative only, not live data.
export default function OverviewPage() {
  return (
    <section className="fade-in">
      <div className="stat-grid">
        <div className="stat-card accent">
          <div className="l">Devices online</div>
          <div className="n">0 / 0</div>
          <div className="d">no devices simulated yet</div>
        </div>
        <div className="stat-card">
          <div className="l">Workflows running</div>
          <div className="n">0</div>
          <div className="d">not built yet</div>
        </div>
        <div className="stat-card">
          <div className="l">Items generated</div>
          <div className="n">0</div>
          <div className="d">last 24h</div>
        </div>
        <div className="stat-card">
          <div className="l">Bug reports open</div>
          <div className="n">0</div>
          <div className="d">nothing outstanding</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Devices</h2>
        </div>
        <div className="placeholder" style={{ padding: "36px 18px" }}>
          <span className="tag">Devices</span>
          <h2>Not built yet</h2>
          <p>
            Full device list and configuration — see <code>BACKLOG.md</code> section 5.
          </p>
        </div>
      </div>
    </section>
  );
}
