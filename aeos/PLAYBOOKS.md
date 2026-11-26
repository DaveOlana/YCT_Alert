# AEOS Work Modes and Protocols

## MODE: DISCOVER — early ideation, no repository required

Explore the problem, intended users, constraints, competing products, feasibility, alternatives and success criteria. Challenge assumptions. Do not assume brainstorming statements are approved requirements. Summarize approved outcomes into a product brief for the future repo. No application code or repo modification by default.

## MODE: AEOS INIT — create project knowledge after ideation

Only when the human requests initialization, follow `aeos/BOOTSTRAP.md`. Inspect existing files/code, preserve them, then generate/update the minimum planning records (`PROJECT.md`, `STATE.md`), reference supplied specifications, propose milestones, and stop for review. AEOS INIT is **not** application BUILD and is not permitted to install dependencies, scaffold application code, modify databases, commit or deploy.

## MODE: PLAN — start or scope work; no implementation

1. Identify desired outcome, users, exclusions, constraints and available evidence.
2. Inspect existing repo and project documents (if existing); distinguish implementation from plans.
3. For a NEW project: question essential unknowns, assess feasibility, choose an appropriate smallest vertical slice, select architecture only after decision gates.
4. For EXISTING project: inspect actual code paths, working tree, tests and previous decisions. Do not assume docs are fresh.
5. Output a bounded milestone proposal: ID, acceptance criteria, dependencies, affected areas, security/data risks, test plan and rollback when appropriate.
6. Identify required explicit approvals, such as safety G0, and request a direct `BUILD <milestone>` only when planning is complete.

**Gate**: During PLAN do not implement, generate app code, apply migrations, install project deps, or change deployment. Planning output can be in chat until the human authorizes writing to repository.

## MODE: BUILD — implement approved bounded milestone

Preconditions: human `BUILD <ID>` in direct instruction; project-specific decision gates met; scope clear; local environment safe.

1. Record approved scope/acceptance and existing Git state.
2. Implement small coherent increments; run focused checks, examine failures and self-correct.
3. If a consequential decision or unsafe action becomes necessary, **stop that portion** and request authorization; continue independent safe subtasks where possible.
4. Run the appropriate verification ladder and inspect application output. For UI, inspect real rendered screens at relevant sizes, not only tests. For mobile, include actual device checks where required.
5. Inspect diff and update accurate handoff/state. No automatic commits.

**Completion report**: requirements addressed, files changed, test/evidence ledger, security/data impact, known unverified behaviors, readiness recommendation, suggested commit message.

## MODE: DEBUG — evidence-first root cause

- Collect exact symptom, environment, timestamp, version, steps, expected/actual and any artifacts.
- Reproduce in a safe environment; inspect relevant client, server, persistence, network and state machine boundaries as applicable.
- Write competing hypotheses; discard hypotheses that the evidence contradicts. Do not label a plausible cause as verified.
- Add a regression reproducer where feasible; implement a small root-cause fix only after authorization.
- Test negative paths and adjacent flows. For auth, session/CSRF/cookie variants; for persistence, save/reload/resubmit; for concurrency, repeat requests and transaction behavior; for media, upload/store/read/render.
- If production-only: deploy/observe only with specific permission and safely scoped diagnostic tools.

## MODE: REVIEW — independent inspection

- Inspect changed lines and all important callers, not only summary text.
- Trace requirements to actual code and tests. Look for regressions, privilege defects, migrations, destructive changes, race conditions, accessibility and edge cases.
- List findings by severity with reproducible evidence, file references and uncertainty; report blockers and tests not run.
- Do not silently implement fixes during a read-only review.

## MODE: RECOVER — new agent / interrupted project

- Read repository bootstrap files, existing product spec and STATE, then actual Git status, critical source and tests.
- Determine last verified milestone, pending unstaged changes, open risks, environment, reproducible setup and next safe milestone.
- Identify discrepancies between source code and records; do not erase evidence.
- Output a concise handoff and request necessary permissions. **No implied BUILD because an earlier chat mentioned it.**

## MODE: RELEASE — controlled deployment

- A completed BUILD is **not** RELEASE authorization.
- Require explicitly approved target/environment, release version, change list, migration/backups/rollback, health metrics, real smoke checks and ownership.
- Dev / test / staging / prod separation is mandatory when production data or public users could be impacted.
- Never claim production-verified based solely on local/unit/CI tests. Stop and request authorization before push/merge/deploy/production data action.

## Multi-agent delegation

- Lead agent remains responsible for milestone criteria, integration and final evidence ledger.
- Delegate only bounded, non-overlapping work to specialist agents; specify scope, files, read/write authority and expected evidence.
- Subagents inherit restrictions and cannot grant themselves BUILD/production/Git authority.
- Do not equate agreement between two agents with independent verification. Prefer reviews using code, tests and artifacts.
