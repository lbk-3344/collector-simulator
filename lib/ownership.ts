// Per-user workspace ownership (BL-067, CLAUDE-CONCEPT.md section 17).
// `ownerId`/`shared` live on Device, Workflow, ItemFeed; Task / FeedNode /
// FeedLink / FlowLink inherit both from their parent Workflow.

// A resource is visible to a user if they own it, OR it's shared AND they
// haven't personally hidden it (BL-079, §17.7 — hiding only ever applies to
// a shared-not-owned row; an owned row is never affected). Applies
// identically to ADMIN and USER sessions in the normal app surface
// (§17.2/§17.4) — the only cross-owner queries live in the admin-only
// /api/admin/shared-resources + /api/*/[id]/share routes.
//
// `hiddenBy` is the relation named identically on Device / Workflow /
// ItemFeed, so this one literal is a valid where-input for all three (and
// for `workflow: visibilityWhere(...)` nested filters). Prisma's structural
// typing accepts the shared shape.
export function visibilityWhere(userId: string) {
  return {
    OR: [{ ownerId: userId }, { shared: true, hiddenBy: { none: { userId } } }],
  };
}

// Only the owner may mutate. A shared record is read-only to everyone else,
// admins included. Returns false → the caller returns 403.
export function isOwner(record: { ownerId: string }, userId: string): boolean {
  return record.ownerId === userId;
}
