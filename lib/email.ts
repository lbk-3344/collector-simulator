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
