"use client";

import { useCallback, useEffect, useState } from "react";

// Mirrors lib/resourceUsage.ts's exported shapes.
type FetchResult<T> = { configured: true; error?: string; data?: T } | { configured: false };

interface NeonUsage {
  computeHours: number;
  computeHoursIncluded: number;
  dataTransferGB: number;
  dataTransferIncludedGB: number;
  storageGB: number;
  periodStart: string;
  periodEnd: string;
  consoleUrl: string;
}
interface ResendUsage {
  sentToday: number;
  sentThisMonth: number;
  dailyLimitReference: number;
  monthlyLimitReference: number;
  consoleUrl: string;
}
interface VercelUsage {
  deploymentsLast24h: number;
  deploymentsPerDayReference: number;
  activeCpuHoursReference: number;
  provisionedMemoryGbHoursReference: number;
  functionInvocationsReference: number;
  edgeRequestsReference: number;
  usageUrl: string;
  billingUrl: string;
}
interface CronJobOrgJob {
  title: string;
  enabled: boolean;
  lastStatus: string | null;
  lastExecutionAt: string | null;
}
interface CronJobOrgUsage {
  jobs: CronJobOrgJob[];
  consoleUrl: string;
}

type Payload = {
  neon: FetchResult<NeonUsage>;
  resend: FetchResult<ResendUsage>;
  vercel: FetchResult<VercelUsage>;
  cronJobOrg: FetchResult<CronJobOrgUsage>;
};

function pct(used: number, included: number): number {
  if (included <= 0) return 0;
  return Math.min(100, Math.max(0, (used / included) * 100));
}

function meterClass(p: number): string {
  if (p >= 90) return "usage-crit";
  if (p >= 70) return "usage-warn";
  return "usage-ok";
}

function Meter({ label, used, unit, included, includedLabel }: {
  label: string;
  used: number;
  unit: string;
  included: number;
  includedLabel?: string;
}) {
  const p = pct(used, included);
  return (
    <div className="usage-metric">
      <div className="l">{label}</div>
      <div className="n">
        {used.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit}
        <small>
          / {includedLabel ?? `${included.toLocaleString()} ${unit}`} ({p.toFixed(0)}%)
        </small>
      </div>
      <div className="usage-meter-track">
        <div className={`usage-meter-fill ${meterClass(p)}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="usage-metric">
      <div className="l">{label}</div>
      <div className="n">{value}</div>
    </div>
  );
}

function NotConfigured({ hint }: { hint: string }) {
  return <p className="note">{hint}</p>;
}

function ServiceError({ message }: { message: string }) {
  return <div className="snack snack-danger">Couldn&apos;t load live data: {message}</div>;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="link" href={href} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  );
}

// Admin-only "Consumption" tab (BL-090, CLAUDE-CONCEPT.md section 20) — one
// panel per external service this app depends on, showing whatever live
// usage figure that service's API actually exposes plus a direct link to its
// billing/usage page. Fetched on demand (mount + manual Refresh), nothing
// polled or stored — see lib/resourceUsage.ts for what's live vs. reference.
export function ResourceUsageTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/settings/resource-usage", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setLoadError("Couldn't load resource usage.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="usage-grid">
      <div className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className="note" style={{ margin: 0 }}>
          Pulled live from each service on open — nothing here is polled or stored.
        </p>
        <button className="btn btn-secondary small" disabled={loading} onClick={load}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loadError && <div className="snack snack-danger">{loadError}</div>}

      {/* Neon */}
      <div className="panel usage-service">
        <div className="panel-head">
          <h2>Neon (database)</h2>
          {data?.neon.configured && data.neon.data && (
            <div className="usage-service-links">
              <ExternalLink href={data.neon.data.consoleUrl}>Billing</ExternalLink>
            </div>
          )}
        </div>
        <div className="usage-body">
          {!data ? (
            <p className="note">Loading…</p>
          ) : !data.neon.configured ? (
            <NotConfigured hint="Add NEON_API_KEY and NEON_PROJECT_ID (Neon Console → Account → API keys) to enable." />
          ) : data.neon.error ? (
            <ServiceError message={data.neon.error} />
          ) : data.neon.data ? (
            <>
              <div className="usage-row-grid">
                <Meter
                  label="Compute this period"
                  used={data.neon.data.computeHours}
                  unit="hrs"
                  included={data.neon.data.computeHoursIncluded}
                />
                <Meter
                  label="Data transfer this period"
                  used={data.neon.data.dataTransferGB}
                  unit="GB"
                  included={data.neon.data.dataTransferIncludedGB}
                />
                <Stat label="Storage now" value={`${data.neon.data.storageGB.toFixed(2)} GB`} />
              </div>
              <p className="note">
                Period {new Date(data.neon.data.periodStart).toLocaleDateString()} –{" "}
                {new Date(data.neon.data.periodEnd).toLocaleDateString()}. Compute-hours allowance is the Launch
                plan figure confirmed 2026-09-08 — Neon&apos;s general pricing describes Launch as pay-as-you-go
                with no fixed allowance, so treat that one ceiling as approximate.
              </p>
            </>
          ) : null}
        </div>
      </div>

      {/* Resend */}
      <div className="panel usage-service">
        <div className="panel-head">
          <h2>Resend (email)</h2>
          {data?.resend.configured && data.resend.data && (
            <div className="usage-service-links">
              <ExternalLink href={data.resend.data.consoleUrl}>Billing</ExternalLink>
            </div>
          )}
        </div>
        <div className="usage-body">
          {!data ? (
            <p className="note">Loading…</p>
          ) : !data.resend.configured ? (
            <NotConfigured hint="Add RESEND_USAGE_API_KEY (a separate, read-scoped key — not the send-only RESEND_API_KEY) to enable." />
          ) : data.resend.error ? (
            <ServiceError message={data.resend.error} />
          ) : data.resend.data ? (
            <>
              <div className="usage-row-grid">
                <Meter
                  label="Sent today"
                  used={data.resend.data.sentToday}
                  unit="emails"
                  included={data.resend.data.dailyLimitReference}
                />
                <Meter
                  label="Sent this month"
                  used={data.resend.data.sentThisMonth}
                  unit="emails"
                  included={data.resend.data.monthlyLimitReference}
                />
              </div>
              <p className="note">
                Limits shown are Resend&apos;s published Free-plan numbers (100/day, 3,000/month) — Resend&apos;s
                API doesn&apos;t expose your actual plan, so if the account is on a paid plan these ceilings don&apos;t
                apply.
              </p>
            </>
          ) : null}
        </div>
      </div>

      {/* Vercel */}
      <div className="panel usage-service">
        <div className="panel-head">
          <h2>Vercel (hosting)</h2>
          {data?.vercel.configured && data.vercel.data && (
            <div className="usage-service-links">
              <ExternalLink href={data.vercel.data.usageUrl}>Usage</ExternalLink>
              <ExternalLink href={data.vercel.data.billingUrl}>Billing</ExternalLink>
            </div>
          )}
        </div>
        <div className="usage-body">
          {!data ? (
            <p className="note">Loading…</p>
          ) : !data.vercel.configured ? (
            <NotConfigured hint="Not available — either VERCEL_API_TOKEN/VERCEL_TEAM_ID are missing, or (in local dev) VERCEL_PROJECT_ID isn't auto-injected outside a Vercel deployment." />
          ) : data.vercel.error ? (
            <ServiceError message={data.vercel.error} />
          ) : data.vercel.data ? (
            <>
              <div className="usage-row-grid">
                <Meter
                  label="Deployments, last 24h"
                  used={data.vercel.data.deploymentsLast24h}
                  unit="deploys"
                  included={data.vercel.data.deploymentsPerDayReference}
                />
              </div>
              <p className="note">
                Vercel has no public API for actual bandwidth/invocation/CPU consumption on the Hobby plan — the
                figures below are the plan&apos;s included monthly ceilings for reference; open Usage above for the
                real numbers.
              </p>
              <div className="usage-row-grid">
                <Stat label="Active CPU incl." value={`${data.vercel.data.activeCpuHoursReference} hrs/mo`} />
                <Stat label="Provisioned memory incl." value={`${data.vercel.data.provisionedMemoryGbHoursReference} GB-hrs/mo`} />
                <Stat label="Function invocations incl." value={`${data.vercel.data.functionInvocationsReference.toLocaleString()}/mo`} />
                <Stat label="Edge requests incl." value={`${data.vercel.data.edgeRequestsReference.toLocaleString()}/mo`} />
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* cron-job.org */}
      <div className="panel usage-service">
        <div className="panel-head">
          <h2>cron-job.org (scheduler)</h2>
          {data?.cronJobOrg.configured && data.cronJobOrg.data && (
            <div className="usage-service-links">
              <ExternalLink href={data.cronJobOrg.data.consoleUrl}>Console</ExternalLink>
            </div>
          )}
        </div>
        <div className="usage-body">
          {!data ? (
            <p className="note">Loading…</p>
          ) : !data.cronJobOrg.configured ? (
            <NotConfigured hint="Add CRONJOB_ORG_API_KEY (cron-job.org Console → Settings → API) to enable." />
          ) : data.cronJobOrg.error ? (
            <ServiceError message={data.cronJobOrg.error} />
          ) : data.cronJobOrg.data ? (
            data.cronJobOrg.data.jobs.length === 0 ? (
              <p className="note">Connected — no jobs found.</p>
            ) : (
              <>
                <div className="usage-jobs">
                  {data.cronJobOrg.data.jobs.map((job, i) => (
                    <div className="usage-job-row" key={i}>
                      <span className="title">{job.title}</span>
                      <span className="meta">
                        {job.enabled ? (
                          <span className="chip chip-success">Enabled</span>
                        ) : (
                          <span className="chip chip-warning">Disabled</span>
                        )}
                        {job.lastStatus && <> · last: {job.lastStatus}</>}
                        {job.lastExecutionAt && <> · {new Date(job.lastExecutionAt).toLocaleString()}</>}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="note">
                  The free plan has no invocation quota — job count and this API&apos;s own request rate are the
                  only caps. Field parsing here is best-effort (not yet live-verified against a real account).
                </p>
              </>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
