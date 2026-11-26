# 18 — Open Questions and Required Decisions

**Labels:** `BLOCKS G0` means resolve before writing the core production-intended implementation. `BLOCKS G4` means controlled synthetic development can continue, but real public pilot must not begin.

| ID | Open decision | Priority | Default until decided |
|---|---|---|---|
| O-01 | Confirm full YCT Map repo audit and actual `GET /api/locations/` schema | BLOCKS G3 | Build Alert with mocked contract and manual fallback |
| O-02 | Confirm YCT Alert V1 incident category list and descriptions | BLOCKS G0 | Synthetic trial categories only |
| O-03 | Select frontend/backend stack and compatible versions | BLOCKS G0 | Proposed Vite/React/Capacitor + Fastify/PostgreSQL |
| O-04 | Who owns domain, Git repo, Android app ID, signing keys, Play account? | BLOCKS G1 / G5 | Private local dev IDs; no store release |
| O-05 | Confirm incident location requirements and privacy-safe public precision | BLOCKS G1 / G4 | Text-only accepted for triage; no invented pin |
| O-06 | Confirm admin verification/eligibility, assignment expiry and privilege scopes | BLOCKS G2 | Only synthetic admins, protected owner account |
| O-07 | Agree secure bootstrap/recovery and MFA for privileged production use | BLOCKS G4 | No real public administrators |
| O-08 | Approve matching policy thresholds and false merge corrections | BLOCKS G2 | Candidate suggestion, manual review preferred |
| O-09 | Define PENDING→ACTIVE/REJECTED policy and safe public summaries | BLOCKS G2 / G4 | No automatic approval |
| O-10 | Finalize external Alert hosting and API domain/origins | BLOCKS G3 / G4 | Local staging with mocks |
| O-11 | Who monitors and responds to reports, and what hours? | BLOCKS G4 | Clearly labelled unstaffed pilot, synthetic data only |
| O-12 | Is there institutional endorsement/approval? | BLOCKS G4 | Independent pilot wording only |
| O-13 | Verify official campus emergency phone numbers/contact permission | BLOCKS G4 | No invented numbers; generic instruction to seek authorized emergency help |
| O-14 | Retention/privacy notice, backup policy and lawful data processing | BLOCKS G4 | No real private submissions |
| O-15 | Notifications? public history? optional contact? | OPTIONAL / scope | None by default |
| O-16 | Real incident severity taxonomy and whether location generalization is needed | BLOCKS G2/G4 | No unsupported severity claims |
| O-17 | How to handle a new report matched to a RESOLVED incident | BLOCKS G2 | Treat as new pending for review |
| O-18 | How long idempotency tokens live, safe receipt access policy | BLOCKS G1 | Preserve key across retries, protected receipt status if built |
| O-19 | Public incident polling interval and staleness policy | BLOCKS G3 | Candidate 30–60sec; clearly stale after failure |
| O-20 | Separate budget/support model and uptime target | BLOCKS G4 | Free-tier is experimental only |
| O-21 | Full audit's evidence about Map location archival/deletion | BLOCKS G3 | External reference nullable with snapshot/fallback |

## Recommended owner decision meeting

Approve O-02, O-03, O-04 (provisional for dev), O-05 (minimum fields) and O-18 first. Then assign agents to P1 vertical slice. Institutional matters O-11–O-14 can be tackled in parallel, **but they gate real-user pilot**.

## How to resolve a question

Record an ADR with context, alternatives, chosen option, owner signature/approval, affected files and tests. Replace the `OPEN` label and update any impacted requirements or contracts; do not leave contradictory docs.
