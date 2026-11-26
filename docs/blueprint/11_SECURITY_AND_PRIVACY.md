# 11 — Minimum Security and Privacy Controls

**Principle:** V1 should be lightweight but cannot be careless. Anonymous reporting, privileged moderation, and sensitive incident locations create meaningful misuse/privacy risks.

## Priority controls

| Control | Minimum requirement | Verification |
|---|---|---|
| Anonymous rate limitation | Conservative IP/network and aggregate limits with accessibility-friendly abuse handling; don't block legitimate emergency reports blindly | Stress/abuse test and review logs |
| Idempotency | Atomic uniqueness and payload conflict detection | Race and retry tests |
| Input validation | Category allowlist, length, coordinate range, UTF-8 sanitation, request size limits | Fuzzed invalid payload tests |
| Admin auth | Hashed passwords, secure sessions, brute-force controls and privilege checks on API | Authz negative tests |
| Protected super-admin | Password via approved bootstrap secret; never hardcoded | Code/secret scan, fresh bootstrap test |
| RBAC | Role assignments time-scoped, revoked in server authorization layer | Revocation immediate-effect test |
| Audit | State change, grants/revokes, merge/split, login failures, request IDs | Data and privacy review |
| Public feed | Explicit safe field allowlist; sensitive coordinates generalized or omitted | Snapshot contract test |
| Network | HTTPS/TLS; appropriate CORS/CSRF; no public DB port | Deployment review |
| Separation | Independent Map/Alert data and secrets | Integration test |
| Ops | Backups, restoration rehearsal, monitoring and incident disable switch | Pilot gate |

## Privacy-by-design choices

- Distinguish *reporter current location* from *incident location*. Only collect the latter unless the user knowingly elects to use device GPS as an incident reference.
- Do not require reporter name, matric number, telephone, email, tracking cookie or persistent device fingerprint for public submissions.
- **No raw reporter text in public feed.** Moderators produce a safe summary. Avoid publishing identifiable medical/security/victim locations.
- Keep private raw submissions accessible only to assigned authorized admins, with access logging and retention limits.
- Do not log full payloads, passwords, session tokens, location history or reporter contact data.
- Optionally accept contact info only after purpose/retention/privacy notice approval; it is **not required in V1**.
- No unreviewed photo attachments in V1. Photographs introduce victim privacy, metadata and moderation burdens.

## Retention and deletion decision

Before campus pilot choose an authorized retention duration for raw reports, admin audit, resolved incidents, receipts and backups, including legal obligations in Nigeria. `TBD` is not permission to keep data forever. Write a disclosure/notice and deletion policy, including how archived incidents are treated and how safety audit obligations interact with privacy requests.

## Threat scenarios and mitigations

| Risk | Mitigation |
|---|---|
| Malicious flood of anonymous reports | Layered throttling, review queue, safe alerting, nonautomatic activation |
| Credential stuffing or student privilege escalation | Secure hash, login throttling, optional MFA for real pilot, server RBAC |
| Public leak of contact or raw medical detail | Published-field allowlist; admin-authenticated raw endpoint |
| False exact location or coordinate swap | Validation, manual triage, test coverage; no fabricated point |
| Lost admin phone/session | Revocation, expiry, recovery, session invalidation |
| Supply chain or bad plugin | Pinned versions, dependency review, limited permission requests |
| Malicious/synthetic test data on production map | Separate environments and explicit test-data guardrails |
| Compromised signing key | Restricted storage/ownership, recovery plan, no repository copy |

## Baseline review references

Use current OWASP ASVS and mobile application security guidance for testable baseline controls. Review architecture against Nigeria Data Protection Act/associated guidance with competent local advice prior to real personal-data processing; do not claim legal compliance purely from these design notes.

## Security completion evidence

Produce threat review, RBAC matrix passing tests, privileged token revocation test, data-flow map, secret scan, CSRF/origin tests if cookie-based, and redacted logs/screen captures. A passing unit suite without these is not a security sign-off.
