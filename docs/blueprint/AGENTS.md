# AGENTS.md — Mandatory Rules for Every AI and Human Builder

**Before edits:** Read `README.md`, `00_STATUS_AND_SCOPE.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_SYSTEM_ARCHITECTURE.md`, `17_DECISIONS_AND_ASSUMPTIONS.md`, plus the documents relevant to your task.

## Hard stops

- Do not assume the full YCT Map audit is included; only its summary is attached.
- Do not implement or announce emergency dispatch, 24/7 monitoring, responder tracking, incident avoidance routing or official college endorsement.
- Do not commit hardcoded passwords, secret keys, real personal reports, credentials from conversations, or signing keys. The owner-specified super-admin username is allowed; the previously shared password is **not** an approved secret.
- Do not modify YCT Map A*, GPS, database, surveys, path verification, routing or authentication. All Map integration needs separate owner permission and full audit verification.
- Do not seed, reset, migrate production databases, commit, push, deploy or publish without explicit approval.
- Do not claim blocked tests or device checks passed. Do not use existing agent claims as fresh evidence.

## Invariants

Map owns geography; Alert owns incidents. Shared DB/auth is forbidden. Anonymous public reports are preserved. Similar reports don't auto-publish. Admin decisions are auditable and server-authorized. No server confirmation means no `received` claim. Manual location remains possible when Map or GPS fails. Public incident details must be safety- and privacy-reviewed.

## Working process

1. Understand assigned task, inputs and non-goals; name affected files.
2. Validate relevant contracts and open decisions. Stop at owner-gated blockers.
3. Work in small branches/worktrees and avoid concurrent edit collisions.
4. Test code and critical failures; where native behaviour is affected use actual Android hardware.
5. Present changed files, test commands/results/blocked suites, environmental effects, security impact, risks and outstanding decisions.
6. Submit changes for owner review; do not deploy autonomously.

## Task-completion rule

A feature is complete only against approved acceptance criteria with actual reproducible evidence. Functional code in a browser does not prove an Android app, and a functioning app does not prove a safe, staffed emergency-response service.
