import { bugsPrisma, resolveRef, regenerateBugsMd, resolvedEmail, reporterLabel, BUG_SELECT, type BugRow } from "./_bugs-lib";
import { sendEmail } from "../lib/email";

// BL-010 — email the reporter that their bug's fix has reached production, then
// DELETE the BugReport row (CLAUDE.md step 4). Run only after the fix is
// actually live in prod.
//   npm run bugs:notify-resolved -- <ref>     (number or cuid; required)
//   npm run bugs:notify-resolved              (all RESOLVED, not-yet-notified)
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
      if (bug.status !== "RESOLVED") {
        console.error(`#${bug.number} is ${bug.status}, not RESOLVED. Run  npm run bugs:resolve -- ${bug.number}  first.`);
        process.exit(1);
      }
      bugs = [bug];
    } else {
      bugs = (await prisma.bugReport.findMany({
        where: { status: "RESOLVED", notifiedResolvedAt: null },
        orderBy: { number: "asc" },
        select: BUG_SELECT,
      })) as BugRow[];
    }

    if (bugs.length === 0) {
      console.log("No resolved bugs to notify.");
      return;
    }

    for (const bug of bugs) {
      const { subject, html } = resolvedEmail(bug);
      const res = await sendEmail(bug.reporter.email, subject, html);
      // Mark notified first (so a delete failure doesn't re-send), then delete the row.
      await prisma.bugReport.update({ where: { id: bug.id }, data: { notifiedResolvedAt: new Date() } });
      await prisma.bugReport.delete({ where: { id: bug.id } });
      console.log(
        `#${bug.number} -> ${reporterLabel(bug)} : ${res.ok ? "email sent" : res.skipped ? "email skipped (no RESEND_API_KEY)" : `email failed (${res.error})`}; row deleted.`
      );
    }

    const n = await regenerateBugsMd(prisma);
    console.log(`BUGS.md regenerated — ${n} open bug${n === 1 ? "" : "s"}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
