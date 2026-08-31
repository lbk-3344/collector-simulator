// Per-user workspace ownership (BL-067, CLAUDE-CONCEPT.md section 17).
// `ownerId`/`shared` live on Device, Workflow, ItemFeed; Task / FeedNode /
// FeedLink / FlowLink inherit both from their parent Workflow.

// A resource is visible to a user if they own it or it's been shared.
// Applies identically to ADMIN and USER sessions in the normal app surface
// (§17.2/§17.4) — the only cross-owner queries live in the admin-only
// /api/admin/shared-resources + /api/*/[id]/share routes.
export function visibilityWhere(userId: string) {
  return { OR: [{ ownerId: userId }, { shared: true }] };
}

// Only the owner may mutate. A shared record is read-only to everyone else,
// admins included. Returns false → the caller returns 403.
export function isOwner(record: { ownerId: string }, userId: string): boolean {
  return record.ownerId === userId;
}
