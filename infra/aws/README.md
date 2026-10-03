# AWS infrastructure

Keep the hackathon deployment small: private S3 evidence bucket, API Gateway/Lambda API, asynchronous Lambda processing (optionally SQS-backed), Postgres/PostGIS, and least-privilege access. Add CloudWatch visibility for processing failures.

Choose and document an IaC tool at kickoff. Do not commit state files, credentials, or console-exported secrets.
