"use client";

import { useCallback, useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { formatBizStep } from "@/lib/bartenderEpcis";
import type { BartenderLocation } from "@/lib/bartenderLocations";

type Tab = "calls" | "epcis";

// ── shared bits ─────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

function StatusPill({ status, error }: { status: number | null; error?: string | null }) {
  if (error) return <span className="chip chip-danger">error</span>;
  if (status == null) return <span className="chip">—</span>;
  const cls = status >= 500 ? "chip-danger" : status >= 400 ? "chip-warning" : "chip-success";
  return <span className={`chip ${cls}`}>{status}</span>;
}

function pretty(body: string | null | undefined): string {
  if (body == null) return "";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

// ── Endpoint calls tab ──────────────────────────────────────────────────────

type CallRow = {
  id: string;
  operation: string;
  method: string;
  url: string;
  responseStatus: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
};

type CallDetail = CallRow & {
  requestHeaders: Record<string, string> | null;
  requestBody: string | null;
  responseBody: string | null;
};

function buildCurl(d: CallDetail): string {
  const lines = [`curl -X ${d.method} '${d.url}'`];
  for (const [k, v] of Object.entries(d.requestHeaders ?? {})) {
    lines.push(`  -H '${k}: ${v === "***redacted***" ? "***replace-with-your-own-credential***" : v}'`);
  }
  if (d.requestBody && !d.requestBody.startsWith("[non-string")) {
    lines.push(`  --data '${d.requestBody.replace(/'/g, "'\\''")}'`);
  }
  return lines.join(" \\\n");
}

function EndpointCallsTab() {
  const [rows, setRows] = useState<CallRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CallDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/history/calls");
    if (!res.ok) {
      setError("Couldn't load the call history.");
      return;
    }
    setRows((await res.json()).calls ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function open(id: string) {
    setLoadingDetail(true);
    const res = await fetch(`/api/history/calls/${id}`);
    setLoadingDetail(false);
    if (!res.ok) {
      setError("Couldn't load that call.");
      return;
    }
    setSelected((await res.json()).call);
  }

  if (!rows) return <p className="note">Loading…</p>;

  return (
    <>
      {error && <div className="snack snack-danger">{error}</div>}
      <div className="list-toolbar">
        <button className="btn btn-secondary small" onClick={load}>
          Reload
        </button>
        <span className="note" style={{ margin: 0 }}>
          Your last {rows.length} Bartender API calls. Secrets are never stored — auth headers show{" "}
          <code>***redacted***</code>.
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="note">No API calls logged yet.</p>
      ) : (
        <div className="panel table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th>Operation</th>
                <th>Method</th>
                <th>Status</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="u-name">{r.operation}</div>
                    <div className="u-email" style={{ maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.url}
                    </div>
                  </td>
                  <td className="u-meta">{r.method}</td>
                  <td>
                    <StatusPill status={r.responseStatus} error={r.errorMessage} />
                  </td>
                  <td className="u-meta">
                    {relTime(r.createdAt)}
                    {r.durationMs != null && <span> · {r.durationMs}ms</span>}
                  </td>
                  <td>
                    <button className="btn btn-secondary small" disabled={loadingDetail} onClick={() => open(r.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal fade-in" role="dialog" aria-modal="true" style={{ width: 920, maxWidth: "calc(100vw - 40px)" }}>
            <div className="modal-head">
              <h2>{selected.operation}</h2>
              <button className="modal-close" aria-label="Close" onClick={() => setSelected(null)}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <line x1="5" y1="5" x2="15" y2="15" />
                  <line x1="15" y1="5" x2="5" y2="15" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <section>
                  <div className="field-block">
                    <label>Request</label>
                    <p className="u-meta" style={{ margin: "2px 0 8px", wordBreak: "break-all" }}>
                      {selected.method} {selected.url}
                    </p>
                    <pre className="history-pre">
                      {Object.entries(selected.requestHeaders ?? {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n") || "(no headers)"}
                    </pre>
                    {selected.requestBody && (
                      <pre className="history-pre" style={{ marginTop: 8 }}>
                        {pretty(selected.requestBody)}
                      </pre>
                    )}
                  </div>
                  <CopyButton text={() => buildCurl(selected)} label="Copy as curl" />
                </section>
                <section>
                  <div className="field-block">
                    <label>Response</label>
                    <p className="u-meta" style={{ margin: "2px 0 8px" }}>
                      {selected.errorMessage ? `Network error: ${selected.errorMessage}` : `HTTP ${selected.responseStatus ?? "—"}`}
                    </p>
                    <pre className="history-pre">{pretty(selected.responseBody) || "(no body)"}</pre>
                  </div>
                  {selected.responseBody && <CopyButton text={selected.responseBody} label="Copy response" />}
                </section>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── EPCIS events tab ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpcisEvent = { id: string; type: string; eventTime: string; bizStep?: string | null; premise?: string | null; epcList?: any[]; [k: string]: any };

function EpcisEventsTab() {
  const [locations, setLocations] = useState<BartenderLocation[]>([]);
  const [location, setLocation] = useState("all");
  const [events, setEvents] = useState<EpcisEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<EpcisEvent | null>(null);

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => setLocations(d.locations ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async (loc: string) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/history/epcis?location=${encodeURIComponent(loc)}`);
    setLoading(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't load EPCIS events.");
      setEvents(null);
      return;
    }
    setEvents(data.events ?? []);
  }, []);

  useEffect(() => {
    load("all");
  }, [load]);

  return (
    <>
      <div className="list-toolbar">
        <label htmlFor="epcisLocation">Location</label>
        <select
          id="epcisLocation"
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            load(e.target.value);
          }}
        >
          <option value="all">All Locations</option>
          {locations.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary small" disabled={loading} onClick={() => load(location)}>
          Reload
        </button>
      </div>

      {error ? (
        <div className="snack snack-danger">{error}</div>
      ) : !events ? (
        <p className="note">Loading…</p>
      ) : events.length === 0 ? (
        <p className="note">No EPCIS events found for this selection.</p>
      ) : (
        <div className="panel table-scroll">
          <table className="users">
            <thead>
              <tr>
                <th>Event</th>
                <th>Items</th>
                <th>Time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>
                    <div className="u-name">
                      {ev.type}
                      {ev.bizStep && <span className="u-meta"> — {formatBizStep(ev.bizStep)}</span>}
                    </div>
                    {ev.premise && <div className="u-email">{ev.premise}</div>}
                  </td>
                  <td className="u-meta">{Array.isArray(ev.epcList) ? ev.epcList.length : 0}</td>
                  <td className="u-meta">{new Date(ev.eventTime).toLocaleString()}</td>
                  <td>
                    <button className="btn btn-secondary small" onClick={() => setSelected(ev)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal fade-in" role="dialog" aria-modal="true" style={{ width: 720, maxWidth: "calc(100vw - 40px)" }}>
            <div className="modal-head">
              <h2>{selected.type}</h2>
              <button className="modal-close" aria-label="Close" onClick={() => setSelected(null)}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <line x1="5" y1="5" x2="15" y2="15" />
                  <line x1="15" y1="5" x2="5" y2="15" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <pre className="history-pre">{JSON.stringify(selected, null, 2)}</pre>
            </div>
            <div className="modal-foot">
              <CopyButton text={JSON.stringify(selected, null, 2)} label="Copy" />
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── shell ───────────────────────────────────────────────────────────────────

export function HistoryTabs() {
  const [tab, setTab] = useState<Tab>("calls");
  return (
    <>
      <div className="tabs">
        <button className={`tab${tab === "calls" ? " active" : ""}`} onClick={() => setTab("calls")}>
          Endpoint calls
        </button>
        <button className={`tab${tab === "epcis" ? " active" : ""}`} onClick={() => setTab("epcis")}>
          EPCIS events
        </button>
      </div>
      {tab === "calls" ? <EndpointCallsTab /> : <EpcisEventsTab />}
    </>
  );
}
