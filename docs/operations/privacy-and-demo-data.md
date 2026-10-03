# Privacy and demo-data guardrails

ASTIG imagery from public roads may contain identifiable people, license plates, homes, and other personal information. The demo is a prototype, not a claim of legal compliance. Follow the team's approved collection and data-handling process before using real imagery.

## Hackathon defaults

- Prefer synthetic, licensed, or explicitly approved sample imagery.
- Mark generated demo observations clearly in the UI and analytics.
- Do not collect audio.
- Do not commit imagery, exports, credentials, or real personal data to Git.
- Keep S3 buckets private; use short-lived access URLs and least-privilege permissions.
- Restrict raw-evidence access to the demo roles that need it.
- Avoid logging images, secrets, exact evidence URLs, or unnecessary personal data.
- Decide retention and deletion behavior before a real pilot; do not assume indefinite image retention.
- Plan practical face/license-plate redaction for any operational deployment.

## Demo data checklist

- [ ] Dashcam footage (Manila demo): recorded by the team, or used with the owner's written permission or a licence covering this use. Downloaded third-party videos aren't usable by default.
- [ ] Faces and licence plates blurred in every uploaded frame; a second person checked each frame. Raw video and unredacted frames never go to Git or S3.
- [ ] Every seeded row is clearly synthetic or approved.
- [ ] Coordinates are in the intended demo area and do not identify a private residence.
- [ ] Images have known rights and no unnecessary identifiable content.
- [ ] Demo credentials are isolated from production and rotated/removed after the event.
- [ ] UI labels synthetic data and does not imply that a prototype score is validated flood risk.

## Operational review before real capture

Confirm lawful purpose and notice, data minimization, access control, retention, deletion, redaction, incident handling, and appropriate privacy review with the responsible organization. Do not present this checklist as legal advice.
