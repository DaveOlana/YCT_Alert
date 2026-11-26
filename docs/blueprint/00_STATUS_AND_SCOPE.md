# 00 — Status, Scope and Evidence Legend

**Purpose:** Prevent agents from presenting aspirations as running software.

## Current versus proposed

| Item | Classification | Evidence / constraint |
|---|---|---|
| YCT Map exists as Django campus navigation website | AUDIT-REPORTED EXISTING | Gemini summary in `sources/GEMINI_AUDIT_SUMMARY_AS_SHARED.txt` |
| YCT Map uses MapLibre, OpenFreeMap, Django, Neon/PostgreSQL and Render | AUDIT-REPORTED EXISTING | Summary references source files, but full repository not provided |
| YCT Map `GET /api/locations/` returns published places as GeoJSON | AUDIT-REPORTED EXISTING | Exact property names and empty/degraded responses require live repository inspection |
| Primary place IDs are UUIDv4, map models hold geographic coordinates | AUDIT-REPORTED EXISTING | Confirm exact model scope and archived-record semantics |
| Django 265 + JS 162 tests pass | AGENT-REPORTED TEST RESULT | This package did not execute these tests |
| YCT Alert standalone backend, DB, admins, Android, web | AGREED DESIGN DIRECTION | No Alert application exists in supplied materials |
| Incident intake, duplicate matching, moderation and public active feed | AGREED PRODUCT CONCEPT | Schemas, algorithms and exact thresholds not yet approved |
| Permanent protected super-admin and assignable student admins | OWNER CONFIRMED | Auth implementation proposal in docs 08–09 |
| Security-head transition someday | FUTURE POSSIBILITY | Requires formal authorization/ownership transfer process |
| New Map incident layer and public reporting link | PROPOSED CHANGE | Not currently present in Map audit summary |
| Alert dispatch/responder dashboard, 24/7 operation | NOT APPROVED / OUT OF V1 | Audit diagram suggests dispatch; do not misread as agreed functionality |

## Authority order when information conflicts

1. Written owner decisions and legal/operational requirements documented in the current change request.
2. Approved `PRODUCT_REQUIREMENTS`, RBAC and incident rules (once signed off).
3. Current source code and tests for **claims about what exists** (not what should exist).
4. Detailed full repository audit once furnished and checked.
5. Pasted audit summary (this package's source).
6. Older context brief (reference only).
7. Agent recommendations and general documentation.

Do not automatically resolve a conflict by modifying the working product. Record it in `18_OPEN_QUESTIONS.md` and request a decision at a gate.

## V1 includes

- Public web + Android incident report flow without public accounts.
- Optional geolocation; manual incident positioning/description always usable.
- Server-side receipt acknowledgements and idempotent retries.
- IncidentReport/Incident separation and candidate duplicate association.
- Pending queue, super-admin and assigned admin RBAC, audited moderation, reversible false merges.
- Active incidents public read-only feed and minimal Map marker integration when authorized.
- Standalone web admin dashboard and failure isolation.

## V1 explicitly excludes

- 24/7 staffed operations or guaranteed dispatch/response.
- Emergency-aware A* route avoidance.
- Reporter background tracking; user identity verification or compulsory registration.
- Cross-product SSO, shared tables, direct cross-DB joins, shared auth secrets.
- Auto-approval because of repeated reports.
- iOS launch (only preserve portable frontend design).
- Rich attachments, social feed, AI triage/scoring or responder location tracking unless re-scoped.

## Project phases

**Design baseline → synthetic vertical slice → full reporting/moderation pilot → Map integration → controlled campus pilot → operational feasibility review.** Each has an explicit pass/fail gate.
