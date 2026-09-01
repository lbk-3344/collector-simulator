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
