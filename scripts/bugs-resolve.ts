import { bugsPrisma, resolveRef, regenerateBugsMd, appendSolvedBugMd } from "./_bugs-lib";

// BL-011 — mark a fixed bug RESOLVED: set status + resolvedAt in the production
// DB, append it to SOLVED-BUGS.md, and regenerate BUGS.md. The row is NOT
// deleted here — that happens in bugs:notify-resolved once the fix is in prod.
//   npm run bugs:resolve -- <ref>     (number or cuid; required)
async function main() {
  const ref = process.argv[2];
  if (!ref) {
    console.error("Usage: npm run bugs:resolve -- <bug number or id>");
    process.exit(1);
  }

  const prisma = bugsPrisma();
  try {
    const bug = await resolveRef(prisma, ref);
    if (!bug) {
      console.error(`No bug found for "${ref}".`);
      process.exit(1);
    }

    if (bug.status !== "RESOLVED") {
      const resolvedAt = new Date();
      await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "RESOLVED", resolvedAt } });
      bug.status = "RESOLVED";
      bug.resolvedAt = resolvedAt;
      console.log(`#${bug.number} marked RESOLVED.`);
    } else {
      console.log(`#${bug.number} was already RESOLVED.`);
    }

    const archived = appendSolvedBugMd(bug);
    console.log(archived ? "Appended to SOLVED-BUGS.md." : "Already in SOLVED-BUGS.md — left as is.");

    const n = await regenerateBugsMd(prisma);
    console.log(`BUGS.md regenerated — ${n} open bug${n === 1 ? "" : "s"} left.`);
    console.log(`\nNext: once the fix is live in production, run  npm run bugs:notify-resolved -- ${bug.number}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
