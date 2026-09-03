# Solved bugs (archive)

Append-only archive of resolved bugs — number, title, description, dates, and screenshot URL when present — written to when a `BugReport` is marked `RESOLVED` (see `CLAUDE.md`, "Bug handling").

---

## #cmth55eoh0001rifl833g11hn — White background for lines in the list

**Reported:** 2026-08-31 by lbellissard@seagullsoftware.com
**Resolved:** 2026-08-31 (v0.17.2)

**Description:** I want to clearly separate the list from the background, could we have the background in white for workflow list, Item feed, ad devices?

**Fix:** The Workflows, Item Feeds and Devices list tables are now wrapped in a white `.panel` card (`background: var(--surface)`, border, radius), lifting them off the gray page background. Added `.table-scroll.panel` padding rules in `app/globals.css`.

---

## #cmth579bx0003riflo9z1rjh3 — Start and Stop workflow from the list

**Reported:** 2026-08-31 by lbellissard@seagullsoftware.com
**Resolved:** 2026-08-31 (v0.17.2)

**Description:** Within the list of workflows, I'd like to be bale to start and stop with a small icon each workflow. I would like also a general button enabling Stop and start of all workflows

**Fix:** Each workflow row now has a run/stop icon button (green play when stopped, amber stop when running) that PATCHes `status` directly. The header carries **Start all** / **Stop all** buttons that fan out the change over every workflow that isn't already in the target state (disabled when they'd be a no-op). New `.row-icon-btn-run` / `.row-icon-btn-stop` styles.

---

## #cmth5k10o0001elm9defs52zr — Rename PRESENT item feed type

**Reported:** 2026-08-31 by lbellissard@seagullsoftware.com
**Resolved:** 2026-08-31 (v0.17.2)

**Description:** PRESENT is not really self explanatory, we should rename it to IN STOCK

**Fix:** The `PRESENT` item-feed kind is now labelled **"In stock"** everywhere it's shown to the user — the Item Feeds list chip, the create/edit form's kind toggle and its help text, the canvas palette, and the Feed Node on the canvas. The enum value stays `PRESENT` in the database, API, `lib/*`, and `CLAUDE-CONCEPT.md` (display-only relabel, non-breaking). Logged as a decision in `CLAUDE-CONCEPT.md` §13.

---

## #cmth5mgqy0003elm9qwa1fu0p — Info for what Item feed are

**Reported:** 2026-08-31 by lbellissard@seagullsoftware.com
**Resolved:** 2026-08-31 (v0.17.2)

**Description:** In the Item Feed screen, could you add a small description of what is an items feed. I suggest an INFO icon in the title (right to Item Feeds title, same size) with a with an expandable text below. Default is always contracted when navigaing to this the page. We should also do the same for workflows and Devices

**Fix:** New shared `components/PageHeader.tsx` — renders the page title, an ⓘ toggle button immediately to its right, an optional top-right action slot, and a collapsible info panel below the title row. Collapsed on every page mount (per-mount `useState`, so navigating to the page always starts contracted). Wired into the Item Feeds, Workflows and Devices pages, each with its own blurb.

---

## #cmth5n0260005elm9evdn7djl — Change orders of the left menu

**Reported:** 2026-08-31 by lbellissard@seagullsoftware.com
**Resolved:** 2026-08-31 (v0.17.2)

**Description:** Items Feeds should come before workflows.

**Fix:** Reordered `NAV_ITEMS` in `components/AppShell.tsx` — sidebar order is now Overview · Devices · Item Feeds · Workflows.

---

## #6 — Mouse over a item feed link with a device has the text in black so invisible

**Reported:** 2026-08-31 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

When Mouse over a item feed link with a device, the text becomes in black so invisible to human eyes, maybe have it in a very ight gray would show it is 'selected' but still be readable

---

## #7 — Add Activity icon in the Workflow list page

**Reported:** 2026-09-01 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

Instead of having to click and open the workflow graph panel, add an icon for the activity on the main list page

---

## #8 — Color of Stopped workflow in Workflow list page

**Reported:** 2026-09-01 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

Please use the red color in background with text in black for the stop status of a workflow, consistent with the color we use for devices.

---

## #9 — Color of all Orange Button

**Reported:** 2026-09-01 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

Change the color of actual Orange line buttons, into an Orange filled and Text in White

---

## #11 — Sorting in Device List

**Reported:** 2026-09-01 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

I'd like to be able to sort the device list when clicking on the column header. Same thing with the Item feed list and workflow

---

## #12 — Display the Location of the Feed in feed list page

**Reported:** 2026-09-01 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

I'd like to display the site the feed is attached to when there is one. For New feed or Fixed, we should display All Sites

---

## #15 — Filter by Site in the device list

**Reported:** 2026-09-01 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

I want to be able to filter the device list (and also the feed list) by location. Default is all site, first choice is the site that is already selected in Overview

---

## #13 — Zoom with mouse on the map

**Reported:** 2026-09-01 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

Could we have the same behavior than on the workflow map, using the various button of the mouse or the mouse wheel.

---

## #10 — Relinking in workflow graph

**Reported:** 2026-09-01 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

I'd like to be able to reposition source or destination of link to another corresponding object.

---

## #14 — contextual menu for device or link in the workflow graph

**Reported:** 2026-09-01 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-01

I'd like to be bale to delete device or link by right clicking. I'd like also to cut, copy and paste link (not device) through that contextual menu.

---

## #16 — Live Update of new items in the Admin tabs

**Reported:** 2026-09-02 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-03

When new users are waiting, or new annoucement have been created or new bugs, there is an red circle showing how many of them are waiting. When announceents, or Users or Bugs are processed, this circle stays and is udate on next update. I'd like it disappear live when all users are validated, when all annoucements are published or when all bugs are processed.

**Fix (v0.31.4):** the three Settings tab badges are no longer frozen SSR props. New `GET /api/settings/badges` (admin) returns the live pending-user / open-bug / draft-announcement counts; `SettingsTabs` seeds from the SSR values then polls it every 8s, and `UsersTable` / `AnnouncementsTab` call a `refreshBadges` callback right after any mutation so a circle clears immediately, not on the next navigation.

---

## #17 — REQ: Favicon

**Reported:** 2026-09-02 by Ian Cummings <icummings@seagullsoftware.com>
**Resolved:** 2026-09-03

Give the BarTender T&T Simulator a suitable favicon.  Maybe an aeroplane, to distinguish it, rather than the usual orange BT logo.

**Fix:** already delivered by BL-077/BL-077a (v0.29.x) — the favicon is now a custom simulator mark (diagonal-notch triangle + signal arcs, white-on-orange), distinct from the plain BarTender logo. Resolved as done per Luc; the aeroplane motif specifically was not adopted.

---

## #18 — Display All devices when All Sites is selected

**Reported:** 2026-09-02 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-03

When navigating to the device page with a selected location that does not have devices, then All Site is selected in the list page. However, no devices are displayed where all should be displayed.

**Fix (v0.31.4):** the Devices list seeds its site filter from the Overview's selected location. When that location has no devices its code isn't among the dropdown options, so the `<select>` read "All sites" while the filter was still pinned to an empty site. Added a derived `effectiveSiteFilter` that falls back to "all" whenever the current filter matches no device — used for both the `<select value>` and the row filtering, so the two can't disagree. A site the user actively picks always has devices, so a real choice is never overridden.

---

## #19 — History page Title has different face than the titles of the other page.

**Reported:** 2026-09-02 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-03

Make them all consistent, History must be like the other Titles.

**Fix (v0.31.4):** the History page rendered its heading with the Settings-style `.settings-head h1` (no explicit weight/letter-spacing) instead of the shared `PageHeader` (`.page-title`, 700 / -0.005em) that Devices, Workflows and Item Feeds use. Switched History to `<PageHeader>`, so the title now matches the other left-nav pages exactly; its description moved into the same collapsible ⓘ panel as those pages.

---

## #20 — Email to notify of new bugs

**Reported:** 2026-09-03 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-03

A new email notifying of new bugs should be send to the Admin users for them to be aware without connecting.

**Fix (v0.31.4):** `POST /api/bugs` now emails every `ADMIN` user after creating the report — new `bugReportedAdminEmailHtml()` in `lib/email.ts` (mark-headed, bug number + title + reporter + a description excerpt, points at Settings → Bug Reports). Best-effort via `Promise.allSettled`, wrapped so a mail failure never blocks the submission; `RESEND_API_KEY` unset ⇒ skipped, same as every other send in the app.

---

## #21 — Update Bug report list

**Reported:** 2026-09-03 by Luc Bellissard <lbellissard@seagullsoftware.com>
**Resolved:** 2026-09-03

If I am on the bug report page, and a new bug just came in, I don't see it until I refresh (like the number in the red circle). Could it be live?

**Fix (v0.31.4):** `BugReportsTable` now re-fetches `/api/bugs` every 8s while the tab is open, so a report filed in the meantime appears on its own; when the row count moves it also nudges the parent to re-sync the tab badge, so list and circle stay together. Pairs with the #16 badge-polling fix.
