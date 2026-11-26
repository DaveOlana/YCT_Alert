# 19 — Technical and Operational Risk Register

**Scale:** Likelihood and impact are provisional qualitative planning judgments. Severity is not a measured incident rate.

| ID | Risk | Likelihood | Impact | Mitigation / gate |
|---|---|---|---|---|
| K01 | Users mistake receipt for dispatched help | Medium | Critical | Explicit receipt wording, verified external contacts, real-user usability review |
| K02 | False malicious public report | High | High | Mandatory admin activation; no count-based auto-approval |
| K03 | Unstaffed admin queue | High unless staffed | Critical | No operational claims; documented monitoring/on-call plan before launch |
| K04 | Free-tier cold start/outage | High depending provider | High | Dedicated availability review, manual contacts, monitoring and no guarantees |
| K05 | Wrong person/incident exposed by detailed location | Medium | High | Safe summaries, location generalization and editorial approval |
| K06 | Matching incorrectly merges separate events | Medium | High | Candidate confidence/ambiguity, manual split, raw-report preservation |
| K07 | Concurrency creates duplicate/missing report | Medium | High | DB unique constraints, transactions, race tests |
| K08 | Exposed hardcoded admin password | High if proposed original design followed | Critical | Secure bootstrap; rotated non-chat secret; secret scan |
| K09 | Student admin remains authorized after removal | Medium | High | Centralized revocation, short sessions, negative tests |
| K10 | Map route engine inadvertently changed | Medium | High | Strict code boundary, isolated incident module, legacy tests |
| K11 | Geospatial lon/lat mismatch | Medium | High | RFC 7946 contract tests, typed adapters |
| K12 | YCT Map dependency blocks intake | Medium | High | Manual location, timeouts, independent DB |
| K13 | Agent task/contract drift | High in multi-agent work | Medium | Frozen OpenAPI, owner integration, worktrees and ADRs |
| K14 | Android succeeds in browser but fails on device | Medium | Medium | Capacitor build within first week, physical-device QA |
| K15 | Missing privacy retention and oversight | High until decided | High | Data minimization, policy approval before pilot |
| K16 | Incorrect assumption from partial Gemini audit | Medium | Medium | Attach full report and verify code before G3 |
| K17 | Unowned package ID/keystore jeopardizes app updates | Medium | High | Confirm ownership and backups before distribution |
| K18 | Unauthorized institutional branding or emergency claims | Medium | High | Independent-pilot wording and written campus approval |

## Escalation

Any critical safety, privacy, credential or public-alarm issue blocks advancement to real pilot. An unresolved risk is not closed because automated tests passed. Record owner, remediation plan, dates and evidence in the project issue tracker.
