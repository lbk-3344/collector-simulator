import { bugsPrisma, resolveRef, startEmail, reporterLabel, BUG_SELECT, type BugRow } from "./_bugs-lib";
import { sendEmail } from "../lib/email";

// BL-010 — email the reporter that work on their bug has started.
//   npm run bugs:notify-start -- <ref>     (number or cuid; required)
//   npm run bugs:notify-start              (all OPEN, not-yet-notified bugs)
// `notifiedStartAt` makes this safe to re-run.
async function main() {
  const ref = process.argv[2];
  const prisma = bugsPrisma();
  try {
    let bugs: BugRow[];
    if (ref) {
      const bug = await resolveRef(prisma, ref);
      if (!bug) {
        console.error(`No bug found for "${ref}".`);
        process.exit(1);
      }
      if (bug.notifiedStartAt) {
        console.log(`#${bug.number} already had a start notification (${bug.notifiedStartAt.toISOString()}). Nothing sent.`);
        return;
      }
      bugs = [bug];
    } else {
      bugs = (await prisma.bugReport.findMany({
        where: { status: "OPEN", notifiedStartAt: null },
        orderBy: { number: "asc" },
        select: BUG_SELECT,
      })) as BugRow[];
    }

    if (bugs.length === 0) {
      console.log("No bugs to notify.");
      return;
    }

    for (const bug of bugs) {
      const { subject, html } = startEmail(bug);
      const res = await sendEmail(bug.reporter.email, subject, html);
      await prisma.bugReport.update({ where: { id: bug.id }, data: { notifiedStartAt: new Date() } });
      console.log(
        `#${bug.number} -> ${reporterLabel(bug)} : ${res.ok ? "email sent" : res.skipped ? "email skipped (no RESEND_API_KEY)" : `email failed (${res.error})`}; notifiedStartAt set.`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
