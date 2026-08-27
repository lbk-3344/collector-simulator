"use client";

import { useCallback, useEffect, useState } from "react";

type ConnectionState = {
  tenantUrl: string | null;
  apiKeyLast4: string | null;
};

type TestResult = { ok: true; locationCount: number } | { ok: false; error: string };

// Per-user Bartender connection settings — open to every signed-in role
// (including PENDING), not admin-gated. See CLAUDE-CONCEPT.md section 7.1,
// BACKLOG.md BL-032/BL-033.
export function BartenderConnectionTab() {
  const [loaded, setLoaded] = useState(false);
  const [tenantUrl, setTenantUrl] = useState("");
  const [savedApiKeyLast4, setSavedApiKeyLast4] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/bartender");
    if (!res.ok) return;
    const data: ConnectionState = await res.json();
    setTenantUrl(data.tenantUrl ?? "");
    setSavedApiKeyLast4(data.apiKeyLast4);
    setEditingKey(!data.apiKeyLast4);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    const res = await fetch("/api/settings/bartender", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantUrl, ...(newApiKey && { apiKey: newApiKey }) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setSaveError(data?.error ?? "Couldn't save the connection settings.");
    } else {
      setSaveOk(true);
      setNewApiKey("");
      await load();
    }
    setSaving(false);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/settings/bartender/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantUrl, ...(newApiKey && { apiKey: newApiKey }) }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "Unexpected error." }));
    setTestResult(data);
    setTesting(false);
  }

  if (!loaded) {
    return <p className="note">Loading connection settings…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 440 }}>
      {saveError && <div className="snack snack-danger">{saveError}</div>}

      <div className="field-block">
        <label>Tenant URL</label>
        <input
          type="text"
          placeholder="https://demotrackandtrace.sandbox.bartender-tt.com"
          value={tenantUrl}
          onChange={(e) => {
            setTenantUrl(e.target.value);
            setSaveOk(false);
          }}
        />
      </div>

      <div className="field-block">
        <label>API key</label>
        {!editingKey && savedApiKeyLast4 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <code>•••• {savedApiKeyLast4}</code>
            <button
              type="button"
              className="auth-foot-link"
              style={{ margin: 0 }}
              onClick={() => setEditingKey(true)}
            >
              Change key
            </button>
          </div>
        ) : (
          <input
            type="password"
            placeholder="Paste your Bartender API key"
            value={newApiKey}
            onChange={(e) => {
              setNewApiKey(e.target.value);
              setSaveOk(false);
            }}
          />
        )}
      </div>

      <div className="row" style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-secondary" disabled={testing} onClick={handleTest}>
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>

      {saveOk && <div className="snack snack-success">Saved.</div>}

      {testResult && (
        <div className={`snack ${testResult.ok ? "snack-success" : "snack-danger"}`}>
          {testResult.ok
            ? `Connected — found ${testResult.locationCount} location${testResult.locationCount === 1 ? "" : "s"}.`
            : testResult.error}
        </div>
      )}
    </div>
  );
}
