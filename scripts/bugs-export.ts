import { bugsPrisma, regenerateBugsMd } from "./_bugs-lib";

// BL-009 — regenerate BUGS.md from the OPEN BugReport rows in the production
// DB. No continuous sync; run this before starting bug work.
//   npm run bugs:export
async function main() {
  const prisma = bugsPrisma();
  try {
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
