# Claude Code prompt — BL-075: Announcements — admin authoring + email + "News" (avatar menu)

## Task:

Luc's direct request: "an announcement mechanism similar to ChefMate, with the image in the email. I'd like to be able to create an announce when a new feature is set, send this as an email to every user and be able to see all announcement in a item under the avatar menu, called News." ChefMate/ChefCellar aren't available to reference directly from this environment (not one of the repos connected to this session) — this prompt is built from scratch against this app's own existing conventions instead, called out explicitly below wherever a real judgment call was made rather than something Luc specified.

Two distinct surfaces, matching Luc's two asks:
1. **Authoring** — an admin-only screen to create/edit an announcement and publish it (which also emails every user). Placed as a new tab inside **Settings** (`app/(app)/settings/SettingsTabs.tsx`), same pattern as the existing admin-only "Users"/"Bug Reports"/"Shared resources" tabs — not a separate `/admin` route (this app has none).
2. **News** — a new top-level item in the avatar menu (`components/UserMenu.tsx`, next to Settings/Report a bug), opening a page that lists every *published* announcement, newest first, for every signed-in user (not admin-gated — everyone should be able to read announcements, only creating/publishing is admin-only).

**Real gap found while researching this, worth flagging plainly**: this app has **no image upload/hosting anywhere yet**. `CLAUDE.md`'s "Bug handling" section assumed Cloudinary "pending confirmation," but it was never actually wired up — the bug report screenshot button is still `disabled` (`components/BugReportModal.tsx`, "Screenshot upload isn't wired up yet — see `BACKLOG.md` BL-008", still open, low priority, never picked up). So "the image in the email" needs a real decision, made here rather than blocking on it: **store the image inline as a base64 data URL** on the `Announcement` row itself (`imageData String?`, capped at 2MB client- and server-side) instead of standing up Cloudinary just for this. No new external dependency, ships now, and the same base64 string drops straight into both the News page `<img>` and the email HTML's `<img src="data:...">` — most email clients (including Gmail, which is what this app's own users are on) render inline base64 images fine; a handful of older/enterprise clients don't, which is a known, acceptable tradeoff for an internal tool, not a blocker. If Luc wants real image hosting later, BL-008 is the natural place to add Cloudinary for both bug screenshots and announcement images at once — note this as a follow-up, don't build it now.

### Phase 1 — schema

Add to `prisma/schema.prisma`:

```prisma
model Announcement {
  id        String    @id @default(cuid())
  title     String
  body      String    // plain text, rendered with line breaks preserved (white-space: pre-wrap) — no rich-text editor in this app anywhere, staying consistent
  imageData String?   // data: URL (base64), capped at 2MB — see the task note above on why no Cloudinary yet

  // Null = draft, visible only in the admin authoring tab. Set = live, shows
  // in every user's News feed. Publishing (not editing) is what triggers the
  // email — see Phase 3.
  publishedAt DateTime?

  // Null = not yet emailed. Set the moment the publish email finishes
  // sending (success or partial failure — see Phase 3) so a later edit to
  // an already-published announcement never re-sends it. Same re-run-guard
  // convention as BugReport's notifiedStartAt/notifiedResolvedAt (CLAUDE.md
  // "Bug handling").
  emailSentAt DateTime?

  authorId String
  author   User   @relation(fields: [authorId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([publishedAt])
}
```

Add the back-relation to `User`: `announcements Announcement[]`.

`npx prisma migrate dev --name add_announcements`.

### Phase 2 — API routes

Follow this app's existing admin-route auth idiom exactly (`getServerSession(authOptions)`, `session.user.role !== "ADMIN"` → `403`, e.g. `app/api/admin/shared-resources/route.ts`).

- **`app/api/announcements/route.ts`**
  - `GET` — signed-in users of any approved role (`USER`/`ADMIN` — exclude `PENDING`, same as every other in-app page): if the caller is `ADMIN`, return every announcement (draft + published) ordered `createdAt desc`, for the authoring tab; otherwise return only `publishedAt != null` ones ordered `publishedAt desc`, for the News page. One route, role-branched — don't build two.
  - `POST` — `ADMIN` only. Creates a draft (`publishedAt: null`) from `{ title, body, imageData? }`. Validate `imageData` (if present) is a `data:image/...` URL and reject anything absurdly large server-side too (don't trust the client-side 2MB check alone).

- **`app/api/announcements/[id]/route.ts`**
  - `PATCH` — `ADMIN` only. Edits `title`/`body`/`imageData`. Never touches `publishedAt`/`emailSentAt` — editing an already-published announcement doesn't re-trigger anything, matches the Device "Save" (vs. "Publish") split already in this app (`CLAUDE-CONCEPT.md` §15.4).
  - `DELETE` — `ADMIN` only. Plain delete, no confirm-then-deregister complexity needed here (unlike Device delete) — nothing external to clean up.

- **`app/api/announcements/[id]/publish/route.ts`**
  - `POST` — `ADMIN` only, mirrors the single-purpose-action-route pattern already used for `[id]/duplicate` and `[id]/share` elsewhere in this app. Sets `publishedAt = now()` if not already set (idempotent — publishing an already-published one just no-ops on that field). Then, **only if `emailSentAt` is still null**, sends the announcement email to every `USER`/`ADMIN` (exclude `PENDING` — they haven't been approved into the app yet) via `Promise.allSettled` over individual `sendEmail()` calls (see Phase 3), then sets `emailSentAt = now()` regardless of how many individual sends failed (matches this app's "a failure surfaces, never blocks" pattern — e.g. `PRESENT` read-push failures, platform resync failures). Return `{ published: true, emailed: <sent count>, total: <recipient count> }` so the admin UI can show "Sent to 11 of 12 users."

### Phase 3 — email

Extend `lib/email.ts` (don't touch `sendEmail()`'s core signature — it's already a clean 1-recipient primitive, reused as-is) with:

```typescript
export function announcementEmailHtml(announcement: { title: string; body: string; imageData: string | null }): string {
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
```

(Add a small `escapeHtml` helper if this file doesn't already have one — check first.) Subject line: the announcement's `title` directly, no extra prefix needed (`FROM_EMAIL` already identifies this app). Call `sendEmail(user.email, announcement.title, announcementEmailHtml(announcement))` per recipient from the publish route.

### Phase 4 — admin authoring tab

`app/(app)/settings/SettingsTabs.tsx` — add a 5th tab, `"announcements"`, `ADMIN`-only exactly like `users`/`bugs`/`sharing` (same `isAdmin &&` guard, same `.tab`/`.badge` markup — a badge showing the draft count is a nice touch, optional, use your judgment). New component `app/(app)/settings/AnnouncementsTab.tsx`, following `BugReportsTable.tsx`'s structure (fetch-on-mount list + a row-click-to-open-detail pattern, or a simpler inline create form above the list — your call on exact layout, this app doesn't have a strong precedent either way for a create-in-place form):

- A "+ New announcement" action opening a small form (title text input, body textarea, image file input).
- Image input: plain `<input type="file" accept="image/*">`, read via `FileReader.readAsDataURL` client-side, reject (inline error, don't silently truncate) anything over 2MB before it ever reaches state/the request body.
- List of existing announcements (draft and published, admin sees both) — title, a Draft/Published state pill (reuse `.device-state`-style dot+label CSS or this app's existing badge pattern, your call), created date, and for published ones the send result ("Sent to N/M" from the publish response, or "not yet sent" if `emailSentAt` is somehow still null after publishing — shouldn't normally happen but don't crash on it).
- Row actions: Edit (reopens the form, `PATCH`), Delete (`DELETE`, confirm first — this app's existing delete-confirm pattern), and for drafts, **Publish** (calls the publish route; before calling it, confirm explicitly — "This will email every user. Continue?" — since it's irreversible in the sense that emailing everyone can't be undone, same spirit as the Device-delete-deregister second confirm). A published announcement's Publish button either disappears or becomes disabled (it's already live).

### Phase 5 — News page + avatar menu link

`app/(app)/news/page.tsx` — server component, session-gated like every other page under `(app)`, fetches published announcements (reuse the same `GET /api/announcements` logic directly via Prisma rather than an internal fetch, matching how other server-component pages in this app read data). Simple feed layout: each announcement as a `.panel` card — image at top (if present, `max-width: 100%`), title, formatted publish date, body with line breaks preserved. Empty state ("No announcements yet") if the list is empty, matching this app's existing `.placeholder` pattern.

`components/UserMenu.tsx` — add a new `<Link href="/news" className="user-menu-item">` between "Settings" and "Report a bug" (a simple bell/megaphone-style inline SVG icon, matching the existing icon style of the other menu items — stroke-only, `currentColor`, ~20px viewBox). No unread-badge/count for now — Luc only asked to be able to see all announcements, not for read-tracking; flag it as a natural follow-up in the doc update (Phase 6) rather than building it.

### Phase 6 — docs

- `CLAUDE-CONCEPT.md`: new numbered section (pick the next free top-level number, following this doc's existing numbering) covering the `Announcement` model, the draft/publish split and why (mirrors Device's Save/Publish precedent), the base64-image decision and the BL-008/Cloudinary follow-up, the publish-triggers-email-once guard, and the News page/avatar-menu placement. Add a dated entry to §13 recording this as Luc's direct request, plus the two judgment calls flagged in this prompt (base64 image storage instead of Cloudinary; no unread-tracking on News yet).
- `BACKLOG.md`: new **BL-075** entry (checked off on completion), plus update BL-008's existing note to mention it would also cover announcement images if ever picked up.

### Verify

- A draft announcement is only visible in the admin tab, never in `/news` or via the non-admin `GET /api/announcements` response.
- Publishing sends exactly one email per `USER`/`ADMIN` (not `PENDING`), and editing a published announcement afterward does not send anything again — confirm by publishing, then editing the body, and checking no second email fires (`emailSentAt` unchanged).
- The image renders correctly in both the News page and the actual received email (send at least one real test email via a configured `RESEND_API_KEY`, or confirm `sendEmail`'s existing "skipped, no key configured" path degrades the same way the bug-notify flow already does if no key is set in this environment).
- A >2MB image is rejected client-side with a clear message and never reaches the API; also confirm the server-side check independently rejects an oversized `imageData` even if a client bypassed the front-end check (e.g. via a raw `curl` to the POST route).
- A non-admin user sees no "Announcements" Settings tab at all (not just disabled), and gets a `403` calling the admin-only routes directly.
- `News` appears in the avatar menu for every signed-in, approved role and lists published announcements newest-first with working images/line breaks.
- Existing E2E suite still green.

### Conventions

- Branch `staging`.
- New backlog item, no letter suffix → `npm version minor --no-git-tag-version`, same commit as the fix.
- Check off `BACKLOG.md` BL-075 with a short completion note, including whatever real email send you verified with (or the "no RESEND_API_KEY configured, verified the skip path instead" fallback note, same as prior email-touching items in this backlog when a key wasn't available).
