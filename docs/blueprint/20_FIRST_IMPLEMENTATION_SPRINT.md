# 20 — First Implementation Sprint: Actionable Tasks

**Purpose:** Give a coding agent a safe, useful first assignment after owner approval of Gate G0. This file is a plan, not authorization to code or deploy.

## Prerequisites

- Owner approves initial stack and categories; written decisions recorded.
- Owner designates repo and package/app ID naming convention.
- Synthetic-only DEV/TEST environment is available; no Map secret or shared DB credentials.
- Architecture/agent rules read and acknowledged.

## Ticket S1 — Repository, tooling and contracts

**Inputs:** `02_SYSTEM_ARCHITECTURE.md`, `07_API_CONTRACTS.md`.  
**Deliver:** workspace scaffolding, README setup, formatter/linter, typechecks, OpenAPI seed, isolated test DB configuration and `.env.example` with names only.  
**Tests:** install/build from clean checkout, typecheck, contract validation, secret scan.  
**Do not:** contact production Map DB or invent real campus incidents.

## Ticket S2 — Public UI and Android shell

**Inputs:** `01_PRODUCT_REQUIREMENTS.md`, `10_CAPACITOR_AND_WEB.md`.  
**Deliver:** minimal accessible report form, web build, Capacitor Android shell, manual location selection/text entry and placeholder taxonomy.  
**Tests:** browser and one physical Android; deny GPS; verify build updates via `npx cap sync`.  
**Do not:** implement background tracking or force app installation.

## Ticket S3 — Intake + idempotency vertical slice

**Inputs:** `05_DATA_MODEL.md`, `06_INCIDENT_MATCHING_AND_LIFECYCLE.md`, `07_API_CONTRACTS.md`.  
**Deliver:** migrations in TEST only, `POST /api/v1/reports` with validation, server receipt, idempotency and initial PENDING incident.  
**Tests:** repeat-click, timeout retry, key collision/different payload, concurrent inserts, manual location fallback.  
**Do not:** auto-approve or publish test incident to production.

## Ticket S4 — Admin minimal review slice

**Inputs:** `08_ADMIN_ROLES_AND_ASSIGNMENT.md`, `09_ADMIN_BOOTSTRAP_AND_RECOVERY.md`.  
**Deliver:** secure local-only bootstrap, admin login, pending queue, test-only activate/reject, audit row and public synthetic feed on TEST.  
**Tests:** unauthorized transition blocked, protected-owner account protected, no secret in source/log.  
**Do not:** hardcode passwords, use a public bootstrap endpoint, claim dispatch.

## Ticket S5 — Vertical slice QA and handoff

**Inputs:** `13_TEST_AND_ACCEPTANCE.md`.  
**Deliver:** reproducible short screencast or manual evidence of *synthetic* Android/browser report → API → admin → test feed, with redacted output; passing test report.  
**Tests:** Map outage simulated; alert API timeout; Android pause/resume; browser missing GPS.  
**Do not:** touch the YCT Map repository in this sprint.

## Scope change protocol

If agents discover missing Map API fields, do not work around it by editing Map immediately. Use mocks for S1–S5 and raise the issue for G3. Capture any new product requirements as explicit change requests.

## Sprint success criteria

- Browser and Android both reach test API.
- One accepted request = one stored report, idempotent duplicates never double-count.
- Only signed-in authorized admin can activate test incident.
- Public feed hides raw/private details.
- Test incident never enters real Map or production feed.
- Repo documentation and test results allow a new builder to continue unaided.
