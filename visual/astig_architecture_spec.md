# ASTIG — Automated Street & Infrastructure Geospatial Intelligence

**Architecture & Hackathon Product Specification**  
**Date:** 2026-09-28  
**Target:** Kiro x Quick Hackathon  
**Primary deployment model:** smartphone mounted on vehicles that already travel public roads  
**Primary users:** LGU environment/sanitation, engineering, DRRM, and operations personnel

---

# 0. Executive Summary of the Brainstorming Review

## Initial concept

The original idea proposed a vehicle-mounted smartphone that continuously scans streets, uses computer vision to detect drainage/trash blockages, combines results with PAGASA weather data, simulates water flow, and autonomously dispatches cleanup crews. It also proposed future crowdsourcing through a citizen app.

## Key critiques

1. **The original scope was too large.** It combined computer vision, GIS, hydrology, weather forecasting, autonomous dispatch, ticketing, and crowdsourcing into one product.
2. **“Predictive topology” was over-claimed.** Real urban drainage simulation requires terrain, drainage-network geometry/capacity, catchments, rainfall time series, pumps/outfalls, and other data. ASTIG should not claim to perform a full flood simulation in the MVP.
3. **Continuous video processing was inefficient.** Sampling every N seconds can generate huge amounts of redundant imagery. Sampling should be based primarily on travelled road distance and road-segment coverage.
4. **AI should not directly make operational decisions.** Vision AI should produce structured observations and confidence. A deterministic, explainable risk engine should combine those observations with weather, history, hazard context, and exposure.
5. **Autonomous dispatch is not appropriate for the MVP.** Government personnel should approve work orders. ASTIG is an AI-assisted operations system, not an autonomous government decision-maker.
6. **QuickSight should not replace the operational app.** React should handle the live operational map and issue workflow; Amazon Quick/Quick Sight can provide higher-level analytics and demonstrate required AWS analytics capability.
7. **The core insight is not “AI detects trash.”** The stronger concept is: **existing vehicles become a distributed, low-cost infrastructure observation network.**

## Settled MVP

> **ASTIG uses smartphones mounted on vehicles to capture geolocated street imagery, uses cloud AI to detect infrastructure weaknesses, maps and prioritizes those issues, and lets officials create simple work orders.**

Core flow:

**Capture → Detect → Geolocate → Score → Map → Human approval → Work order → Resolve**

Crowdsourcing, richer analytics, automatic crew routing, before/after verification, model retraining, and edge inference are roadmap features.

## Product naming decision

Use:

> **ASTIG — Automated Street & Infrastructure Geospatial Intelligence**

“ASTIG” is intentionally memorable and Filipino, while the expanded name is technical and directly related to the product.

Alternative names considered:

- SCAN — Street Condition & Asset Network
- SCOPE — Street Condition Observation & Prioritization Engine
- STRIDE — Street-level Infrastructure Detection & Evaluation
- TRACE — Transport-based Road & Asset Condition Explorer

ASTIG remains the recommended product name for the hackathon.

---

# 1. Product Definition

## 1.1 Problem

LGUs need current, geographically precise information about street-level infrastructure problems such as blocked drainage, waste accumulation, siltation, damaged drainage infrastructure, and other visible public-asset weaknesses. Traditional inspection is periodic, manual, and difficult to scale.

ASTIG uses vehicles that already traverse public roads as mobile inspection platforms.

## 1.2 Value proposition

> **Every road trip becomes an infrastructure inspection.**

ASTIG reduces the need for dedicated inspection trips by turning ordinary vehicle movement into a source of geolocated infrastructure observations.

## 1.3 MVP objective

Build a believable end-to-end vertical slice that proves:

1. A vehicle-mounted phone can capture street imagery and location data.
2. Cloud AI can turn an image into a structured infrastructure observation.
3. Observations can be mapped spatially.
4. A transparent priority score can identify which issue should be inspected first.
5. An authorized official can create a simple work order.
6. The issue lifecycle can be represented from detection to resolution.

## 1.4 Non-goals for the hackathon

The MVP will **not** attempt to:

- perform full hydrological/flood simulation;
- guarantee flood prediction;
- autonomously dispatch government personnel;
- train a production-grade custom CV model from scratch;
- continuously upload video;
- process every captured frame with a large multimodal model;
- deploy nationwide;
- build a complete citizen app;
- integrate with every existing government system;
- optimize crew routes across an entire LGU;
- provide legally binding infrastructure assessments.

---

# 2. Target Users

## 2.1 Primary user: LGU operations officer

Needs to answer:

> **“What infrastructure problems need attention first?”**

Responsibilities may include validating observations, prioritizing issues, creating work orders, assigning work, and monitoring completion.

## 2.2 Environment / sanitation personnel

Interested in:

- garbage accumulation;
- blocked drainage;
- recurring waste hotspots;
- cleanup tasks;
- work status.

## 2.3 Engineering personnel

Interested in:

- damaged drains/grates;
- siltation;
- structural issues;
- recurring infrastructure failures;
- inspection evidence.

## 2.4 DRRM / preparedness personnel

Interested in:

- weather-related prioritization;
- high-risk locations;
- recurring problem areas;
- coverage and readiness.

## 2.5 Executive / administrator view

Interested in:

- geographic distribution of problems;
- unresolved critical issues;
- response time;
- resolution rate;
- trends by barangay/road.

---

# 3. Primary User Journey

```text
Vehicle starts route
      ↓
Phone captures spatially sampled images + GPS
      ↓
Candidate image uploaded
      ↓
Cloud vision analysis
      ↓
Structured observation created
      ↓
Observation mapped to road/area
      ↓
Risk engine calculates priority
      ↓
Observation becomes visible as an issue
      ↓
Officer reviews evidence
      ↓
Officer creates work order
      ↓
Work order progresses:
OPEN → IN_PROGRESS → RESOLVED
      ↓
Resolution evidence may be attached
```

---

# 4. Functional Requirements

Requirements are intentionally written so they can be converted into Kiro EARS-style requirements and implementation tasks. Kiro's current spec workflow explicitly supports requirements, design, and task artifacts, with acceptance criteria and traceability. [Kiro Specs Documentation](https://kiro.dev/docs/specs/)

## FR-01 — Vehicle session

**WHEN** an authorized operator starts a vehicle inspection session  
**THE SYSTEM SHALL** record the vehicle, session start time, device identifier, and current GPS position.

Acceptance criteria:

- A session has a unique ID.
- Device/vehicle association is recorded.
- Session can be started and stopped.
- Session remains usable with intermittent connectivity.

## FR-02 — Spatial image sampling

**WHEN** the vehicle has travelled at least a configurable distance since the last eligible capture  
**THE SYSTEM SHALL** capture an image and associate it with GPS coordinates and a timestamp.

Default prototype target: **~7 m sampling interval**.

The interval SHALL be configurable.

Important implementation rule: sampling should be tied to travelled distance (via Visual-Inertial Odometry), not simply elapsed time.

## FR-03 — Candidate filtering

**WHEN** a frame is unsuitable for analysis because of severe blur, darkness, duplicate proximity, or insufficient scene visibility  
**THE SYSTEM SHALL** mark or discard the frame before expensive cloud inference.

The MVP may implement this as simple image-quality rules rather than a full edge CV model.

## FR-04 — Upload batching

**WHEN** candidate images are available and connectivity permits  
**THE SYSTEM SHALL** upload them in batches to Amazon S3 with metadata sufficient to reconstruct location and capture order.

Metadata must include:

- session ID;
- device/vehicle ID;
- timestamp;
- latitude;
- longitude;
- image object key;
- schema version.

## FR-05 — Vision analysis

**WHEN** an eligible image is available in S3  
**THE SYSTEM SHALL** submit the image to the selected vision inference provider and request structured output.

Hackathon implementation: Gemini Vision may be used for speed of implementation.

Production direction: use a dedicated infrastructure CV model, potentially running in AWS, with Amazon Bedrock/Nova used for image understanding and/or ambiguous cases. Amazon Nova 2 supports image understanding tasks including object detection, classification, visual question answering, bounding boxes, and related image analysis. [AWS Amazon Nova multimodal documentation](https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-multimodal-models.html)

## FR-06 — Structured detection result

The vision layer SHALL return JSON matching the approved schema.

Minimum fields:

- infrastructure_visible;
- issue_type;
- obstruction_type;
- blockage_percent, when applicable;
- severity_estimate;
- confidence;
- evidence_description;
- requires_human_review.

## FR-07 — Geospatial indexing

**WHEN** an observation is stored  
**THE SYSTEM SHALL** associate it with the nearest applicable road segment and geographic administrative area.

Use PostgreSQL + PostGIS.

Do not treat raw phone GPS coordinates as perfectly exact.

## FR-08 — Issue clustering

**WHEN** multiple observations refer to the same physical infrastructure location  
**THE SYSTEM SHALL** be capable of grouping them under one issue while retaining individual observations as evidence.

Example:

```text
Issue: Drain #A-102
  Observation 1 — 82% blocked
  Observation 2 — 79% blocked
  Observation 3 — 85% blocked
```

This is essential for scaling.

## FR-09 — Risk / priority scoring

**WHEN** an observation or issue has the required inputs  
**THE SYSTEM SHALL** calculate an explainable priority score from 0–100.

Prototype weighting:

| Factor                   | Weight |
| ------------------------ | -----: |
| Infrastructure severity  |    35% |
| Rainfall/weather risk    |    25% |
| Recurrence/history       |    20% |
| Hazard exposure          |    10% |
| Population/road exposure |    10% |

These weights SHALL be configurable and are not claimed to be scientifically validated flood-risk coefficients.

## FR-10 — Human review

**WHEN** a high-confidence or high-priority issue is shown to an authorized officer  
**THE SYSTEM SHALL** allow the officer to confirm, reject, or mark the issue for manual inspection.

AI output SHALL be advisory.

## FR-11 — Map visualization

The web application SHALL display observations/issues geographically.

Minimum map capabilities:

- pan/zoom;
- severity filtering;
- issue-type filtering;
- barangay/road filtering;
- clickable issue marker;
- issue detail panel.

## FR-12 — Issue detail

Selecting an issue SHALL display:

- latest evidence image;
- location;
- issue type;
- AI confidence;
- estimated blockage;
- current priority score;
- score components;
- observation history;
- current status;
- recommended action;
- work order state, if one exists.

## FR-13 — Work order creation

**WHEN** an officer chooses to act on an issue  
**THE SYSTEM SHALL** allow creation of a work order.

Minimum fields:

- work order ID;
- issue ID;
- location;
- issue summary;
- recommended action;
- priority;
- assigned team/department;
- notes;
- status;
- created timestamp;
- updated timestamp.

## FR-14 — Work order lifecycle

Supported MVP lifecycle:

```text
OPEN → IN_PROGRESS → RESOLVED
```

Optional state:

```text
REJECTED / NEEDS_REVIEW
```

## FR-15 — Resolution evidence

The MVP SHALL support attaching a resolution image to a work order, but automated before/after validation is optional for the hackathon.

## FR-16 — Analytics

The system SHALL expose summary metrics suitable for Amazon Quick / Quick Sight, such as:

- issue counts by severity;
- issues by type;
- issues by barangay;
- open vs resolved;
- average resolution time;
- recurring issues;
- route/road coverage.

Amazon Quick currently provides dashboards, analytics, AI agents, flows, and application capabilities; Quick Sight remains the dashboard/BI component. [AWS Amazon Quick documentation](https://docs.aws.amazon.com/quick/latest/userguide/)

---

# 5. Vision AI Contract

## 5.1 Principle

The vision model should perform **observation extraction**, not final government prioritization.

Bad architecture:

```text
Image → AI says “Critical” → government acts
```

Preferred architecture:

```text
Image
  ↓
AI extracts evidence
  ↓
Deterministic risk engine
  ↓
Explainable priority
  ↓
Human approval
```

## 5.2 Prototype prompt

```text
SYSTEM / VISION PROMPT

Analyze this street-level infrastructure image.

Identify whether the image visibly contains any of these conditions:

1. drainage grate
2. open canal / drainage channel
3. garbage accumulation
4. silt / sediment accumulation
5. damaged or displaced drainage infrastructure
6. other visible infrastructure weakness
7. no relevant issue

For every detected issue:
- identify the issue type;
- identify the visible obstruction/material type when applicable;
- estimate the percentage of visible blockage when applicable;
- estimate visible severity as LOW, MODERATE, HIGH, or CRITICAL;
- provide a confidence score between 0 and 1;
- provide a brief description of visual evidence;
- state whether human review is recommended.

Important rules:
- Do not infer hidden infrastructure conditions.
- Do not claim that an image proves future flooding.
- Do not estimate weather or hydrology from the image.
- Do not invent details that are not visually supported.
- If the image is too poor to assess, set requires_human_review=true.
- Return ONLY valid JSON matching the supplied schema.
```

## 5.3 Expected JSON

```json
{
  "infrastructure_visible": true,
  "issue_type": "blocked_drain",
  "obstruction_type": ["plastic_waste", "organic_waste"],
  "blockage_percent": 82,
  "severity_estimate": "HIGH",
  "confidence": 0.93,
  "evidence_description": "Visible waste covers most of the drain opening.",
  "requires_human_review": false
}
```

## 5.4 Detection taxonomy

Initial taxonomy:

| Type                | Example action         |
| ------------------- | ---------------------- |
| blocked_drain       | clear drain            |
| waste_accumulation  | cleanup                |
| siltation           | inspect/desilt         |
| damaged_grate       | engineering inspection |
| canal_obstruction   | inspect/clear          |
| structural_issue    | engineering inspection |
| unknown_obstruction | human inspection       |

Avoid expanding the taxonomy until the core detection flow is reliable.

---

# 6. Image Sampling & Scaling Strategy

## 6.1 Sampling decision

Use **distance-based spatial sampling**, not fixed time intervals.

Prototype:

> **Capture approximately every 7 m of travelled road distance.**

Why:

- vehicle speed does not change capture density;
- slow traffic does not produce thousands of redundant frames;
- route coverage is easier to reason about;
- sampling can be mapped to road segments;
- future sampling density can be made risk-aware.

## 6.2 Avoid simple geofence-trigger sampling

“Take a photo every time the vehicle enters an area” has weaknesses:

- GPS jitter around boundaries;
- repeated triggering;
- arbitrary area sizes;
- missed sections on long roads;
- inconsistent coverage.

Use a spatial distance threshold plus road/grid indexing instead.

## 6.3 Sample Adaptive sampling roadmap

```text
Normal road segment     → ~10 m
Known issue hotspot      → ~5 m
High-risk area           → increased density
Recently resolved issue  → temporary increased density
```

These are future configurable values, not MVP requirements.

## 6.4 National scale thought experiment

The initial estimate was:

```text
42,000 barangays × 15 streets × 5–10 images
= 3.15M–6.30M images per survey cycle
```

The latest PSA Philippine Standard Geographic Code lists **42,010 barangays as of 30 June 2026**. [PSA PSGC](https://psa.gov.ph/classification/psgc/node/1684083815)

However, ASTIG SHALL NOT use “number of photos per street” as its scaling unit.

The proper abstraction is:

```text
road network
  ↓
road segments / spatial cells
  ↓
coverage observations
```

A 50 m road and a 5 km road should not receive the same nominal number of images.

## 6.5 Avoid sending every frame to a multimodal LLM

Production target:

```text
Captured images
      ↓
cheap quality / dedup filtering
      ↓
candidate images
      ↓
specialized CV model
      ↓
probable issue candidates
      ↓
optional large multimodal model for ambiguous cases
```

This reduces both inference cost and latency.

The hackathon can simplify this to:

```text
sampled images → Gemini Vision → structured JSON
```

because the objective is to demonstrate the vertical slice, not production-scale inference economics.

---

# 7. System Architecture

## 7.1 High-level architecture

```text
                     ┌────────────────────────┐
                     │ Vehicle Smartphone      │
                     │                        │
                     │ Camera + GPS            │
                     │ Spatial sampler         │
                     │ Local quality filter    │
                     └────────────┬───────────┘
                                  │
                          HTTPS / batch upload
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │ Amazon S3               │
                     │ Image evidence          │
                     └────────────┬───────────┘
                                  │
                           object event
                                  ▼
                     ┌────────────────────────┐
                     │ AWS Lambda               │
                     │ ingestion/orchestration  │
                     └────────────┬───────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │ Vision Inference        │
                     │ Gemini for hackathon    │
                     │ Bedrock/custom CV later │
                     └────────────┬───────────┘
                                  │
                             JSON result
                                  ▼
                     ┌────────────────────────┐
                     │ PostgreSQL + PostGIS    │
                     │ observations / issues   │
                     └────────────┬───────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
                ▼                 ▼                 ▼
        Weather/hazard      Risk engine       Web API
          enrichment             │                 │
                │                ▼                 ▼
                └────────→ priority score    React dashboard
                                                  │
                                                  ▼
                                            Work orders
                                                  │
                                                  ▼
                                            Resolution

                 Amazon Quick / Quick Sight
                         ↑
                         │
                  analytics dataset
```

## 7.2 AWS service responsibilities

### Amazon S3

Stores image evidence and optional thumbnails.

Recommended object layout:

```text
s3://astig-evidence/
  raw/{session_id}/{timestamp}_{uuid}.jpg
  processed/{issue_id}/{observation_id}.jpg
  thumbnails/{issue_id}/{observation_id}.jpg
```

For the hackathon, raw and processed can be simplified to two prefixes.

### AWS Lambda

Use event-driven functions for:

- S3 ingestion event;
- validation;
- vision processing invocation;
- metadata persistence;
- status updates.

For the hackathon, S3 → Lambda is sufficient. At higher ingestion volumes, place SQS between S3 events and inference workers to absorb bursts, retry failures, and control concurrency.

Do not create a large microservice fleet.

### Amazon RDS PostgreSQL + PostGIS

Primary transactional and spatial store.

### API layer

AWS API Gateway + Lambda is sufficient for the MVP.

### React web app

Operational interface for:

- map;
- issue details;
- filters;
- work orders;
- basic analytics.

### Amazon Quick / Quick Sight

Use for required AWS analytics demonstration and executive-level reporting. Quick supports interactive dashboards and actions; Quick Sight can publish and share interactive dashboards. [AWS Quick documentation](https://docs.aws.amazon.com/quick/latest/userguide/using-quicksight-menu-and-landing-page.html)

### CloudWatch

Logs, basic monitoring, failure visibility.

### Authentication

For the hackathon, use a minimal authenticated demo user or a basic auth mechanism appropriate to the chosen stack. Production should use a managed identity provider such as Amazon Cognito or an LGU identity integration.

---

# 8. Backend Processing Flow

## 8.1 Capture flow

```text
1. Start session
2. Read GPS
3. Track travelled distance
4. If distance >= sampling interval:
      capture frame
5. Run cheap local quality checks
6. Queue eligible image
7. Upload image + metadata to S3
```

## 8.2 AI processing flow

```text
S3 upload
  ↓
Lambda
  ↓
Validate metadata
  ↓
Vision inference
  ↓
Validate JSON schema
  ↓
Create observation
  ↓
Spatial enrichment
  ↓
Issue clustering
  ↓
Risk scoring
  ↓
Dashboard ready
```

## 8.3 Work order flow

```text
Issue appears on map
      ↓
Officer opens issue
      ↓
Reviews image + score factors
      ↓
Create work order
      ↓
Assign department/team
      ↓
OPEN
      ↓
IN_PROGRESS
      ↓
RESOLVED
```

---

# 9. Data Model

## 9.1 Device

```text
Device
------
id
vehicle_id
platform
app_version
last_seen_at
status
```

## 9.2 Vehicle

```text
Vehicle
-------
id
external_reference
vehicle_type
operator_type
active
```

Examples:

- jeepney;
- tricycle;
- garbage truck;
- government vehicle.

## 9.3 Inspection Session

```text
InspectionSession
-----------------
id
device_id
vehicle_id
started_at
ended_at
route_reference
status
```

## 9.4 Observation

```text
Observation
-----------
id
session_id
captured_at
location POINT
road_segment_id
barangay_id
image_object_key
thumbnail_object_key
image_quality
model_version
schema_version
processing_status
```

## 9.5 Detection

```text
Detection
---------
id
observation_id
issue_type
obstruction_type
blockage_percent
severity_estimate
confidence
evidence_description
requires_human_review
```

## 9.6 Issue

```text
Issue
-----
id
canonical_location POINT
issue_type
current_status
priority_score
severity
first_seen_at
last_seen_at
occurrence_count
recurrence_score
recommended_action
```

## 9.7 Risk Assessment

```text
RiskAssessment
--------------
id
issue_id
infrastructure_component
weather_component
recurrence_component
hazard_component
exposure_component
total_score
formula_version
calculated_at
```

## 9.8 Work Order

```text
WorkOrder
---------
id
issue_id
assigned_department
assigned_team
status
priority
recommended_action
notes
created_at
started_at
resolved_at
```

## 9.9 Resolution Evidence

```text
ResolutionEvidence
------------------
id
work_order_id
image_object_key
captured_at
submitted_by
verification_status
```

---

# 10. Spatial Data Strategy

## 10.1 Why PostGIS

ASTIG's core queries are spatial:

- which barangay contains an observation?
- which road segment is closest?
- which issues are within a risk zone?
- which observations refer to the same location?
- which roads lack recent coverage?

These are natural PostGIS operations.

## 10.2 Road matching

Raw GPS points should be map-matched or snapped to the nearest known road segment where practical.

Do not assume GPS is exact enough to identify an infrastructure asset solely by latitude/longitude.

## 10.3 Issue clustering

Prototype approach:

1. group by issue type;
2. filter to observations within configurable spatial radius;
3. require temporal/visual similarity where possible;
4. retain all source observations as evidence.

This prevents one recurring drain from appearing as 20 unrelated map markers.

---

# 11. Risk Engine

## 11.1 Purpose

Risk scoring determines **priority for inspection/action**, not guaranteed flood probability.

## 11.2 Prototype formula

```text
priority_score =
    infrastructure_severity * 0.35
  + weather_risk           * 0.25
  + recurrence             * 0.20
  + hazard_exposure        * 0.10
  + population_exposure    * 0.10
```

Each component is normalized to 0–100.

## 11.3 Infrastructure severity

Inputs may include:

- obstruction percentage;
- infrastructure type;
- visible structural damage;
- confidence.

Example normalization:

```text
0–20% blockage  → low
21–50%           → moderate
51–80%           → high
81–100%          → critical
```

These thresholds are prototype choices and should be calibrated with real inspection data.

## 11.4 Weather risk

For the MVP, use a simplified weather-risk score derived from the available forecast data source.

Do not claim ASTIG is replacing PAGASA forecasts.

## 11.5 Recurrence

Increase priority for locations repeatedly detected over time.

Example:

```text
first observation          → low recurrence
2–3 observations           → moderate
4+ repeated observations  → high
```

The exact thresholds should be configurable.

## 11.6 Hazard exposure

Use available authoritative hazard/geospatial context where accessible.

HazardHunterPH already combines sources including PAGASA, PHIVOLCS, MGB, DepEd, DOH and DPWH and provides flood and other hazard layers. ASTIG should complement—not pretend to replace—such systems. [HazardHunterPH](https://hazardhunter.georisk.gov.ph/map)

## 11.7 Population/road exposure

For the MVP this can be approximated with road classification, proximity to critical facilities, or a simple configurable multiplier.

Do not present a rough proxy as a scientifically validated population-risk estimate.

## 11.8 Score explanation

Every issue detail page should be able to show:

Implementation requirement: each component SHALL be capped within its allocated weight so the total score cannot exceed 100.

Example valid result:

```text
Infrastructure severity   31 / 35
Weather risk              23 / 25
Recurrence                16 / 20
Hazard exposure             8 / 10
Road/population exposure    7 / 10
-----------------------------------
TOTAL                      85 / 100
```

---

# 12. Government Workflow Design

## 12.1 Human-in-the-loop

ASTIG SHALL recommend rather than autonomously order government action.

Preferred flow:

```text
AI detects
   ↓
Risk engine prioritizes
   ↓
Officer reviews
   ↓
Officer approves action
   ↓
Work order created
```

This makes the system auditable and avoids implying that AI has independent authority over public operations.

## 12.2 Generic work orders

Do not hard-code every issue to “sanitation crew.” Ownership varies by issue.

Use:

```text
Issue
  ↓
Recommended department
  ↓
Officer approval
  ↓
Work order
  ↓
Assigned team
```

Example mapping:

| Issue              | Suggested department     |
| ------------------ | ------------------------ |
| waste accumulation | environment/sanitation   |
| blocked drain      | sanitation / engineering |
| siltation          | engineering              |
| damaged grate      | engineering              |
| structural issue   | engineering / inspection |

---

# 13. Dashboard Specification

## 13.1 Command Center

Opening view:

```text
ASTIG CITY

CRITICAL     7
HIGH        18
MODERATE    43
OPEN       121
RESOLVED    87

Rainfall risk: HIGH

TOP PRIORITIES
1. Drain blockage — Brgy A — 85
2. Canal obstruction — Brgy C — 82
3. Siltation — Brgy B — 77
4. Damaged grate — Brgy D — 72
5. Waste hotspot — Brgy A — 69
```

Map should dominate the screen.

## 13.2 Issue detail

```text
Drainage blockage

Location: Brgy. A
Detected: 28 Sep 2026, 10:32 AM
Blockage: ~82%
AI confidence: 93%
Priority: 85 / 100

WHY PRIORITY IS HIGH
- high visible obstruction
- elevated weather risk
- recurring observation
- flood/hazard context

Previous observations: 4

[CREATE WORK ORDER]
```

## 13.3 Work order detail

```text
WORK ORDER #1042

Issue: Drain blockage
Priority: 85
Department: Engineering

Status: OPEN

Recommended action:
Inspect and clear obstruction.

[START]
[MARK RESOLVED]
```

## 13.4 Analytics view

Use React for operational analytics and Amazon Quick / Quick Sight for executive/reporting views.

Suggested charts:

- active issues by severity;
- issue type distribution;
- resolution status;
- median/average resolution time;
- recurring issue locations;
- observations by barangay;
- road coverage;
- issue trend over time.

---

# 14. Amazon Quick / Quick Sight Usage

The hackathon requires Quick, so Quick should be a deliberate part of the solution rather than a decorative add-on.

## 14.1 Quick role

Use Amazon Quick for:

- natural-language exploration of ASTIG metrics;
- executive summaries;
- analytics/workflow experimentation;
- optionally generating or embedding dashboard experiences.

Amazon Quick is an AI-powered AWS service that includes Quick Sight dashboards/BI, agents, flows, and other data-oriented capabilities. [AWS Amazon Quick](https://docs.aws.amazon.com/quick/latest/userguide/)

## 14.2 Suggested demo questions

Examples:

> “Which barangays have the most recurring drainage issues?”

> “How many critical issues remain unresolved?”

> “Which issue types have the longest resolution time?”

> “Show this month’s improvement in resolved high-priority issues.”

## 14.3 Do not make Quick the operational backend

React remains the primary operational interface.

Quick / Quick Sight is an analytics layer.

---

# 15. Kiro Usage

Kiro is a required hackathon technology and should be used as part of the actual engineering workflow.

## 15.1 Repository structure

```text
.kiro/
  specs/
    astig/
      requirements.md
      design.md
      tasks.md
  steering/
    project.md
    architecture.md
```

Kiro's documented workflow produces requirements, design, and task artifacts and supports refinement/synchronization as implementation changes. [Kiro Specs](https://kiro.dev/docs/specs/)

## 15.2 Recommended Kiro workflow

1. Put the product requirements into the ASTIG spec.
2. Run Kiro requirements analysis to find contradictions and gaps.
3. Generate/refine the design.
4. Generate implementation tasks.
5. Implement tasks incrementally.
6. Use `#spec` when asking Kiro to implement or validate a task.

Kiro explicitly provides requirements analysis for identifying ambiguity, inconsistency, and gaps. [Kiro Analyze Requirements](https://kiro.dev/docs/specs/analyze-requirements/)

## 15.3 Useful Kiro tasks

Examples:

- generate PostGIS schema;
- generate Lambda handlers;
- generate Pydantic/TypeScript schemas;
- implement S3 event processing;
- generate API endpoints;
- build map components;
- generate tests from acceptance criteria;
- keep data contracts synchronized.

---

# 16. API Design

## 16.1 Core endpoints

```text
POST   /sessions
POST   /sessions/{id}/observations
GET    /observations
GET    /issues
GET    /issues/{id}
POST   /issues/{id}/work-orders
GET    /work-orders
PATCH  /work-orders/{id}
POST   /work-orders/{id}/resolution-evidence
GET    /analytics/summary
```

The mobile client may upload directly to S3 using presigned URLs rather than sending image bytes through the API.

## 16.2 Presigned upload flow

```text
Mobile
  ↓
POST /upload-url
  ↓
API returns presigned S3 URL
  ↓
Mobile uploads directly to S3
  ↓
S3 event triggers backend processing
```

This keeps the API layer from becoming an image-upload bottleneck.

---

# 17. Reliability & Failure Handling

## 17.1 Offline operation

Vehicles may lose connectivity.

The mobile client SHALL maintain a local queue of pending observations.

```text
capture
  ↓
local queue
  ↓
network available?
  ├─ NO → keep queued
  └─ YES → batch upload
```

## 17.2 AI failure

If inference fails:

- keep the image;
- mark processing status as FAILED;
- allow retry;
- do not create a false issue.

## 17.3 Invalid AI JSON

Validate model output before persistence.

If invalid:

```text
AI output
  ↓
schema validation
  ↓
invalid → retry/repair once
  ↓
still invalid → FAILED_REVIEW
```

## 17.4 Duplicate observations

Use image hash + spatial/temporal proximity to reduce accidental duplicates.

## 17.5 API idempotency

Uploads and processing requests should have deterministic observation IDs or idempotency keys to prevent duplicate records when retries occur.

---

# 18. Security & Privacy

The platform will capture public-road imagery that may contain identifiable people, license plates, homes, or other personal information.

The Philippine Data Privacy Act applies to the processing of personal information and requires principles including transparency, legitimate purpose, proportionality, reasonable retention, and appropriate security measures. [RA 10173 — Official Gazette](https://officialgazette.gov.ph/2012/08/15/republic-act-no-10173/)

## 18.1 MVP controls

- avoid collecting audio;
- avoid unnecessary user-identifying metadata;
- blur faces/license plates where practical;
- restrict raw-image access;
- store only what is needed for the use case;
- define retention periods;
- separate public map data from internal evidence;
- record access to sensitive evidence in production.

NPC guidance also treats identifiable images/video as personal information covered by the DPA. [National Privacy Commission advisory materials](https://privacy.gov.ph/wp-content/uploads/2022/08/Advisory-Opinion-No-2022-015-FINAL-sgd_Redacted.pdf)

## 18.2 Public citizen reporting

Citizen-submitted images SHALL follow the same privacy/data-retention principles as vehicle imagery.

Citizen reporting is roadmap-only for the hackathon.

---

# 19. Government Procurement / Adoption Considerations

ASTIG should be positioned as a **low-capex pilot** rather than a huge government platform purchase.

The Philippines' New Government Procurement Act, RA 12009, applies to LGUs and emphasizes transparency, competitiveness, efficiency, proportionality, accountability, sustainability, and value for money. [RA 12009](https://www.comelec.gov.ph/?r=Procurement%2FLawsRulesandProcedures%2FRA12009)

GPPB guidance is actively evolving; as of July 31, 2026, GPPB-TSO instructed stakeholders to use the GPPB-approved NGPA IRR from 2025 rather than a withdrawn March 2026 unofficial version. This reinforces the need to avoid claiming any specific procurement route in the product pitch without procurement/legal review. [GPPB Public Advisory 09-2026](https://www.gppb.gov.ph/public-advisory-no-09-2026/)

The 2026 DBM release states that ₱1.19 trillion in National Tax Allotment was fully released to LGUs for FY2026 and identifies services including disaster preparedness/response and local infrastructure maintenance among LGU needs supported by the NTA. This demonstrates significant LGU funding flows, but it should not be interpreted as an indication that every LGU can immediately purchase new software. [DBM, 27 Jan 2026](https://www.dbm.gov.ph/index.php/management-2/3805-dbm-carries-out-pbbm-directive-releases-p1-19-trillion-nta-to-lgus-under-people-centric-2026-gaa)

## 19.1 Adoption model

```text
Phase 1: Small pilot
  ↓
One barangay
  ↓
Measure detection + response value
  ↓
Phase 2: Several barangays
  ↓
Demonstrate coverage and operational usefulness
  ↓
Phase 3: City/municipality
  ↓
Formalize procurement / expansion
  ↓
Phase 4: Multiple LGUs
```

The product pitch should emphasize:

> **Existing vehicles + low-cost smartphones + measurable pilot.**

Not:

> “Buy an expensive nationwide AI infrastructure platform.”

---

# 20. Scaling Plan

## Phase 0 — Hackathon

Scope:

- one simulated or small real route;
- 1–3 phones/devices;
- small set of roads;
- Gemini Vision;
- Postgres/PostGIS;
- React map;
- basic work orders;
- Quick/Quick Sight analytics.

Goal:

> Prove the complete workflow.

## Phase 1 — One barangay

Run a real pilot in one barangay.

Measure:

- road coverage;
- observations collected;
- detection precision/recall;
- false positives;
- average processing time;
- issue verification rate;
- work-order completion rate.

## Phase 2 — Multiple barangays

Add multiple vehicles and routes.

Introduce:

- issue clustering;
- history;
- recurrence detection;
- adaptive spatial sampling;
- better privacy processing.

## Phase 3 — Whole LGU

Add:

- more road network data;
- richer weather/hazard integration;
- department/team management;
- operational analytics;
- coverage monitoring;
- citizen reports;
- integrations with existing LGU workflows.

## Phase 4 — Multi-LGU platform

Introduce tenant-aware architecture:

```text
LGU A
  ├── vehicles
  ├── roads
  ├── observations
  └── work orders

LGU B
  ├── vehicles
  ├── roads
  ├── observations
  └── work orders
```

Keep tenant boundaries explicit at the database/API authorization layer.

## Phase 5 — Production CV / edge inference

Replace or augment the large multimodal model with a purpose-trained detector.

Potential architecture:

```text
Phone
  ↓
image quality filtering
  ↓
lightweight CV model (optional)
  ├─ likely normal → discard
  └─ likely issue → cloud
                    ↓
             specialized detector
                    ↓
             ambiguous case?
               ├─ no → result
               └─ yes → multimodal model
```

---

# 21. Production AI Roadmap

## Hackathon

Use Gemini Vision for rapid prototyping and structured image analysis.

## Pilot

Collect human-reviewed observations to produce a labeled local dataset.

## Production model

Train/fine-tune a smaller computer-vision model for the actual taxonomy.

Potential tasks:

- object detection;
- segmentation;
- blockage estimation;
- infrastructure-condition classification.

## Why a custom model is better eventually

A dedicated model can be:

- cheaper per image;
- lower latency;
- more predictable;
- optimized for Philippine street conditions;
- deployable on selected edge hardware;
- versioned and measured against local ground truth.

The large multimodal model can remain useful as an ambiguity resolver or analyst rather than the primary detector for every image.

---

# 22. Roadmap Features

## 22.1 Citizen crowdsourcing

Simple mobile web flow:

```text
Take photo
  ↓
Location
  ↓
Select problem
  ↓
Submit
```

Citizen reports enter the same observation pipeline.

```text
Vehicle
Citizen
Inspector
   ↓
Unified Observation Model
```

## 22.2 Before/after verification

```text
Detected:       82% blocked
After cleanup:   9% blocked
```

Use AI to verify resolution where confidence is sufficient.

## 22.3 Historical recurrence

Detect locations that repeatedly deteriorate.

Example:

```text
Sep 1  — 32%
Sep 5  — 41%
Sep 9  — 57%
Sep 15 — 71%
Sep 21 — 76%
Sep 28 — 82%
```

Potential insight:

> recurring blockage may require structural intervention rather than repeated cleanup.

## 22.4 Coverage intelligence

```text
Road network:        428 km
Observed this week:  381 km
Coverage:             89%
Blind spots:           47 km
```

## 22.5 Smart sampling

Increase sampling around:

- recurring problems;
- critical issues;
- known flood/hazard areas;
- areas without recent observations.

## 22.6 Workforce routing

Future only.

After the basic work-order system proves useful, optimize crew assignments and routes using:

- issue priority;
- crew capabilities;
- distance;
- availability;
- deadlines.

Do not build this for the hackathon.

---

# 23. Metrics & Success Criteria

## 23.1 Model metrics

- precision by issue type;
- recall by issue type;
- confidence calibration;
- false-positive rate;
- blockage-estimation error;
- percentage requiring manual review.

## 23.2 System metrics

- upload success rate;
- processing success rate;
- median observation processing latency;
- duplicate rate;
- API error rate;
- storage growth per vehicle-day.

## 23.3 Operational metrics

- issues detected;
- issues validated;
- work orders created;
- work orders resolved;
- median time to action;
- median resolution time;
- recurring issue rate;
- road coverage.

## 23.4 Product success metric

The strongest long-term metric is not “images processed.”

It is:

> **How much more infrastructure can the LGU inspect and resolve using the same operational resources?**

---

# 24. Cost / Efficiency Principles

The architecture SHALL follow these rules:

1. **Do not stream video to the cloud.**
2. **Do not send every frame to a large multimodal model.**
3. **Do not resize/upload originals unnecessarily.**
4. **Use direct S3 uploads with presigned URLs.**
5. **Use batching wherever latency does not matter.**
6. **Keep AI inference asynchronous.**
7. **Keep image retention configurable.**
8. **Aggregate repeated observations into issues.**
9. **Use spatial sampling rather than arbitrary photo counts.**
10. **Move to specialized CV inference at production scale.**

---

# 25. Hackathon Scope Lock

## Must have

```text
[ ] Smartphone capture
[ ] GPS
[ ] Distance-based sampling
[ ] S3 upload
[ ] Vision AI
[ ] Strict JSON schema
[ ] PostGIS storage
[ ] Issue map
[ ] Explainable priority score
[ ] Issue detail page
[ ] Work order creation
[ ] OPEN / IN_PROGRESS / RESOLVED
[ ] Quick / Quick Sight analytics
[ ] Kiro spec + task-driven implementation
```

## Should have

```text
[ ] Offline queue
[ ] Weather/hazard context
[ ] Observation history
[ ] Basic duplicate clustering
[ ] Resolution image
[ ] Face/license-plate redaction
```

## Only if time remains

```text
[ ] Citizen report form
[ ] Before/after AI verification
[ ] Adaptive sampling
[ ] Advanced analytics
[ ] Automatic recommendations beyond simple prioritization
```

## Explicitly out of scope

```text
[ ] Full flood simulation
[ ] Autonomous dispatch
[ ] National deployment
[ ] Custom model training from scratch
[ ] Full workforce routing
[ ] Complete citizen app
[ ] Real-time video streaming
```

---

# 26. Demo Scenario

The demo should tell one complete operational story.

## Step 1 — Capture

Show a phone mounted on a vehicle.

The vehicle moves through a route.

The app records:

```text
GPS + image + timestamp
```

## Step 2 — Detection

A sampled image is processed.

AI returns:

```text
Blocked drainage grate
82% blockage
93% confidence
```

## Step 3 — Map

The issue appears on the city map.

## Step 4 — Prioritize

Risk engine calculates:

```text
85 / 100
```

Breakdown:

```text
Severity      31/35
Weather       23/25
Recurrence    16/20
Hazard         8/10
Exposure       7/10
```

## Step 5 — Human decision

Officer reviews the evidence and creates a work order.

## Step 6 — Resolution

Status changes:

```text
OPEN → IN_PROGRESS → RESOLVED
```

Optionally upload a resolution photo.

## Step 7 — Analytics

Amazon Quick / Quick Sight shows:

```text
Critical issues
Open vs resolved
Top recurring locations
Coverage
Resolution time
```

This demonstrates the whole product, not just the AI model.

---

# 27. Pitch Guidance

## One-sentence pitch

> **ASTIG turns vehicles already traveling around our cities into mobile infrastructure inspectors, using AI to detect street-level problems, prioritize them, and turn them into actionable work orders.**

## Opening hook

> **“This phone is mounted on a jeepney. The jeepney is already going to drive through the city. What if that trip could also inspect the city?”**

Then demonstrate:

```text
road trip
  ↓
blocked drain detected
  ↓
map
  ↓
risk score
  ↓
work order
  ↓
resolved
```

## What makes ASTIG different

Avoid saying:

> “We built an AI that detects garbage.”

Say:

> **“We turn routine vehicle movement into a continuously updated street-level infrastructure sensor network.”**

## Differentiation from existing hazard systems

Existing government geospatial/hazard platforms can answer questions such as:

> “Where are known hazards?”

ASTIG adds:

> **“What infrastructure condition did a vehicle observe on the street today, and which observed problem should an official inspect first?”**

HazardHunterPH already exposes multi-agency hazard context, including PAGASA, PHIVOLCS, MGB, NAMRIA/IFSAR, and DPWH-related layers. ASTIG should position itself as the street-level observation and operations layer rather than a replacement for those systems. [HazardHunterPH](https://hazardhunter.georisk.gov.ph/map)

---

# 28. Likely Judge Questions & Answers

## “Why not just use inspectors?”

> Inspectors remain important. ASTIG increases the frequency and geographic coverage of observations by using vehicles that are already moving through the roads.

## “Why not drones?”

> ASTIG is designed around assets LGUs already have access to. The core pilot does not require dedicated aircraft or specialized inspection hardware.

## “Can this really predict flooding?”

> The MVP does not claim deterministic flood prediction. It produces infrastructure priority using observed conditions, weather context, recurrence, hazard context, and exposure.

## “How accurate is the AI?”

> The hackathon model is a prototype. Production accuracy would be established through a labeled, locally collected dataset and human verification. The system stores confidence and supports human review.

## “Why cloud AI?”

> A capable vision model may be too expensive or slow to run on cheap phones. The MVP keeps inference in the cloud while the device performs capture and lightweight filtering. A specialized edge model is a production roadmap item.

## “What happens if the AI is wrong?”

> AI produces evidence and confidence. The risk engine is deterministic, and officials approve work orders before action.

## “What about privacy?”

> Images can contain identifiable people or vehicles, so production architecture should minimize collection, restrict access, apply redaction, define retention, and follow the Data Privacy Act principles.

## “How do you scale from one barangay to the entire country?”

> We scale by road-segment coverage, not by a fixed number of images per street. The pilot first proves the pipeline in one barangay, then expands to multiple barangays, then an LGU, then multiple LGUs.

## “What is the business model?”

> Start with low-capex pilots using existing vehicles and phones. Expand based on measured operational value, then proceed through appropriate government procurement.

---

# 29. Business / Adoption Model

## Pilot package

```text
1 LGU
1 barangay
1–3 vehicles
existing smartphones
30-day measurement period
```

Pilot outputs:

- detected issue inventory;
- model accuracy report;
- coverage report;
- prioritized interventions;
- work-order completion metrics;
- privacy/security assessment.

## Expansion package

```text
multiple barangays
multiple devices
analytics
historical recurrence
department workflows
```

## Long-term SaaS / managed-service concept

Pricing dimensions could eventually include:

- number of monitored road kilometers;
- number of devices;
- image/inference volume;
- storage;
- number of users;
- support tier.

Do not put speculative pricing in the hackathon unless asked.

---

# 30. Competitive / Strategic Positioning

ASTIG is not primarily competing against:

- image-recognition APIs;
- dashboard software;
- GIS basemaps.

Its strategic proposition is the combination of:

```text
Low-cost mobile sensing
        +
Street-level computer vision
        +
Geospatial history
        +
Risk prioritization
        +
Operational workflow
        +
Resolution evidence
```

The long-term data advantage comes from building a historical dataset connecting:

```text
what was observed
      +
where
      +
when
      +
how severe
      +
what action was taken
      +
what happened afterward
```

That dataset can eventually improve detection, recurrence prediction, and intervention planning.

---

# 31. Architecture Decisions Summary

| Decision          | Chosen approach                               | Reason                                           |
| ----------------- | --------------------------------------------- | ------------------------------------------------ |
| Capture trigger   | Distance-based                                | Stable route coverage                            |
| Video handling    | Sparse still frames                           | Lower storage/inference cost                     |
| Edge AI           | Lightweight filtering only in MVP             | Avoid relying on cheap-phone compute             |
| Main AI           | Gemini for hackathon                          | Fastest path to prototype                        |
| Production AI     | Specialized CV + optional multimodal fallback | Cost/latency/control                             |
| Image storage     | S3                                            | Required AWS service and scalable object storage |
| Backend           | Lambda + API Gateway                          | Simple serverless MVP                            |
| Database          | PostgreSQL + PostGIS                          | Spatial operations                               |
| Frontend          | React                                         | Operational map/workflow                         |
| Analytics         | Amazon Quick / Quick Sight                    | Required and appropriate analytics layer         |
| Risk              | Deterministic weighted score                  | Explainable and testable                         |
| Government action | Human-approved                                | Auditability and operational realism             |
| Ticketing         | Minimal work orders                           | Converts detection into action                   |
| Crowdsourcing     | Roadmap                                       | Useful but not MVP-critical                      |
| Flood simulation  | Out of scope                                  | Too data-hungry/complex for MVP                  |
| Scale             | Barangay → LGU → multi-LGU                    | Realistic adoption path                          |

---

# 32. Final Architecture Principle

The product should be thought of as:

```text
OBSERVE
  ↓
UNDERSTAND
  ↓
LOCATE
  ↓
PRIORITIZE
  ↓
ACT
  ↓
VERIFY
```

not:

```text
AI → map
```

The durable product is the operational loop, not the model.

---

# 33. Final Product Definition

> **ASTIG — Automated Street & Infrastructure Geospatial Intelligence** is a low-cost, vehicle-mounted infrastructure monitoring platform. Smartphones attached to vehicles capture spatially sampled street imagery and GPS data. Cloud AI converts candidate images into structured infrastructure observations. PostGIS stores and spatially clusters those observations. A transparent risk engine combines infrastructure severity, weather risk, recurrence, hazard context, and exposure to prioritize issues. LGU personnel review issues on a map and can create simple work orders to address them. The initial pilot starts in a single barangay and expands only after the system demonstrates useful coverage and operational value.\*\*

## MVP loop

```text
CAPTURE
→ AI DETECT
→ MAP
→ SCORE
→ HUMAN REVIEW
→ WORK ORDER
→ RESOLVE
```

That is the system to build for the hackathon.

---

---

# 33A. Implementation Task Plan

This can be copied into Kiro as the basis for `tasks.md`.

## T1 — Repository and project setup

- Create React web application.
- Create mobile application.
- Create backend/API project.
- Configure AWS environments.
- Add Kiro steering/spec files.

**Done when:** local development and deployment skeletons run successfully.

## T2 — Database and spatial schema

- Provision PostgreSQL.
- Enable PostGIS.
- Create vehicle, device, session, observation, detection, issue, risk, work-order, and resolution tables.
- Add spatial indexes.

**Done when:** an observation can be stored and queried by coordinate, road segment, and barangay.

## T3 — Mobile spatial sampler

- Implement session start/stop.
- Read GPS.
- Track travelled distance.
- Capture approximately every 7 m.
- Store offline queue.

**Done when:** a test route creates correctly spaced observations.

## T4 — S3 ingestion

- Generate upload URLs.
- Upload images directly to S3.
- Store observation metadata.
- Trigger processing on upload.

**Done when:** a mobile image creates a traceable S3 object and backend observation record.

## T5 — Vision AI adapter

- Implement Gemini Vision adapter for hackathon.
- Implement strict JSON schema validation.
- Store model version and confidence.
- Handle failed/invalid responses.

**Done when:** sample images consistently produce valid structured detections.

## T6 — Spatial enrichment and clustering

- Resolve barangay from coordinates.
- Associate nearest road segment.
- Cluster repeated observations into issues.

**Done when:** repeated observations near the same physical problem appear as one issue with multiple evidence records.

## T7 — Risk engine

- Implement normalized factor calculations.
- Implement configurable weights.
- Persist score components and formula version.

**Done when:** every scored issue has an explainable 0–100 score.

## T8 — React command center

- Build map.
- Add severity/issue filters.
- Add issue markers.
- Add issue detail panel.

**Done when:** an officer can find and inspect issues geographically.

## T9 — Work orders

- Add create-work-order action.
- Implement status transitions.
- Show assignment and recommended action.

**Done when:** an issue can move from detection to an operational work item.

## T10 — Quick / Quick Sight analytics

- Expose analytics dataset.
- Build executive views.
- Demonstrate natural-language questions or dashboard analysis.

**Done when:** judges can see aggregated operational information through the required AWS analytics tooling.

## T11 — Privacy and demo hardening

- Remove audio capture.
- Add basic image redaction strategy or clearly mark as prototype.
- Restrict evidence access.
- Add logging.

**Done when:** privacy and access controls can be explained clearly during judging.

## T12 — End-to-end demo

- Prepare one route.
- Prepare several realistic observations.
- Demonstrate AI detection.
- Demonstrate scoring.
- Create work order.
- Resolve issue.
- Show analytics.

**Done when:** the complete demo can be executed without manual database intervention.

---

# 34. Sources / Current Context

1. Philippine Statistics Authority — Philippine Standard Geographic Code, latest listed count: 42,010 barangays as of 30 June 2026.  
   https://psa.gov.ph/classification/psgc/node/1684083815

2. Department of Budget and Management — FY2026 National Tax Allotment release to LGUs, ₱1.19 trillion, published 27 January 2026.  
   https://www.dbm.gov.ph/index.php/management-2/3805-dbm-carries-out-pbbm-directive-releases-p1-19-trillion-nta-to-lgus-under-people-centric-2026-gaa

3. Republic Act No. 12009 — New Government Procurement Act; applies to LGUs and establishes principles including transparency, efficiency, proportionality, accountability, and value for money.  
   https://www.comelec.gov.ph/?r=Procurement%2FLawsRulesandProcedures%2FRA12009

4. GPPB-TSO — Public Advisory No. 09-2026, current guidance concerning the applicable NGPA IRR reference.  
   https://www.gppb.gov.ph/public-advisory-no-09-2026/

5. Republic Act No. 10173 — Data Privacy Act of 2012.  
   https://officialgazette.gov.ph/2012/08/15/republic-act-no-10173/

6. National Privacy Commission — advisory material concerning identifiable images/video as personal information.  
   https://privacy.gov.ph/wp-content/uploads/2022/08/Advisory-Opinion-No-2022-015-FINAL-sgd_Redacted.pdf

7. HazardHunterPH — multi-agency hazard/geospatial context, including PAGASA, PHIVOLCS, MGB, DepEd, DOH and DPWH data sources.  
   https://hazardhunter.georisk.gov.ph/map

8. Kiro — Specs documentation; requirements, design, tasks, Quick Spec, and requirements analysis.  
   https://kiro.dev/docs/specs/

9. Kiro — Quick Spec documentation.  
   https://kiro.dev/docs/specs/quick-plan/

10. Amazon Quick — current service documentation, including Quick Sight dashboards and analytics capabilities.  
    https://docs.aws.amazon.com/quick/latest/userguide/

11. Amazon Nova / Bedrock — current multimodal image understanding capabilities.  
    https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-multimodal-models.html

---

# 35. Architect's Final Recommendation

**Build the vertical slice. Do not build the whole vision.**

The demo should make one thing undeniable:

> A routine trip around a city can continuously generate useful, geolocated infrastructure intelligence—and that intelligence can become an actionable government work item.

Everything else is expansion.
