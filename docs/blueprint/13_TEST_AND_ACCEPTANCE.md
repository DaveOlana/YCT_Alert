# 13 — Test Strategy and Acceptance Matrix

## Testing layers

1. **Schema/unit:** input validation, coordinate transformations, taxonomy, status machine, idempotency matching, audit actions.
2. **Database integration:** migrations, isolation, transactions, race conditions, role grants/revokes, test receipts.
3. **API contract:** OpenAPI request and response shapes, error codes, no secret/PII fields, GeoJSON validity.
4. **Public browser e2e:** anonymous flow, GPS-denied/manual location, slow internet, accessible errors.
5. **Android device:** real Capacitor app, permissions, app background/foreground, install/upgrade, low-memory and connectivity.
6. **YCT Map integration:** mocked feed first, actual staging endpoints later; Map navigation tests unchanged.
7. **Operational pilot:** simulated incidents in isolated test environment, admin response and outage communication drills.

## Mandatory scenario matrix

| ID | Scenario | Expected result | Evidence |
|---|---|---|---|
| T01 | Anonymous valid report | 202 + unique receipt; saved report | API + DB test |
| T02 | Three taps/retries same payload+key | Exactly one report, same receipt | Concurrent integration |
| T03 | Same key, different payload | 409; neither mutation replaces first | API integration |
| T04 | Three separate similar reports | Reports preserved; candidate matching; no auto ACTIVE | DB/workflow test |
| T05 | Two concurrent similar reports | Consistent linking or manual-review state; no lost reports | Race test |
| T06 | Deny GPS permission | Manual form stays functional | Android & browser |
| T07 | Map geography endpoint fails | Alert report accepted without Map | Integration/e2e |
| T08 | Alert feed fails | Map map/search/routes still function; stale/unavailable status | Map JS tests |
| T09 | Admin activates without permission | Forbidden, no DB state mutation | API authz |
| T10 | Admin revocation | Existing privileged session loses authority promptly | Auth integration |
| T11 | Wrong transition ACTIVE→PENDING | 409/422; audited/handled policy response | State machine |
| T12 | No public-safe location | No fake pin placed at centroid | Feed/API/UI |
| T13 | Public feed vs private report | Zero reporter contact/raw text leaked | Contract/static scan |
| T14 | Resolved after display | Removed from successful next ACTIVE feed refresh | Integration |
| T15 | Network drops after POST | No premature success; same-key resolution | Fault injection |
| T16 | Background app mid-submit | No duplicate or false `RECEIVED` state | Real Android |
| T17 | Simulated fire report | Test-only data never appears in production feed | Environment test |
| T18 | GeoJSON lon/lat swap attempt | Validation/unit fixtures catch mistake | Unit/contract |
| T19 | Wrong category or oversized body | Controlled validation error | API |
| T20 | Protected super-admin deletion by assigned admin | Denied | RBAC |
| T21 | Test database isolated from production | No production secrets or records reachable in tests | Env audit |
| T22 | App offline from start | No fake reporting success; verified external call-help option | Browser/Android |

## Concrete acceptance gates

**G0 Architecture:** approved scope, stack ADR, data map, role matrix, source-audit gaps tracked.

**G1 Vertical slice:** browser+physical Android generate a synthetic report → test API+DB → admin review → isolated test feed; idempotency and manual-location fallback pass.

**G2 Core MVP:** full incident states, role assignment/revocation, duplicate review, secrets and privacy checks, no fake response messaging; normal integration tests pass.

**G3 Map connection:** full Map audit and endpoint-shape verification complete, additive adapter tested, legacy Map tests rerun, no A*/GPS edits.

**G4 Controlled pilot:** real device/browser UX, failure drills, secure deployment, backups, privacy retention, verified emergency contacts and authorized people on an agreed schedule. Without operational sign-off, limit to synthetic test users.

**G5 Distribution:** signing-key custody, app ID, build reproducibility, release note, regression test, crash/error monitoring, access/review of developer account.

## Reporting format

Agent must report `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN` per suite. Never report **all tests passed** if DB/network/device suites were blocked. Include count, command, environment, duration and relevant redacted logs. Manual screen inspection needs actual device/browser evidence, not CSS analysis alone.

## Map regression requirements

Before and after integration, run existing Django and JS tests. Preserve baseline reported count **265 Django / 162 JS** only as reference, not a required exact future count; new tests should increase totals. Confirm routes, GPS, search, editors and path verification are unaffected in real smoke tests.
