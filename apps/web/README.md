# Operational web app

Implement the React + Vite + TypeScript operations map, issue filters/details, evidence review, explainable score, and officer-controlled work-order lifecycle.

Keep visual styling replaceable for the separate UI designer: use semantic CSS custom properties/design tokens, CSS Modules, and accessible headless primitives. Avoid coupling application behavior to a fixed component library or hard-coded visual decisions. Use shared contracts rather than inventing client-only API shapes.

Do not depend on Google Street View for the hackathon MVP. Prefer team-captured photos, synthetic demo data, or explicitly licensed local imagery. Clearly mark any non-ASTIG image source; use only approved imagery as model input.


## Current status (first slice)

Runs against an in-memory **mock API** with **synthetic, labeled** records (`src/data/syntheticData.ts`); nothing here is real captured data. Commands (from repo root): `npm install`, `npm run dev -w @astig/web`, `npm test -w @astig/web`, `npm run build -w @astig/web`.

Implemented: schematic issue map + list, severity/type/area/work-order filters, issue detail (evidence history, confidence, AI review flag, failed-processing display, score breakdown with unavailable inputs shown as unavailable), and officer-only work-order create and `OPEN -> IN_PROGRESS -> RESOLVED`.

Styling: tokens in `src/styles/tokens.css`, CSS Modules per component, native accessible elements (no headless library added yet).

## Contract gaps (provisional until `packages/contracts` lands)

`src/api/types.ts` is the only place client-side shapes live; fields marked `[PROVISIONAL]` need backend confirmation: severity and issue-type enum values, `area_name`, `location_uncertainty_m`, `is_synthetic`, `recommendation`, score-component shape (`status` MEASURED/UNAVAILABLE), `error_code` on failed observations, pagination and error envelope, auth/role model (the role selector is a demo placeholder), and how a short-lived `image_url` is returned. The map is a schematic placeholder (not a basemap) because the map provider is undecided; `IssueMap` props are the seam for a provider-backed map.
