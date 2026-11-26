# 16 — Builder and Multi-Agent Collaboration Protocol

## Roles (people or AI agents)

- **Owner / integrator:** approves scope, security decisions, architecture, environments, merges and distribution.
- **Architecture agent:** contract review, ADR proposals, data model and cross-service invariants; does not silently write broad refactors.
- **Backend agent:** API, persistence, transactions, RBAC and data integrity.
- **Mobile agent:** shared public UI, Capacitor, location adapter, browser/Android e2e.
- **Admin agent:** dashboard and administrative workflow using frozen API contracts.
- **QA/security reviewer:** adversarial tests, permissions, privacy, fault injection; independent of original implementing agent where possible.
- **Map integrator:** only owner-approved isolated YCT Map adapter and legacy regression suite.

## Agent task protocol

1. Read root `AGENTS.md`, the relevant docs and current code; identify contradictions first.
2. Write a task plan: goal, affected files, excluded files, dependencies, tests, rollback.
3. Use a dedicated branch/worktree, avoid concurrent edits to the same files.
4. Build a narrow vertical slice; obey the approved API contract.
5. Run relevant automated tests and browser/Android checks; record **actual** outcomes.
6. Hand over a change report: scope, diffs, migrations, tests, known gaps, release impact.
7. Only owner merges/deploys unless separately authorized.

## Ownership boundaries

- Backend agent may not change Map route engine.
- Mobile agent may not change DB schema or own backend authorization decisions.
- Admin agent may not define its own endpoint shape inconsistent with contract.
- Map integrator may not share sessions/tables or change admin models.
- QA agent should not run seed/reset against unknown DB targets.
- No agent hardcodes protected administrator credentials or signs with unowned keystore.

## Conflict process

When source code conflicts with specification, **for behaviour to build**, seek owner decision; **for description of what exists**, trust inspected code/test evidence. Document discrepancy in an ADR/open issue. Do not silently reconcile with unilateral changes.

## PR/commit checklist

- [ ] Task ID and linked requirements stated.
- [ ] No unrelated formatting/line-ending churn.
- [ ] Contracts and schema changes documented/versioned.
- [ ] No real credential or private incident data in diff/screenshots.
- [ ] Tests run and pass/fail/blocked results attached.
- [ ] Privilege/state-change negative tests added where relevant.
- [ ] Feature flags and rollback documented.
- [ ] Browser and native device tested when change affects native functionality.
- [ ] No production modification or deployment without authorization.

## Completion report format

```text
Task:
Scope implemented:
Files modified / created:
Documentation / API changes:
Tests RUN (command, result, count):
Tests BLOCKED or NOT RUN:
Actual device/browser inspection:
Security and privacy considerations:
Data migrations or environment effects:
Known limitations / unresolved decisions:
Ready for owner review? YES / NO, with reasons
```

## Handoff quality bar

Someone unfamiliar with the coding session must be able to read the issue, ADR and test results and know exactly what was changed and what remains unproven. Never replace evidence with phrases such as `100% safe` or `zero regression risk`.
