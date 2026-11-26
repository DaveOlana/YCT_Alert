# AEOS — Verification Profiles

Apply the relevant checks, not every check to every project. A failing relevant check is a risk even if other checks pass.

## Universal ladder

| Level | Objective | Typical proof |
|---|---|---|
| L1 Static | Basic correctness | formatting, type-check, lint, dependency and secret audit |
| L2 Behavioral | Known contract holds | unit, integration, regression, property/negative tests |
| L3 Runtime | Real executable works | startup, API/browser/CLI interaction, persisted reload |
| L4 Experience | Human can use it | visual QA, accessibility, responsive sizes, keyboard/device input |
| L5 Operational | Deployment and dependencies behave | migration, staging smoke, external provider, telemetry, rollback |

## Profiles

**Web/front-end:** rendering at desktop/tablet/mobile, navigation, focus/keyboard, a11y, browser console/network, loading/empty/error states, real forms, privacy, cross-browser as appropriate. Avoid calling UI complete based only on screenshots or unit tests.

**Backend/API/database:** contract and input validation, authz by role, CSRF/session where applicable, migrations and reversibility, transactions, concurrency/idempotency, pagination, dependency outages, query correctness, data retention, observability, restore/backups.

**Mobile/native:** emulator and physical-device verification for hardware-dependent behavior; GPS permission deny/allow, lifecycle pause/resume, offline timeout, network reconnect, release build/signing provenance, accessibility, app-store gate if required. Browser success isn't native proof.

**Desktop/CLI:** OS and shell differences, install/uninstall, filesystem permissions, unicode/paths, non-zero exit codes, telemetry/privacy, packaging, upgrade path.

**AI/agent systems:** eval dataset/quality rubric, hallucination boundaries, tool permissions, prompt-injection resistance, data privacy, reproducibility, latency/cost ceilings, model-version drift, fallback/escalation, human override. A successful single demo is not evaluation evidence.

**Data/automation/infrastructure:** sample and realistic datasets, schema contracts, checkpointing, retries and idempotency, scheduling, permissions, secrets, dry runs, data lineage, drift, rollback and cost monitoring.

**Safety-critical/public incident:** synthetic-first validation; no real-public incident propagation from testing, server acknowledgment before receipt claims, admin review before public publication, no false dispatch or verification claims, separate operational readiness and authorized staffing review. Additional project-specific gates mandatory.

## Evidence ledger (required contents, optional format)

Requirement ID → verification command or observed reproduction → environment → actual result → PASS / FAIL / BLOCKED / NOT RUN → remaining limitation.

Report *what was actually executed*. Existing documentation saying a suite passed previously is not a fresh run. Skip irrelevant levels with reasons; don't silently claim coverage.
