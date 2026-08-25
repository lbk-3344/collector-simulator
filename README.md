# Bartender Track and Trace Simulator

Repo: `collector-simulator`

A web app that simulates real-life Track & Trace infrastructure (Devices, Workflows, Serialized Items) to produce test data for the **Bartender Track & Trace platform**.

- Specification / concept: see [CLAUDE-CONCEPT.md](./CLAUDE-CONCEPT.md)
- Design charter: see [CHARTE-GRAPHIQUE.md](./CHARTE-GRAPHIQUE.md)
- Backlog: see [BACKLOG.md](./BACKLOG.md)

## Getting-started roadmap

1. **Specification** — concept, objectives, KPIs, success criteria (`CLAUDE-CONCEPT.md`)
2. **Design** — name, charter, screens (`CHARTE-GRAPHIQUE.md`) — lower priority for this internal tool
3. **Dev project setup** — tooling, GitHub, database, working method
4. **Backlog** — `BACKLOG.md`, starting with section 0's open decisions
5. **Development** — start of code
6. **Iteration** — backlog → implementation → tests → feedback

## Tech stack

Proposed: Next.js (App Router, TypeScript) · React · Prisma · PostgreSQL (Neon) · Vercel deployment — same as ChefMate/ChefCellar. To confirm — see `BACKLOG.md` BL-001.

## Local development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL (Neon) in .env
npx prisma generate
npx prisma migrate dev --name init   # first migration
npm run dev                          # http://localhost:3000
```

*(Scaffold not yet created — the commands above are the target setup, mirroring ChefMate/ChefCellar, once BL-001 is confirmed.)*

## Deployment

To be set up on the same model as ChefMate/ChefCellar once the stack is confirmed (BL-001) and hosting specifics are settled (BL-005): Neon for the database (one per environment), Vercel for hosting, a `staging` branch for Preview deployments and `main` for Production — see `CLAUDE.md`, "Branches and deployment cycle".
