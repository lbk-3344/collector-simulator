// Admin "Consumption" tab (BL-090, CLAUDE-CONCEPT.md section 20). Pulls
// whatever live usage figure each external service's API actually exposes,
// so Luc can see at a glance whether any free-tier plan is close to its cap.
// Deliberately NOT a monitoring/alerting system — fetched on demand when an
// admin opens the tab, nothing scheduled, nothing stored.
//
// Same fail-open shape as lib/cronClock.ts: every fetcher checks its own env
// vars first and returns `{ configured: false }` instead of throwing when
// they're missing, and catches its own network/parse errors into an `error`
// string rather than letting one flaky service take the whole tab down —
// the route below runs all four with Promise.allSettled AND each fetcher is
// itself exception-safe, so a bug in one never blocks the others.
//
// What's live vs. reference-only, and why (2026-09-14 investigation):
//  - Neon: GET /projects/{id} returns real consumption for the current
//    billing period (compute_time_seconds, data_transfer_bytes,
//    synthetic_storage_size) on ANY plan, including Free — no paid-only
//    consumption-history endpoint needed. Needs a new NEON_API_KEY.
//  - Resend: /emails/metrics gives a real sent-count for a date range, but
//    needs its OWN key (RESEND_USAGE_API_KEY) — live-tested 2026-09-14, the
//    send-only RESEND_API_KEY already used by lib/email.ts 401s on it
//    ("restricted to only send emails"), correctly, and shouldn't be widened
//    just for this. There's also no "quota remaining" endpoint, so the
//    free-plan limits shown alongside the count are static reference numbers
//    (resend.com/pricing, checked 2026-09-14), not read from the account —
//    flagged in the UI, not asserted as fact.
//  - Vercel: no public REST endpoint returns Hobby-plan usage (bandwidth,
//    invocations, Active CPU) at all — confirmed by search, dashboard-only.
//    The one thing the documented API DOES give us is deployment history
//    (GET /v6/deployments), so that's the one live number; everything else
//    is the static Hobby-plan reference table from vercel.com/docs/plans/hobby.
//  - cron-job.org: GET /jobs is real and needs a new CRONJOB_ORG_API_KEY, but
//    the free plan has no invocation quota to measure against (job count +
//    the API's own 100 req/day rate limit are the only caps) — so this panel
//    is a job-health list, not a usage-vs-limit meter. Field names below are
//    read defensively (never assumed) since this wasn't live-tested against
//    a real account before shipping.

type FetchResult<T> = { configured: true; error?: string; data?: T } | { configured: false };

// ─── Neon ────────────────────────────────────────────────────────────────

export interface NeonUsage {
  computeHours: number;
  computeHoursIncluded: number; // reference figure, see NEON_LAUNCH_COMPUTE_HOURS below
  dataTransferGB: number;
  dataTransferIncludedGB: number;
  storageGB: number;
  periodStart: string;
  periodEnd: string;
  consoleUrl: string;
}

// Neon's Launch plan (launch_v3) compute allowance — confirmed in the Neon
// console at the 2026-09-08 upgrade (BACKLOG.md "Production outage
// 2026-09-08" / BL-084). Neon's own general pricing docs describe Launch as
// pure pay-as-you-go with no fixed allowance, which may mean this was a
// promotional/legacy term — shown with that caveat in the UI. Adjust here if
// the plan terms change.
const NEON_LAUNCH_COMPUTE_HOURS = 300;
// Public network egress included per project/month on the Launch plan
// (neon.com/docs/introduction/plans, checked 2026-09-14).
const NEON_LAUNCH_DATA_TRANSFER_GB = 500;

export async function getNeonUsage(): Promise<FetchResult<NeonUsage>> {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) return { configured: false };

  try {
    const res = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { configured: true, error: `Neon API HTTP ${res.status}` };
    const json = await res.json();
    const p = json?.project;
    if (!p) return { configured: true, error: "Unexpected Neon API response shape" };

    return {
      configured: true,
      data: {
        computeHours: Number(p.compute_time_seconds ?? 0) / 3600,
        computeHoursIncluded: NEON_LAUNCH_COMPUTE_HOURS,
        dataTransferGB: Number(p.data_transfer_bytes ?? 0) / 1e9,
        dataTransferIncludedGB: NEON_LAUNCH_DATA_TRANSFER_GB,
        storageGB: Number(p.synthetic_storage_size ?? 0) / 1e9,
        periodStart: p.consumption_period_start ?? "",
        periodEnd: p.consumption_period_end ?? "",
        consoleUrl: `https://console.neon.tech/app/projects/${projectId}?tab=billing`,
      },
    };
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : "Neon API request failed" };
  }
}

// ─── Resend ──────────────────────────────────────────────────────────────

export interface ResendUsage {
  sentToday: number;
  sentThisMonth: number;
  dailyLimitReference: number;
  monthlyLimitReference: number;
  consoleUrl: string;
}

// Resend's Free plan (resend.com/pricing, checked 2026-09-14). Not read from
// the account — Resend's API has no "your plan's limit" field — so this is a
// reference figure, flagged as such in the UI, not asserted as Luc's actual
// plan.
const RESEND_FREE_DAILY = 100;
const RESEND_FREE_MONTHLY = 3000;

async function resendSentCount(apiKey: string, startDate: string, endDate: string): Promise<number> {
  const url = new URL("https://api.resend.com/emails/metrics");
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("metrics", "sent");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Resend API HTTP ${res.status}`);
  const json = await res.json();
  // Defensive: docs describe either a flat object or a `data` array of
  // per-period rows depending on whether dimensions are requested — we ask
  // for none, so expect a flat object, but fall back to summing rows.
  if (typeof json?.sent === "number") return json.sent;
  if (Array.isArray(json?.data)) {
    return json.data.reduce((sum: number, row: { sent?: number }) => sum + (row.sent ?? 0), 0);
  }
  return 0;
}

export async function getResendUsage(): Promise<FetchResult<ResendUsage>> {
  // Deliberately NOT the send-only RESEND_API_KEY used by lib/email.ts — live
  // testing (2026-09-14) confirmed that key 401s on /emails/metrics
  // ("This API key is restricted to only send emails"). Rather than widening
  // a key that's correctly scoped send-only for its actual job, this panel
  // needs its own key with read access (Resend dashboard -> API Keys ->
  // Full access, or the narrowest scope that covers "Emails: Read").
  const apiKey = process.env.RESEND_USAGE_API_KEY;
  if (!apiKey) return { configured: false };

  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);

    const [sentToday, sentThisMonth] = await Promise.all([
      resendSentCount(apiKey, today, today),
      resendSentCount(apiKey, monthStart, today),
    ]);

    return {
      configured: true,
      data: {
        sentToday,
        sentThisMonth,
        dailyLimitReference: RESEND_FREE_DAILY,
        monthlyLimitReference: RESEND_FREE_MONTHLY,
        consoleUrl: "https://resend.com/settings/billing",
      },
    };
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : "Resend API request failed" };
  }
}

// ─── Vercel ──────────────────────────────────────────────────────────────

export interface VercelUsage {
  deploymentsLast24h: number;
  deploymentsPerDayReference: number;
  activeCpuHoursReference: number;
  provisionedMemoryGbHoursReference: number;
  functionInvocationsReference: number;
  edgeRequestsReference: number;
  usageUrl: string;
  billingUrl: string;
}

// Vercel Hobby plan included usage (vercel.com/docs/plans/hobby, checked
// 2026-09-14). No public API returns the CONSUMED side of these — dashboard
// only — so only the reference ceilings are shown next to the one live
// number the deployments API does give us.
const VERCEL_DEPLOYMENTS_PER_DAY = 100;
const VERCEL_ACTIVE_CPU_HOURS = 4;
const VERCEL_PROVISIONED_MEMORY_GB_HOURS = 360;
const VERCEL_FUNCTION_INVOCATIONS = 1_000_000;
const VERCEL_EDGE_REQUESTS = 1_000_000;

// Stable, non-secret identifiers for this project's Vercel team/scope — same
// ones every deployment URL already exposes (collector-simulator-*-chef-mate.vercel.app).
// Team id isn't in .env anywhere (nothing in this codebase needed it after
// the cron skip-gate moved off Global Config, 2026-09-09) — hardcoded here
// rather than adding a var whose only consumer is this one read-only lookup.
const VERCEL_TEAM_SLUG = "chef-mate";
const VERCEL_PROJECT_SLUG = "collector-simulator";
const VERCEL_TEAM_ID = "team_jVWZVRFpRFpbLSAiWG7RchQb";

export async function getVercelUsage(): Promise<FetchResult<VercelUsage>> {
  const token = process.env.VERCEL_API_TOKEN;
  // Auto-injected by Vercel at build/runtime — not set when running locally.
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return { configured: false };

  try {
    const since = Date.now() - 24 * 60 * 60_000;
    const url = new URL("https://api.vercel.com/v6/deployments");
    url.searchParams.set("projectId", projectId);
    url.searchParams.set("teamId", VERCEL_TEAM_ID);
    url.searchParams.set("since", String(since));
    url.searchParams.set("limit", "100");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) return { configured: true, error: `Vercel API HTTP ${res.status}` };
    const json = await res.json();
    const count = Array.isArray(json?.deployments) ? json.deployments.length : 0;

    return {
      configured: true,
      data: {
        deploymentsLast24h: count,
        deploymentsPerDayReference: VERCEL_DEPLOYMENTS_PER_DAY,
        activeCpuHoursReference: VERCEL_ACTIVE_CPU_HOURS,
        provisionedMemoryGbHoursReference: VERCEL_PROVISIONED_MEMORY_GB_HOURS,
        functionInvocationsReference: VERCEL_FUNCTION_INVOCATIONS,
        edgeRequestsReference: VERCEL_EDGE_REQUESTS,
        usageUrl: `https://vercel.com/${VERCEL_TEAM_SLUG}/${VERCEL_PROJECT_SLUG}/usage`,
        billingUrl: `https://vercel.com/${VERCEL_TEAM_SLUG}/~/settings/billing`,
      },
    };
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : "Vercel API request failed" };
  }
}

// ─── cron-job.org ────────────────────────────────────────────────────────

export interface CronJobOrgJob {
  title: string;
  enabled: boolean;
  lastStatus: string | null; // best-effort — see field-name caveat above
  lastExecutionAt: string | null;
}

export interface CronJobOrgUsage {
  jobs: CronJobOrgJob[];
  consoleUrl: string;
}

// cron-job.org's own job-object field names, read defensively (optional
// chaining + fallbacks) since this integration hasn't been live-verified
// against a real account/key yet — see the file header caveat.
function parseCronJob(raw: unknown): CronJobOrgJob {
  const j = raw as Record<string, unknown>;
  const statusRaw = j?.lastStatus ?? j?.lastExecutionStatus ?? j?.status;
  return {
    title: typeof j?.title === "string" ? j.title : "(untitled job)",
    enabled: j?.enabled !== false, // default true unless explicitly disabled
    lastStatus: typeof statusRaw === "string" || typeof statusRaw === "number" ? String(statusRaw) : null,
    lastExecutionAt:
      typeof j?.lastExecution === "number"
        ? new Date(j.lastExecution * 1000).toISOString()
        : typeof j?.lastExecution === "string"
          ? j.lastExecution
          : null,
  };
}

export async function getCronJobOrgUsage(): Promise<FetchResult<CronJobOrgUsage>> {
  const apiKey = process.env.CRONJOB_ORG_API_KEY;
  if (!apiKey) return { configured: false };

  try {
    const res = await fetch("https://api.cron-job.org/jobs", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return { configured: true, error: `cron-job.org API HTTP ${res.status}` };
    const json = await res.json();
    const rawJobs = Array.isArray(json?.jobs) ? json.jobs : [];

    return {
      configured: true,
      data: {
        jobs: rawJobs.map(parseCronJob),
        consoleUrl: "https://console.cron-job.org/jobs",
      },
    };
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : "cron-job.org API request failed" };
  }
}
