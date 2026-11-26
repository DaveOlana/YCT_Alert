# 14 — High-Level Roadmap, Dependencies and Delivery Gates

**Estimate basis:** One developer coordinating AI agents, ~20–25 focused hours/week, physical Android test device, and owner decisions without long delays. Ranges are planning estimates, not promises. Production-grade staffed emergency operations are **not** included.

## Roadmap at a glance

| Phase | Indicative duration | Deliverable | Exit gate |
|---|---|---|---|
| P0 — Foundation | 3–5 days | Approved stack, API principles, taxonomies, repo and risk decisions | G0 |
| P1 — Vertical slice + Capacitor | 5–8 days | Public web/Android synthetic report through DB and admin dashboard | G1 |
| P2 — Reporting and moderation core | 1–2 weeks | Model, idempotency, candidate matches, RBAC, incident state machine | G2 partial |
| P3 — Polish, privacy, resilience | 1–2 weeks | Usable UX, audit trail, failure handling, browser/native tests | G2 |
| P4 — YCT Map integration | 3–7 days | Geography ingestion and approved Map incident layer | G3 |
| P5 — Pilot readiness | 1–2 weeks | Field UX, supervised simulation, backups, security/operational review | G4 |
| P6 — Android distribution | Additional days/weeks as needed | Signed app test build and release compliance | G5 |

**Overall indicative functional MVP:** 3–5 weeks. **Controlled, tested pilot:** 6–10 weeks, depending on skill, infrastructure and feedback. Parallel work may reduce calendar time but raises integration/review overhead. Do not convert to a firm quote without scope and acceptance criteria.

## P0 foundation tasks

- Receive/validate full Gemini YCT Map audit; inspect repo at least for `GET /api/locations/` shape (needed by P4, not blocker for standalone Alert P1).
- Agree provisional framework, app ID, repository owner and staging hosting; record ADRs.
- Owner approves taxonomy, admin roles, privacy exclusions, response disclaimers and build-only vs live-pilot boundary.
- Create repo and CI (lint, formatting, unit, contract checks); set dev/test separation and `.env.example` without secret values.

## P1 first vertical slice (highest priority)

- Scaffold API + DB, public Vite frontend, admin web, Android Capacitor shell.
- Functional report form with manual incident location and **synthetic data only**.
- Atomic `POST /reports` with idempotency key and server receipt; create one PENDING incident/report.
- Admin login/bootstrap in local/test only, approve synthetic incident into **test-only** feed.
- Physical Android round-trip and browser e2e; no real security officials or students yet.

## P2 incident engine and roles

- Implement draft state transitions with policy checks and transactions.
- Add candidate duplicate detection and ability to undo false associations.
- Grant/revoke student admin permissions; protected super-admin bootstrap; session invalidation.
- Implement public safe feed field allowlist and server-generated incident-safe summary workflow.
- Concurrency tests and basic abuse controls.

## P3 reliability and design

- Android location adapter; manual fallback, accessibility, tiny payloads and good error states.
- Distinguish unknown network outcome from success; reliable idempotent retry.
- Admin audit, monitoring hooks, limited retention configuration and backups.
- Review privacy notice and moderation runbook with owner.

## P4 integration with Map — optional feature flag until tested

- Validate real published-places GeoJSON endpoint shape. Avoid new endpoint unless needed.
- Integrate place selector with fallback; preserve independent reporting.
- Implement test feed consumer isolated to new Map source/layer and Menu link.
- Run Map’s legacy tests, no route graph changes, test Alert-down and Map-down.
- Release behind separate feature flag, owner-approved Map commit only.

## P5 supervised pilot readiness

- Perform synthetic scenario tests for fire/medical/security without sending false live alarms.
- Operational contact numbers and administrator shifts must be verified and authorized.
- Decide user-facing incident status vocabulary, data retention, publishing restrictions and complaints process.
- Test Android physical devices, browser variety, no GPS, degraded networks and regression.
- Prepare incident reporting and outage playbook; obtain authorization for any real campus pilot.

## P6 distribution

- Create/steward signing keys and package ID, store recovery material securely.
- Internal Android app release; verify native network and permission behaviour.
- Determine whether Google Play publication is in scope and satisfies current store policies; no guarantee app-store approval in project timeline.

## Critical path and dependencies

- `P0 API/roles decision → P1 vertical slice → P2 incident workflow → P3 QA → P5 pilot readiness`.
- `P4 Map integration` depends on full audit and approved public contracts; can run after P2 with feature flag.
- `P6 store listing` depends on app ID/signing decision and technical readiness; not required to demo browser and APK.
- Operational launch is separately gated by staffing/authorization and reliability readiness.

## Definition of Done

Each phase delivers evidence: changed files, design/contract updates, redacted test outputs, physical-device confirmation when applicable, risk/decision changes and owner acceptance. No agent silently advances an unapproved gate.
