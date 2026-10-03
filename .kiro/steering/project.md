# ASTIG project steering

## Product

ASTIG (Automated Street & Infrastructure Geospatial Intelligence) turns existing vehicle movement into a low-cost, geolocated infrastructure observation network for local government operations.

## MVP outcome

Prove one end-to-end operational loop: capture or seed a geolocated image → validate structured AI evidence → map and explainably prioritize the issue → let an authorized officer create, update, and resolve a work order.

## Principles

- Focus on a small, convincing vertical slice over broad, disconnected features.
- AI is advisory and extracts visible evidence only. It does not determine government action.
- Risk is a deterministic, versioned, explainable score, not a claim of flood probability.
- Keep capture resilient to intermittent connectivity and image processing asynchronous.
- Treat geospatial uncertainty, privacy, data minimization, evidence access, and retention as first-class concerns.
- Start with one pilot area; keep future multi-LGU growth in mind without building tenant complexity prematurely.

## Hackathon boundaries

Required direction: React operational web app, smartphone capture, AWS S3, API Gateway/Lambda-style API and processing, Postgres/PostGIS, vision provider (Gemini is the proposed hackathon option), and Amazon Quick/Quick Sight analytics.

Out of scope unless explicitly re-approved: full hydrological simulation, autonomous dispatch, continuous video upload, a complete citizen app, custom model training, nationwide rollout, and fleet/workforce route optimization.

Mobile framework, backend language, IaC tool, auth implementation, map provider, and final AWS topology remain open until the team records a decision.
