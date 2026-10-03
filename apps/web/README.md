# Operational web app

Implement the React + Vite + TypeScript operations map, issue filters/details, evidence review, explainable score, and officer-controlled work-order lifecycle.

Keep visual styling replaceable for the separate UI designer: use semantic CSS custom properties/design tokens, CSS Modules, and accessible headless primitives. Avoid coupling application behavior to a fixed component library or hard-coded visual decisions. Use shared contracts rather than inventing client-only API shapes.

Do not depend on Google Street View for the hackathon MVP. Prefer team-captured photos, synthetic demo data, or explicitly licensed local imagery. Clearly mark any non-ASTIG image source; use only approved imagery as model input.

## Current status

- **Data source:** an in-memory **mock API** (`src/api/mockClient.ts`) serving **synthetic, labeled** records (`src/data/syntheticData.ts`). Nothing here is real captured data. An HTTP client comes later, once a list route exists.
- **Contracts:** shapes come from `@astig/contracts` (draft v0). The mock validates requests with the shared Zod schemas and checks its own responses against them. A test parses every synthetic record with `IssueDetailResponse`.
- **Server rules mirrored by the mock:**
  - officer-only issue detail and writes (`FORBIDDEN`);
  - idempotent create, where the same key and body replays the original and a different body returns `IDEMPOTENCY_CONFLICT`;
  - `ISSUE_NOT_OPEN`, `ACTIVE_WORK_ORDER_EXISTS`, `RISK_ASSESSMENT_MISMATCH`;
  - `INVALID_TRANSITION` and `WORK_ORDER_CLOSED`;
  - resolving the work order resolves the issue.
- **Features:**
  - schematic map and issue list, with severity/type/area/work-order filters;
  - issue detail: status, location uncertainty, observed range, evidence history, confidence, review flag, sampling method, failed processing, and image availability;
  - score breakdown, where `UNKNOWN` inputs are shown as unknown and never as zero;
  - officer-only work-order create and `OPEN → IN_PROGRESS → RESOLVED`.
- **Styling:** Civic Pulse direction (`visual/civic_pulse_design_system/DESIGN.md`) through tokens in `src/styles/tokens.css`. `src/styles/primitives.module.css` holds the shared card, pill, button and field styles. There is one CSS Module per component, and no UI component library.
  - **Fonts:** Plus Jakarta Sans is used only if installed locally. Otherwise the system UI font is the fallback, because loading the font would need a third-party request or a new dependency.
- **Demo role selector:** a placeholder until real auth is chosen. Its roles are the contract's `OPERATOR` and `OFFICER`, and it defaults to `OPERATOR`.

Commands (from the repo root): `npm install`, `npm run dev -w @astig/web`, `npm test -w @astig/web`, `npm run build -w @astig/web`.

## Contract gaps (local types in `src/api/types.ts`, tagged `[gap Gn]`)

| # | Gap | Web workaround now | Smallest proposed fix (backend owner) |
| --- | --- | --- | --- |
| G1 | No `GET /issues` list route or response shape | Local `IssueListItem` = `{ issue: Issue, severity, totalScore, workOrderStatus }`; the mock returns every item | Add `IssueListResponse { items: IssueListItem[], nextCursor: string \| null }` with `limit` (default 50, max 200) and `cursor` |
| G2 | `Issue` has no severity, but the list, the map and the severity filter need one | Derived: highest `severityEstimate` among completed detections (`domain/filters.ts`) | Add `severity: SeverityEstimate \| null` to the list item, with that derivation done server-side |
| G3 | List filters undefined | Local `IssueListFilters { severity?, issueType?, areaName?, workOrderStatus?: WorkOrderStatus \| "NONE" }` | Adopt those query names in the list contract |
| G4 | No role rule for the list | The mock lets any demo role list issues; detail stays `OFFICER`-only | State the list route's role. If `OFFICER`-only, an operator sees nothing, which is fine for the MVP. |
| G5 | Area filter options have no source | The app makes one unfiltered list call to collect area names, which is unbounded | Publish the pilot area names as a constant in `packages/contracts`, or return them with the list response |
| G6 | Requirement 10 "recommendation" has no field (also noted as a gap in `contract-v0-proposal.md`) | The web dropped the invented `recommendation` text | Add the priority band once thresholds are agreed |
| G7 | `ProcessingError.code` values are free strings | Shown verbatim | Enumerate the worker's codes |

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
  2. demo role;
  3. the four filters;
  4. map markers;
  5. issue list;
  6. issue detail: the work-order form fields, then the action button.
- **Selecting an issue:** markers and list rows are buttons with `aria-pressed`, activated with Enter or Space. Selecting does not move focus. The new detail is announced in a polite status region ("Showing issue detail: …"), and the skip link jumps to it. Markers and rows are two tab stops per issue; the list is the textual equivalent of the schematic map.
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
- **Tests:** `src/a11y.test.tsx` covers the keyboard path (Tab/Enter only, from list selection through create to `RESOLVED`, with focus and announcements asserted), marker activation by keyboard, the skip link, the alert for refused requests, and the text equivalents for colour.
- **Not covered:** no screen-reader testing (NVDA/JAWS/TalkBack) and no automated axe scan, because that would be a new dependency. The score table's rationale column is cramped below about 420px.
