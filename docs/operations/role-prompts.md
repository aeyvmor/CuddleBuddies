# Role-specific AI starter prompts

Use these prompts after the [pre-build setup checklist](prebuild-setup.md) is complete and the team has frozen the shared contracts. The current team split is: you own backend + AWS; one teammate owns both mobile and web; the other two support requirements, QA, integration, analytics, and demo. Keep all work in this repository and review generated changes before merging.

## Shared instruction to prepend

```text
You are implementing one bounded part of ASTIG, the hackathon MVP in this repository.
First read AGENTS.md, .kiro/specs/astig/requirements.md, .kiro/specs/astig/design.md,
docs/architecture/decisions.md, docs/api/contract.md, and the relevant folder README.
Treat those documents as product constraints. Use the agreed TypeScript stack and
shared contracts. Do not invent fields or endpoints; if the frozen contract is
missing something, report the exact gap and propose the smallest change for team
approval before coding.

AI detection is advisory. Preserve explicit failure states, privacy boundaries,
idempotency, and demo-data labeling. Do not add credentials or real personal data.
Do not implement roadmap scope. Inspect the current worktree and preserve other
owners' changes. Implement a small, testable vertical slice, add focused tests,
run the narrowest relevant checks, and report files changed, checks run, decisions
needed, and remaining limitations. Do not claim a check passed unless you ran it.
```

## 1. Backend, database, and AWS — you

```text
Own database/, services/api/, packages/contracts/, packages/domain/, and
infra/aws/ for this task. Implement the first backend slice in TypeScript on Node.js using the team
approved workspace layout. Use runtime-validated shared schemas, PostgreSQL +
PostGIS, ordered SQL migrations, and the pg driver; do not introduce an ORM unless
the team explicitly approves it.

Start with a short contract/schema proposal for the team to confirm: inspection
session, observation and idempotency key, processing status, detection, issue,
versioned score breakdown, and work-order lifecycle. Then implement an initial
migration with constraints/indexes and deterministic synthetic seed data; implement
the domain risk-score calculation with bounded weighted factors and tests; and add
the smallest API operations required to query issue details and create/update a
work order. Keep image bytes in S3 and use only authorized object references.

For AWS, help the user learn the steps: explain each console/CloudShell action in
plain language, first use read-only account/region verification, then prepare
reviewable CDK code. Never ask for root credentials or long-lived access keys.
Do not create/deploy/delete billable cloud resources without the user's explicit
approval of account, region, and expected cost. Ask the account owner to review
permissions and budget setup. Coordinate upload and worker interfaces with the
integration owner. Include local migration/seed instructions and tests for invalid
coordinates, duplicate/idempotent observation writes, score caps/unknown inputs,
and invalid work-order transitions. Do not implement the mobile UI, React web UI,
or Gemini SDK integration in this task.
```

## 2. Client owner — Android mobile and web dashboard

```text
Own apps/mobile/ and apps/web/ for this task. You own both the Android React Native
capture client and the React + Vite + TypeScript operations dashboard. First read
both folder READMEs and the frozen API/shared contracts; agree with the backend
owner on the API shape before implementation. Avoid inventing client-specific
field names.

For mobile, implement the thinnest useful session/capture flow: session state,
location/time metadata, image capture, explicit sampling method/accuracy,
configurable distance threshold (prototype target ~7 m), and a pending-upload
queue. Validate Android install and native-module support on the actual test
device. Do not claim GPS deltas are VIO.

For web, build the map/list, filters, issue detail/evidence, confidence, score
breakdown, and officer-controlled work-order create/status flow. Use clearly
labeled synthetic records when real API data is not ready.

Keep designer flexibility: CSS tokens/custom properties, CSS Modules, accessible
headless primitives, and styling separate from product logic. Do not add a Google
Street View dependency. Test both app surfaces independently and demonstrate the
complete client flow against the agreed API/seed data. Report capacity blockers
early; do not silently drop either client.
```

## 3. Requirements, QA, and demo support

```text
Support the four-person ASTIG team across requirements, QA, and demo readiness.
Read the MVP requirements, system overview, hackathon plan, and demo runbook first.
Create a traceable acceptance checklist from the existing requirements—do not
write a competing product spec or change API/data contracts.

Help verify judge/hackathon requirements and required AWS/AI/analytics technology;
identify gaps early and report the source/requirement. Prepare or curate only
approved, clearly labeled demo imagery/data. Test the end-to-end acceptance story:
observation appears → evidence and score rationale are visible → officer creates
work order → status reaches RESOLVED → analytics reflect it. Capture reproducible
bugs with steps and expected/actual results.

Coordinate with the client owner on UX/accessibility/content feedback and with the
backend/AWS owner on API/seed-data issues. Help write and rehearse the demo, including
a truthful fallback if camera, network, Gemini, AWS, or Quick access fails. Do not
provision AWS resources or handle/share secrets unless the account owner explicitly
assigns and approves it. Keep changes to the smallest agreed docs/tests/demo assets.
```

## 4. Integration, analytics, and discrete support tasks

```text
Support ASTIG integration and remaining hackathon requirements. Read the
requirements, architecture decisions, execution plan, and demo runbook. Work from
explicitly assigned tasks; coordinate with the person who owns the affected
component and preserve the frozen shared contracts.

Prioritize an end-to-end smoke-test checklist, Quick/Quick Sight access and
analytics feasibility, judging/pitch requirements, documentation gaps, and discrete
unblocked implementation tasks. If taking an AI/worker task, agree the exact
interface with the backend/AWS owner first. Do not create/deploy/delete AWS
resources, change permissions, or request credentials; the backend/AWS owner is
responsible for AWS operations.

Report concrete requirement evidence, test results, blockers, and next action.
Do not add scope merely because it appears in the long-term roadmap.
```

## Optional bounded mobile-only continuation

Use only if the combined client owner decides to split work into a separate coding
session after the shared contract is agreed:

```text
Own apps/mobile/ for this task. Implement the Android capture client using the
team-approved React Native setup (Expo development build only after verifying all
required native libraries). Do not assume Expo Go supports custom native modules.

Implement operator session start/stop, device/vehicle association, camera capture,
UTC timestamp and location metadata, configurable travelled-distance sampling
(prototype target about 7 m), visible capture/quality state, and a local pending
upload queue. Use the frozen packages/contracts schema and upload only through the
approved short-lived S3 upload flow. Never place AWS, database, or Gemini secrets
in the app.

Before claiming distance sampling works, test it on the actual Android target and
report what provides distance/VIO, accuracy, limitations, and battery behavior.
Do not silently replace VIO with GPS deltas or a timer. If native VIO cannot fit
today, implement an explicit, configurable prototype fallback and surface its
method/accuracy in capture metadata. Add tests for session state and queue/retry
behavior where feasible. Do not implement API, database, worker, or web features.
```

## Optional bounded web-only continuation

```text
Own apps/web/ for this task. Implement the ASTIG operations experience using
React + Vite + TypeScript and the frozen shared contracts.

Build the issue map/list, severity/type/status filters, issue detail, image evidence
display, capture location/time, confidence, score breakdown, observation history,
and officer-controlled work-order creation/status changes. Make synthetic/demo
records visibly identifiable. Show unavailable score inputs as unknown, never as
zero risk. Keep analytics views separate from transactional API behavior.

The separate UI designer must be able to change visual direction without changing
business logic: use named CSS custom properties/design tokens, CSS Modules, and
accessible headless primitives. Keep map-provider integration behind an isolated
component. Do not add a Street View dependency for this MVP. Use team-captured,
synthetic, or explicitly licensed local imagery, clearly labeled by source. Do not
invent API fields or implement backend/mobile features. Add focused component
tests and document keyboard/accessibility behavior for critical review/work-order
actions.
```

## Optional bounded AI worker task (AWS resources remain with you)

```text
Own services/worker/ for this task, and act as the integration/demo
coordinator. Implement the vision adapter in TypeScript on Node.js behind a
provider-neutral interface. Use Gemini only if the team has a valid server-side
credential and quota. Validate output against packages/contracts before it can
become a Detection.

Coordinate the smallest AWS path with the backend/AWS owner: private S3 evidence,
scoped presigned upload, API Gateway/Lambda integration contract, async worker,
least-privilege IAM, database connection through the agreed network path, safe
secret loading, and CloudWatch-visible processing status/failure. Do not create,
deploy, or delete cloud resources; prepare/test code and ask the named AWS owner
to approve deployment. Do not add extra services without team approval. If SQS is
added, include idempotency, visibility/retry policy, a DLQ, and a tested
redrive/failure story.

Do not add Google Street View as a dependency or use it as model evidence for the
MVP. Preserve original approved evidence and explicit provider/schema versions.
Coordinate all field/status changes with the backend owner. Provide a local/stub
worker path so the full UI demo remains testable without external inference. Own
the rehearsal checklist, live-vs-synthetic labels, and a truthful failure fallback.
```

## Merge checklist for every owner

- [ ] Shared contracts match; no parallel invented schema.
- [ ] Local environment variables documented in `.env.example`, with no real values.
- [ ] Focused tests/checks were run and results recorded.
- [ ] Errors/retries remain visible; no success-shaped fallback.
- [ ] Privacy, credentials, object access, and demo-data labeling were reviewed.
- [ ] Directly related docs and the team handoff page are current.
- [ ] Owner can demonstrate their slice and explain its limitations.
