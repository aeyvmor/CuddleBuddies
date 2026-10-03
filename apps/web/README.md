# Operational web app

Implement the React + Vite + TypeScript operations map, issue filters/details, evidence review, explainable score, and officer-controlled work-order lifecycle.

Keep visual styling replaceable for the separate UI designer: use semantic CSS custom properties/design tokens, CSS Modules, and accessible headless primitives. Avoid coupling application behavior to a fixed component library or hard-coded visual decisions. Use shared contracts rather than inventing client-only API shapes.

Do not depend on Google Street View for the hackathon MVP. Prefer team-captured photos, synthetic demo data, or explicitly licensed local imagery. Clearly mark any non-ASTIG image source; use only approved imagery as model input.

## Current status

- **Data source (`VITE_ASTIG_API`):**
  - `live` (default for `npm run dev` and production builds): the deployed API (`https://2jpf5wobhl.execute-api.ap-southeast-1.amazonaws.com`) through `@astig/api-client`, behind a Cognito sign-in. `src/api/httpClient.ts` adapts `AstigClient` to the UI's `ApiClient` interface. Live data mixes labeled synthetic seed records and the dashcam-replay demo issues; both are `isSynthetic` and badged. See `docs/api/integration-guide.md`.
  - `mock` (default under the test runner): the in-memory **mock API** (`src/api/mockClient.ts`) with **synthetic, labeled** records (`src/data/syntheticData.ts`), for tests and an offline demo. It has a demo role picker instead of sign-in.
  - Set it in `apps/web/.env.local` (see `.env.example`), for example `VITE_ASTIG_API=mock` for the offline demo. Any other value shows a configuration error.
- **Sign-in (live):** Cognito `USER_PASSWORD_AUTH` via `CognitoAuth` (`src/auth/AuthGate.tsx`, `src/auth/SignInScreen.tsx`).
  - A first-login `NEW_PASSWORD_REQUIRED` challenge shows a "Set a new password" form. The pool's rule is shown: at least 12 characters, upper- and lower-case letters and a digit.
  - Tokens are kept **in memory only**, so a page reload asks for sign-in again.
  - The top bar shows who is signed in and a **Sign out** button. In live mode there is no role picker: the role comes from the Cognito groups, and the API enforces it.
  - `AUTH_REQUIRED` / `UNAUTHENTICATED` from any call returns to sign-in ("Your session has ended…").
  - `FORBIDDEN` shows "This account can't access the dashboard (needs OFFICER)."
  - Passwords are never stored, logged or committed; the demo accounts' passwords are with the backend owner.
- **Map:** OpenStreetMap basemap through Leaflet (`src/components/IssueMap.tsx`, no API key). Markers stay keyboard-operable React buttons over the map. Faint circles show location uncertainty. Without a laid-out map (tests), markers fall back to the schematic projection.
- **AI problem regions:** when a detection has `regions`, the evidence image shows them as red outlines with a text caption ("AI-estimated… Approximate; an officer should verify", `src/components/RegionImage.tsx`). The expired-link refetch applies to these images too.
- **Contracts:** shapes come from `@astig/contracts` (draft v0). The mock validates requests with the shared Zod schemas and checks its own responses against them. A test parses every synthetic record with `IssueDetailResponse`.
- **Server rules mirrored by the mock:**
  - officer-only routes, including the list and analytics (`FORBIDDEN`);
  - idempotent create, where the same key and body replays the original and a different body returns `IDEMPOTENCY_CONFLICT`;
  - `ISSUE_NOT_OPEN`, `ACTIVE_WORK_ORDER_EXISTS`, `RISK_ASSESSMENT_MISMATCH`;
  - `INVALID_TRANSITION` and `WORK_ORDER_CLOSED`;
  - resolving the work order resolves the issue;
  - after photos only on `IN_PROGRESS`/`RESOLVED` work orders, at most 5.
- **Features:**
  - issue map (OpenStreetMap) and issue queue, with severity / type / area / issue status / work-order filters. Area options come from the list response's `areaNames`;
  - a result line ("Showing 45 of 300 issues") and **Clear filters (n)**; a set filter is outlined and tinted;
  - the queue is in the contract's list order (score, then most recently observed, then id) and scrolls inside its card. It keeps the selected row in view. The HTTP client follows `nextCursor` (200 per page) up to 2,000 issues, and says so if more exist;
  - issue detail: **Previous / Next** through the filtered queue ("Issue 2 of 4 in the queue") and **Close**, plus status, location uncertainty, observed range, evidence history, confidence, review flag, sampling method, failed processing, and image availability;
  - score breakdown, where `UNKNOWN` inputs are shown as unknown and never as zero, with `knownCapTotal`;
  - officer-only work-order create and `OPEN → IN_PROGRESS → RESOLVED`:
    - the idempotency key is generated with `newId()` once per create action and reused if that action is retried;
    - `riskAssessmentId` is the score shown on screen;
    - after every write the issue, list and analytics are refetched;
    - 409 conflicts (`INVALID_TRANSITION`, `ACTIVE_WORK_ORDER_EXISTS`, `ISSUE_NOT_OPEN`, `WORK_ORDER_CLOSED`, `RISK_ASSESSMENT_MISMATCH`) are shown inline with the API's message and request id, and the issue is refetched;
  - optional **after photo** on an `IN_PROGRESS` or `RESOLVED` work order:
    - JPEG only, at most 10 MB, with an optional note, checked before any request;
    - `createResolutionEvidence`, then the presigned PUT; the `clientEvidenceId` is reused on retry;
    - `resolutionEvidence` is shown under the work order;
  - **evidence images** use the short-lived presigned URLs. If one fails to load, the issue is refetched once for fresh URLs. If it fails again, "Image could not be loaded" is shown with **Reload images**. `UNAVAILABLE` evidence shows its reason;
  - **analytics summary** (`GET /analytics/summary`):
    - issues by type, AI severity and area;
    - open / in progress / resolved work orders, and mean hours to resolve;
    - repeat issues and coverage (sessions, captures, client-reported distance);
    - processing counts;
    - the `includesSynthetic` badge.
- **Errors:** the safe message is shown together with the API's request id ("reference req-…"), so a failure can be reported exactly.
- **Load failures:** they show as failures, not as empty data. Summary tiles show "–", the map and queue say "Issues could not be loaded", and the alert has **Try again**. Before this fix the page showed zeros and "No issues match", which looks like a clean result.
- **Layout:** follows the command-center and issue-detail mockups in `visual/`.
  - Shell: left sidebar (brand, in-page section links, data-source note) and a sticky top bar (page title, synthetic-data badge, demo role).
  - Command center: summary tiles, filters, then the issue map beside the issue queue (sorted by priority score, highest first).
  - Issue review: opens below the map and queue and scrolls into view. Evidence is on the left; priority score with gauge, location and history, and the work order are on the right.
  - Summary tiles are counts of the issue list the page already holds (open issues by highest AI severity estimate, open, resolved). They are not the analytics summary. On phones they are three to a row and compact.
  - The synthetic-data badge is full size in the top bar and the detail header. Repeated rows (queue, evidence cards) carry a compact "Synthetic" badge in the same colours.
  - Left out on purpose because they are outside the MVP or not backed by data: auto-dispatch / "Deploy crew", real-time sensor and system-status claims, heatmap layer, weather and hazard alerts, recommended dispatch action (gap G6), and export and audit-log actions. The analytics shown are the API summary, not the executive QuickSight page.
- **Styling:** Civic Pulse direction (`visual/civic_pulse_design_system/DESIGN.md`) through tokens in `src/styles/tokens.css`. `src/styles/primitives.module.css` holds the shared card, pill, button and field styles. There is one CSS Module per component, and no UI component library. Icons are a small inline SVG set (`src/components/Icon.tsx`), all decorative.
  - **Fonts:** Plus Jakarta Sans is self-hosted through `@fontsource-variable/plus-jakarta-sans` (OFL-1.1, imported in `src/main.tsx`), so there is no third-party font request. The system UI font is the fallback.
- **Demo role selector (mock mode only):** the contract's `OPERATOR` and `OFFICER`, defaulting to `OFFICER`. In live mode the role comes from the Cognito groups, and the API enforces it.

Commands (from the repo root): `npm install`, `npm run web:dev` (live; sign in at `http://localhost:5173`), `npm run test:web`, `npm run typecheck:web`, `npm run build:web`. Only `http://localhost:5173`, `http://localhost:4173` and `https://astig-xi.vercel.app` are allowed by the API's CORS.

## Contract gaps

The backend contract closed G1–G5 and G7: the list shape, severity, filters, role, area names, and processing codes shown verbatim. One gap is still open:

| # | Gap | Web workaround now | Smallest proposed fix (backend owner) |
| --- | --- | --- | --- |
| G6 | Requirement 10 "recommendation" has no field (also noted as a gap in `contract-v0-proposal.md`) | The web shows no recommendation text | Add the priority band once thresholds are agreed |

Superseded proposals from `docs/api/client-contract-proposal.md`: contract v0 uses camelCase, not snake_case. Other replacements:
- `KNOWN`/`UNKNOWN`, not `MEASURED`/`UNAVAILABLE`.
- `assignedTeam`, not `assignee`.
- `EvidenceAccess`, not `image_url`.
- `OPERATOR`/`OFFICER`, not `VIEWER`.
- `ACTIVE_WORK_ORDER_EXISTS`, not `WORK_ORDER_EXISTS`.

The web follows the contract in each case.

The map uses OpenStreetMap tiles through Leaflet. `IssueMap` props stay the seam if the provider changes.

## Accessibility and keyboard behavior

- **Tab order:**
  1. "Skip to issue detail" link (only once a detail is shown; hidden until focused);
  2. sidebar section links ("Command center", "Issue queue", and "Issue review" once an issue is shown);
  3. Sign out (live) or the demo role picker (mock);
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
  `src/api/httpClient.test.ts` drives the real `AstigClient` with a fake `fetch`:
  - filters and paging to `GET /issues`, and the bearer token;
  - the create body;
  - 409 / 403 / 401 / `AUTH_REQUIRED` mapping;
  - the after-photo register-then-PUT, with no manual `content-length`;
  - analytics.

  `src/auth/AuthGate.test.tsx` drives the real `CognitoAuth` with a fake Cognito endpoint:
  - sign-in, a wrong password, and empty fields;
  - `NEW_PASSWORD_REQUIRED` with mismatch and rejection;
  - sign-out;
  - a 401 returning to sign-in, and `FORBIDDEN` for an operator account.

  `src/features.test.tsx` covers after photos, inline 409s, the image refetch-once rule, and analytics.
- **Sign-in keyboard behavior:** the fields have visible labels and `autocomplete` (username / current-password / new-password), and Enter submits. Errors use `role="alert"` and stay until the next attempt. Moving to "Set a new password" puts focus on its heading. The session-ended and signed-out notices are a status message.
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

At 300 issues the markers overlap (this check ran on the schematic map, before the OpenStreetMap basemap). Marker clustering is not built.
