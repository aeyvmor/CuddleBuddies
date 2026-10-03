# Operational web app

Implement the React + Vite + TypeScript operations map, issue filters/details, evidence review, explainable score, and officer-controlled work-order lifecycle.

Keep visual styling replaceable for the separate UI designer: use semantic CSS custom properties/design tokens, CSS Modules, and accessible headless primitives. Avoid coupling application behavior to a fixed component library or hard-coded visual decisions. Use shared contracts rather than inventing client-only API shapes.

Do not depend on Google Street View for the hackathon MVP. Prefer team-captured photos, synthetic demo data, or explicitly licensed local imagery. Clearly mark any non-ASTIG image source; use only approved imagery as model input.

## Current status

- **Data source:** an in-memory **mock API** (`src/api/mockClient.ts`) serving **synthetic, labeled** records (`src/data/syntheticData.ts`). Nothing here is real captured data. The backend owner is wiring the HTTP client (`packages/api-client`) and choosing the map provider.
- **Contracts:** shapes come from `@astig/contracts` (draft v0). The mock validates requests with the shared Zod schemas and checks its own responses against them. A test parses every synthetic record with `IssueDetailResponse`.
- **Server rules mirrored by the mock:**
  - officer-only issue detail and writes (`FORBIDDEN`);
  - idempotent create, where the same key and body replays the original and a different body returns `IDEMPOTENCY_CONFLICT`;
  - `ISSUE_NOT_OPEN`, `ACTIVE_WORK_ORDER_EXISTS`, `RISK_ASSESSMENT_MISMATCH`;
  - `INVALID_TRANSITION` and `WORK_ORDER_CLOSED`;
  - resolving the work order resolves the issue.
- **Features:**
  - schematic map and issue queue, with severity / type / area / issue status / work-order filters;
  - a result line ("Showing 45 of 300 issues") and **Clear filters (n)**; a set filter is outlined and tinted;
  - the queue is in the contract's list order (score, then most recently observed, then id) and scrolls inside its card. It keeps the selected row in view;
  - issue detail: **Previous / Next** through the filtered queue ("Issue 2 of 4 in the queue") and **Close**, plus status, location uncertainty, observed range, evidence history, confidence, review flag, sampling method, failed processing, and image availability;
  - score breakdown, where `UNKNOWN` inputs are shown as unknown and never as zero;
  - officer-only work-order create and `OPEN → IN_PROGRESS → RESOLVED`.
- **Load failures:** they show as failures, not as empty data. Summary tiles show "–", the map and queue say "Issues could not be loaded", and the alert has **Try again**. Before this fix the page showed zeros and "No issues match", which looks like a clean result.
- **Layout:** follows the command-center and issue-detail mockups in `visual/`.
  - Shell: left sidebar (brand, in-page section links, data-source note) and a sticky top bar (page title, synthetic-data badge, demo role).
  - Command center: summary tiles, filters, then the schematic map beside the issue queue (sorted by priority score, highest first).
  - Issue review: opens below the map and queue and scrolls into view. Evidence is on the left; priority score with gauge, location and history, and the work order are on the right.
  - Summary tiles are counts of the issue list the page already holds (open issues by highest AI severity estimate, open, resolved). They are not the analytics summary. On phones they are three to a row and compact.
  - The synthetic-data badge is full size in the top bar and the detail header. Repeated rows (queue, evidence cards) carry a compact "Synthetic" badge in the same colours.
  - Left out on purpose because they are outside the MVP or not backed by data: auto-dispatch / "Deploy crew", real-time sensor and system-status claims, heatmap layer, weather and hazard alerts, recommended dispatch action (gap G6), export and audit-log actions, and the executive analytics page.
- **Styling:** Civic Pulse direction (`visual/civic_pulse_design_system/DESIGN.md`) through tokens in `src/styles/tokens.css`. `src/styles/primitives.module.css` holds the shared card, pill, button and field styles. There is one CSS Module per component, and no UI component library. Icons are a small inline SVG set (`src/components/Icon.tsx`), all decorative.
  - **Fonts:** Plus Jakarta Sans is self-hosted through `@fontsource-variable/plus-jakarta-sans` (OFL-1.1, imported in `src/main.tsx`), so there is no third-party font request. The system UI font is the fallback.
- **Demo role selector:** a placeholder until real auth is chosen. Its roles are the contract's `OPERATOR` and `OFFICER`, and it defaults to `OPERATOR`.

Commands (from the repo root): `npm install`, `npm run dev -w @astig/web`, `npm test -w @astig/web`, `npm run build -w @astig/web`.

## Contract gaps

Closed by the backend's `GET /issues` contract (`packages/contracts/src/issue-list.ts`):
- **G1 list shape:** `IssueListItem` is imported from the contract.
- **G2 severity:** the list item carries it.
- **G3 filters:** `src/api/types.ts` keeps a local `IssueListFilters`, which is the filter subset of `IssueListQuery`. Paging and `bbox` are added by the HTTP client.
- **G4 role:** the route is `OFFICER`.
- **G5 area names:** they come with the list response. The mock still collects them from an unfiltered call.

Still open:

| # | Gap | Web workaround now | Smallest proposed fix (backend owner) |
| --- | --- | --- | --- |
| G6 | Requirement 10 "recommendation" has no field (also noted as a gap in `contract-v0-proposal.md`) | The web dropped the invented `recommendation` text | Add the priority band once thresholds are agreed |
| G7 | `ProcessingError.code` values are free strings | Shown verbatim | Enumerate the worker's codes |
| G8 | The list is paged (max 200 per call); the queue and Previous/Next cover the loaded page only | The mock returns everything | HTTP client: "Load more" with `nextCursor`, or raise the page size for the demo |

Superseded proposals from `docs/api/client-contract-proposal.md`: contract v0 uses camelCase, not snake_case. Other replacements:
- `KNOWN`/`UNKNOWN`, not `MEASURED`/`UNAVAILABLE`.
- `assignedTeam`, not `assignee`.
- `EvidenceAccess`, not `image_url`.
- `OPERATOR`/`OFFICER`, not `VIEWER`.
- `ACTIVE_WORK_ORDER_EXISTS`, not `WORK_ORDER_EXISTS`.

The web follows the contract in each case.

The map is a schematic placeholder, not a basemap, because the map provider is undecided. `IssueMap` props are the seam for a provider-backed map.

## Accessibility and keyboard behavior

- **Tab order:**
  1. "Skip to issue detail" link (only once a detail is shown; hidden until focused);
  2. sidebar section links ("Command center", "Issue queue", and "Issue review" once an issue is shown);
  3. demo role;
  4. the five filters, then "Clear filters" when any is set;
  5. map markers;
  6. issue queue;
  7. issue detail: Previous, Next, Close, the "Issue queue" back link, the work-order form fields, then the action button.
- **Selecting an issue:** the detail renders below the map and queue and is scrolled into view (smooth scrolling is off under `prefers-reduced-motion`). Markers and list rows are buttons with `aria-pressed`, activated with Enter or Space. Selecting does not move focus. The new detail is announced in a polite status region ("Showing issue detail: …, 2 of 4."), and the skip link jumps to it. Previous and Next are disabled at the ends of the queue. Close returns to the queue and announces "Issue detail closed." Markers and rows are two tab stops per issue; the list is the textual equivalent of the schematic map.
- **Work-order actions:**
  - **Create:** focus moves to the "Work order" heading, because the form disappears, and "Work order created. Status: Open." is announced.
  - **Mark In progress:** focus stays on the same button, which becomes "Mark Resolved", and the change is announced.
  - **Mark Resolved:** focus moves to the heading and the change is announced.
  - **While a request runs:** the button is `aria-disabled`, not `disabled`, so focus is not lost.
- **Errors:** errors and refused requests (for example `Requires role OFFICER.`) use `role="alert"`. Read-only users get disabled controls plus a text explanation.
- **No meaning by colour alone:**
  - map markers carry a severity letter (C/H/M/L/?) and an `aria-label`, with a text legend;
  - severity and status pills are text;
  - the work-order stepper has a text state per step ("Done", "Current", "Not started") and `aria-current="step"`;
  - unknown score inputs say "Unknown (not measured)", and the score bars are decorative.
- **Focus:** one global `:focus-visible` style: a 3px `--color-focus` ring with a white halo, 5.8:1 or better on every surface.
- **Contrast:** measured for token pairs with a WCAG 2.x formula.
  - All text is 4.5:1 or better, and non-text indicators are 3:1 or better.
  - Departures from DESIGN.md: brand green `#00B14F` is 2.8:1 on white, so it is not used for text or filled buttons, which use the design system's `primary` `#006E2E` (6.4:1). Muted text is `#475569`, not `#64748B` (4.3:1 on tinted surfaces). Control borders are `#7B8794` (3.3:1 or better).
- **Tests:** `src/a11y.test.tsx` covers the keyboard path (Tab/Enter only, from list selection through create to `RESOLVED`, with focus and announcements asserted), marker activation by keyboard, the skip link, the alert for refused requests, and the text equivalents for colour. `src/manage.test.tsx` covers:
  - the result count and Clear filters;
  - the issue-status filter;
  - queue order;
  - Previous / Next / Close, and Next stopping at the end;
  - a failed load showing dashes and "could not be loaded", never zeros, and recovering on Try again;
  - 300 issues.
- **Not covered:** no screen-reader testing (NVDA/JAWS/TalkBack) and no automated axe scan, because that would be a new dependency.

## Stress check (2026-10-04, headless Edge, temporary harness; not in the repo)

| Case | Result |
| --- | --- |
| 300 issues, long area and road names | First render about 100 ms. 300 markers and 300 rows. Page height **1,314 px**; before the fix it was **36,709 px**. The cause was the rows' visually-hidden text, which was positioned relative to the page instead of the scrolling list. |
| Select row 151, then Next | Detail shows "Issue 152 of 300", and the selected row stays visible in the queue. |
| Severity Critical + status Open | 45 of 300. Both filters are marked as set, and Clear filters (2) is shown. |
| No matches | Map and queue say "No issues match the current filters." |
| List load fails | Tiles show "–" (not 0), "Issues could not be loaded", Try again. |
| 390 px wide | No horizontal overflow. Previous / Next / Close share one row. Tiles are three to a row. |

At 300 issues the schematic map's markers overlap. Clustering belongs to the map provider the backend owner is choosing.
