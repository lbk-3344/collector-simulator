import { Resend } from "resend";

// Transactional email via Resend — same provider as ChefMate/ChefCellar
// (CLAUDE.md "Bug handling"). The only thing that sends mail today is the bug
// reporter-notification flow (BL-010, scripts/bugs-notify-*.ts). If
// RESEND_API_KEY isn't set the send is skipped with a warning rather than
// throwing, so the surrounding script (which also mutates the DB) still
// completes — matching how the run engine treats a failed platform call.

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "BarTender T&T Simulator <onboarding@resend.dev>";

export function isEmailConfigured(): boolean {
  return resend !== null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Announcement blast email body (BL-075, CLAUDE-CONCEPT.md section 18). The
// image, when present, is an inline base64 data: URL — the same string the
// News page renders — so there's nothing external to fetch.
export function announcementEmailHtml(announcement: {
  title: string;
  body: string;
  imageData: string | null;
}): string {
  const imageBlock = announcement.imageData
    ? `<img src="${announcement.imageData}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:16px;display:block;" />`
    : "";
  const bodyHtml = announcement.body
    .split("\n")
    .map((line) => `<p style="margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(line)}</p>`)
    .join("");
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      ${imageBlock}
      <h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(announcement.title)}</h1>
      ${bodyHtml}
    </div>
  `;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipped: "${subject}" -> ${to}`);
    return { ok: false, skipped: true };
  }
  try {
    const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    if (error) {
      console.error("[email] Resend rejected the send:", error);
      return { ok: false, error: String(error.message ?? error) };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] Resend send threw:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
