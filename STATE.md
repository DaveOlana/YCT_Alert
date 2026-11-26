# STATE — YCT Alert Active Development Ledger

**Current Status:** Ready for Owner Acceptance Review (Pre-G3.5 Hardening & Integration Readiness Completed)  
**Current Phase:** Phase P3 — YCT Map & YCT Alert Integration Readiness  
**Current Ticket:** Pre-G3.5 Hardening, Immediate Publication & Integration Readiness (Completed)  
**Last Completed Gate:** Gate G3.4 (MapLibre Public Map Overlay, Amber Halo & Incident Details Integration)  
**Target Delivery Gate:** Gate G3.5 (Full End-to-End Local Integration Testing)  

---

## 1. Active Milestone & Sprint Backlog

| Ticket ID | Description | Status | Scope Boundaries |
|---|---|:---:|---|
| **S1** | Workspace Scaffolding, Tooling & Contracts | **COMPLETED** | Scaffolding, TypeScript, ESLint, Prettier, Contracts, .env.example, Test DB safeguards, Capacitor 8 alignment |
| **S2** | Public UI & Android Capacitor Shell | **COMPLETED** | Accessible single-page report form, 5 categories, 3-layer location fallback, 5 MiB photo boundary, honeypot, local preview screen (zero transmission), Capacitor 8 Android container sync |
| **S3** | Intake & Idempotency Vertical Slice | **COMPLETED** | Dedicated postgres instance (127.0.0.1:55433), node-pg-migrate@9.0.0, POST /reports, Idempotency-Key, CSPRNG receipt, 7-day AES-GCM replay, client submission |
| **S4** | Admin Minimal Review Slice | **COMPLETED** | ALERTadmin Argon2id bootstrap, review queue, incident inspection, activate/resolve/reject actions with mandatory audit logs, public feed |
| **S5** | Vertical Slice Verification & Localhost Handoff | **COMPLETED** | Automated tests (107/107 passing), retention purge (D-16), brute-force rate limiting, offline resilience, APK compilation, localhost handoff |
| **G3.4** | MapLibre Incident Overlay & Amber Halo Display | **COMPLETED** | YCT Map integration: GeoJSON feed polling, halo/point layer styling, selection interaction, detail slide-out panel, style reload restoration |
| **Pre-G3.5** | Hardening, Immediate Publication & Verification Contract | **COMPLETED** | Immediate unverified publication, verification_status contract, coordinate consensus & admin override, PII detection, receipt reference #REF-XXXXXXXX, 30-day retention & reactivation, local non-test testing override |

---

## 2. Gate Status

* **Gate G0 (Foundation):** **PASSED & APPROVED** (Documented in `PHASE_0.2_DECISIONS_RECONCILIATION.md`).
* **Gate G1 (Synthetic Slice):** **ACCEPTED PROVISIONALLY BY OWNER** (Physical-device submission, persistence, authentication, detail modal, and claim lifecycle verified).
* **Gate G2 (Core MVP Engine):** **IN PROGRESS**
  - **Ticket G2.1:** Spatial & Temporal Candidate Matching Engine — **COMPLETED** (15 tests passing, 50m / 15min / place fallback / advisory locking / SUGGESTED links).
  - **Ticket G2.2:** Administrator Role Management & Immediate Session Revocation — **COMPLETED** (11 tests passing, SUPERADMIN endpoints, ALERTadmin multi-layer protection, instant session revocation, immutable governance audit).
  - **Ticket G2.3:** Safe Public-Summary Governance & Report Management — **COMPLETED** (18 tests passing, summary revision with PII guardrail, report unlinking/split, manual report merge, empty-source handling, deterministic lock ordering, version conflict 409).
  - **Ticket G2.4:** Admin Portal UI Extensions — **COMPLETED** (24 tests passing in apps/admin, administrator governance page, moderator creation/revocation/reset, report association badges, report unlinking/split dialog, manual merge dialog, safe summary revision dialog).
  - **Ticket G2.5:** Engine-Level Integrity, Concurrency & Gate G2 Acceptance Verification — PENDING.
* **Gate G3 (YCT Map Connection):** COMPLETED & VERIFIED
  - **Gate G3.1:** Upstream Geography Ingestion & Persistent Snapshot Cache — **COMPLETED & ACCEPTED** (Distributed lease fencing, 15-minute background ingestion, schema validation, 75s/45s bounded timeouts, 2-hour stale boundary).
  - **Gate G3.2:** Cached Campus Places API & Reporter Integration — **COMPLETED & ACCEPTED** (G3.2A Cached places API & readiness probe; G3.2B Frontend live search client with debounced 300ms abortable queries, alias matching, and unverified pill; G3.2C Decoupled coordinate provenance with 8 transition rules and 6-tier submission source derivation; Supplementary test hardening closed all 4 edge-case boundary assertions across 236 monorepo tests).
  - **Gate G3.3:** Public Incident GeoJSON Feed & Details API — **COMPLETED & ACCEPTED** (Unified public eligibility CTE excluding test-only reports, coordinate provenance strictly from legitimate non-test reports, independent lateral descriptive & coordinate selections, RFC 7946 GeoJSON feed, public details endpoint, RFC 9111 HTTP caching headers, rate limiting at 300 req/60s, 20 dedicated integration tests).
  - **Gate G3.4:** MapLibre Public Map Overlay & Amber Halo Display — **COMPLETED & ACCEPTED** (MapLibre incident layer injection, amber pulsating halo, incident details slide-out panel, contract alignment with 5 core categories, 188 JS unit tests passing).
  - **Pre-G3.5 Hardening & Immediate Publication:** **COMPLETED & VERIFIED** (Immediate unverified publication of eligible reports, `verification_status: 'UNVERIFIED' | 'VERIFIED'`, medoid coordinate consensus with 50m threshold, auditable admin coordinate override `COORDINATE_OVERRIDE`, reporter-side + server-side PII guardrails, `#REF-XXXXXXXX` human-readable receipts, 30-day retention & reactivation rules, fail-closed `ALLOW_LOCAL_NON_TEST_REPORTS`, Fastify pool shutdown, and MapLibre `style.load` reload restoration; 553/553 total tests passing across both codebases).
* **Gate G3.5 (Full End-to-End Local Integration Testing):** READY FOR EXECUTION (Awaiting Project Owner Authorization).
* **Gate G4 (Controlled Campus Pilot):** PENDING (Requires institutional signoff & verified emergency contacts).
* **Gate G5 (Signed Distribution):** PENDING (Requires keystore ownership & store accounts).

---

## 3. Ticket S1 Completed Evidence

1. **Monorepo Architecture:** npm workspaces configured across `packages/*`, `services/*`, `apps/*`.
2. **Capacitor 8 Alignment:** `@capacitor/android`, `@capacitor/cli`, and `@capacitor/core` upgraded to `^8.6.0` in `apps/public`; builds cleanly (`vite build` passing).
3. **Database Safeguard Verification:** `services/api/tests/database-safeguard.test.ts` unit test suite passes with 7/7 assertions, exit code 0; blocks all forbidden databases (`yct_postgres`, `yctmap`, `yct_map`).
4. **Contract Parity & Tests:** `packages/contracts/tests/contracts.test.ts` passes with 13/13 assertions, exit code 0; validates OpenAPI 3.1 schema and Zod types across taxonomy, 3-layer location, bearer receipts, incident transitions, safe locations, and errors.
5. **Quality Gates:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `npm test` all exit with code 0.

---

## 4. Ticket S2 Completed Evidence

1. **Accessible Single-Page Public UI:** Implemented responsive React 19 + TypeScript + Tailwind CSS incident reporting form (`apps/public/src/App.tsx`) with accessible native radio inputs, live character counters (5–1000 chars), high-contrast focus rings, and screen-reader announcements (`aria-live`, `role="alert"`).
2. **5 Taxonomy Categories:** Full arrow-key keyboard navigation and accessible selection matching approved S1 categories (`FIRE_OR_SMOKE`, `MEDICAL_EMERGENCY`, `PHYSICAL_HAZARD`, `SECURITY_INCIDENT`, `OTHER_URGENT`).
3. **3-Layer Location Input & Refined Presentation:** Modal search against 15 synthetic sample places clearly marked `SAMPLE TEST DATA` with non-colliding UUIDs; single-touch GPS coordinates with human-friendly status ("Device location captured"), estimated accuracy ("±X metres"), approximate-area advisory, non-blocking contextual guidance for accuracy > 100m, accessible expandable disclosure for technical coordinates/timestamp, refresh/remove controls, and conditional landmark text fallback.
4. **5 MiB Photo Boundary & Lifecycle:** Client-side validation enforcing exact 5 MiB ($5,242,880\text{ bytes}$) boundary and JPEG/PNG/WebP format checks; instant thumbnail preview; complete object URL revocation upon replacement, removal, reset, or unmount.
5. **Strict Scope Compliance (Zero Network Transmission in S2):** Replaced premature submission with a local review screen (`"Preview only — no report has been submitted."`); human-readable location presentation with collapsed-by-default technical coordinates; zero network requests (`fetch`/`axios`), zero client idempotency keys, zero fake receipt tokens, zero database models/migrations, zero unverified emergency phone numbers.
6. **Capacitor 8 Android Shell & Native Compilation:** Android container initialized in `apps/public/android` with `com.yctalert.app`; `@capacitor/geolocation@8.2.4` integrated; `AndroidManifest.xml` configured with optional GPS/network features (`android:required="false"`), fine/coarse location permissions, and hardened security attributes (`allowBackup="false"`, `usesCleartextTraffic="false"`); web assets synchronized cleanly (`npx cap sync android`); compiled with JDK 21 (`assembleDebug` exit code 0) producing verified `app-debug.apk` (`4,941,932 bytes`).

---

## 5. Ticket S3 Completed Evidence

1. **Dedicated PostgreSQL Instance Isolation:**
   - Container `yct-alert-postgres` (`postgres:16-alpine`) bound strictly to `127.0.0.1:55433` with dedicated volume `yct_alert_pgdata`.
   - Host ports 5432 (`yct_postgres`) and 55432 (`backend-experiment-postgres`) strictly isolated and untouched.
   - Dedicated databases: `yct_alert_dev` (owned by `alert_dev_user`) and `yct_alert_test` (owned by `alert_test_user`).
   - Cross-database `CONNECT` privileges explicitly revoked from `PUBLIC` and across user roles, enforcing physical permission boundaries.

2. **Destination-Aware Database Safeguards (`services/api/src/config.ts`):**
   - Validates destination host, port, and database name.
   - Forbids targeting local ports 5432 or 55432 and forbidden names (`yct_postgres`, `yctmap`, `yct_map`).
   - Enforces port 55433 and loopback binding (`127.0.0.1`/`localhost`) in development and test.
   - Production fail-closed checks reject localhost URLs, dev placeholder secrets, and default credentials.

3. **Database Migration Tooling (`node-pg-migrate@9.0.0`):**
   - Transactional migration `1730940000000_intake-schema.cjs` applied cleanly to both `yct_alert_dev` and `yct_alert_test`.
   - Provisions `incident_reports`, `incidents`, `incident_report_links`, and `idempotency_receipts`.
   - Safeguard-wrapped migration runner `scripts/migrate.ts` with lock protection.

4. **Cryptographic Receipt & Authenticated Idempotency Engine:**
   - Client UUIDv4 `Idempotency-Key` header validation.
   - Transaction-level PostgreSQL advisory locking: `pg_advisory_xact_lock(hashtext('PUBLIC_REPORT:' || key_hash))` serializing concurrent requests.
   - 256-bit CSPRNG receipt tokens (`tok_<base64url>`) with SHA-256 one-way hashing for database storage.
   - Dual-tier idempotency lifecycle:
     - 7-day replay window with AES-256-GCM encrypted cached responses bound to AAD (`PUBLIC_REPORT:key_hash`).
     - Duplicate protection retained for the full lifecycle of the associated report, cascading on report deletion.
     - Conflicting payloads with reused keys rejected with `409 IDEMPOTENCY_KEY_REUSED`.
     - Expired replay window requests rejected with `409 IDEMPOTENCY_REPLAY_EXPIRED` (preventing duplicate creation).

5. **Fastify API Routes & Rate Limiting (`services/api/src/app.ts`):**
   - Registered `@fastify/rate-limit` with configurable limits (`10` submissions per `15` minutes per IP in dev).
   - Honeypot check on `website_url` rejecting automated bot submissions.
   - `POST /api/v1/reports`: returns 202 with `receipt_id`, `receipt_token`, and `delivery_status: RECEIVED`.
   - `GET /api/v1/reports/receipts/:receipt_id`: Bearer token authentication with constant-time verification (`crypto.timingSafeEqual`) and lifecycle status mapping (`RECEIVED`, `UNDER_REVIEW`, `PUBLISHED`, `RESOLVED`, `REJECTED`).

6. **Public Client Integration (`apps/public`):**
   - `services/reportSubmissionService.ts`: real API client with UUIDv4 idempotency keys, network timeout handling, and qualified network-uncertain retry state (`NETWORK_UNCERTAIN`).
   - Photo attachment notice modal: explains photo binary upload is deferred to S3.1, requiring explicit user confirmation before submitting without an attached photo.
   - `ReceiptScreen.tsx`: honest non-emergency preview disclaimer banner, receipt ID display, masked bearer token with reveal toggle, clipboard copy action, `.txt` download action, memory-only privacy notice, and live status lookup.
   - Android debug cleartext configuration: `network_security_config.xml` permitting cleartext to `localhost`, `127.0.0.1`, and `10.0.2.2` only in debug builds.

---

## 6. Ticket S4 Completed Evidence

1. **Argon2id Super-Administrator CLI Bootstrap (`services/api/scripts/bootstrap-admin.ts`):**
   - Provisioned username locked strictly to `ALERTadmin` with `SUPER_ADMIN` role.
   - Memory-hard Argon2id key derivation ($m=65536, t=3, p=4$) with CSPRNG salts.
   - Password policy enforcing $\ge 12$ characters and uppercase, lowercase, number, and special character diversity.
   - Password rotation flag (`--rotate-password`) requiring explicit authorization.
   - Verified safeguarding against forbidden ports and target database boundaries.

2. **Secure Session Management & CSRF Defense:**
   - 256-bit CSPRNG session tokens stored as SHA-256 hashes in `admin_sessions`.
   - Fastify `@fastify/cookie` signed session cookie (`yct_admin_session`) with `httpOnly`, `sameSite: 'strict'`, and path `/api/v1/admin`.
   - Cryptographic CSRF token generation (`crypto.randomUUID()`) stored in session row and returned in login response body.
   - Dual-defense validation on state-changing endpoints: verified `X-CSRF-Token` header matches active session and `Origin` header matches approved admin web origins.
   - Session lifecycle controls: 30-minute sliding idle timeout, 12-hour absolute session ceiling, token rotation upon re-authentication, and explicit logout revocation.

3. **Administrative Review Queue & Inspection Portal (`apps/admin`):**
   - React 19 + TypeScript + Tailwind single-page administrative client (`apps/admin/src/App.tsx`).
   - Tabbed queue view with live breakdown counters: `All`, `Pending`, `Under Review`, `Active`, `Resolved`, `Rejected`.
   - Rich incident detail inspection modal displaying reporter coordinates, accuracy estimate, campus place name, raw landmark notes, honeypot/abuse status, and full chronological audit trail.

4. **Incident Lifecycle Actions with Mandatory Audit Trails:**
   - State-changing actions: `claim` (`PENDING` $\to$ `UNDER_REVIEW`), `activate` (`PENDING`/`UNDER_REVIEW` $\to$ `ACTIVE`), `resolve` (`ACTIVE` $\to$ `RESOLVED`), `reject` (`PENDING`/`UNDER_REVIEW` $\to$ `REJECTED`), and `retention-hold` toggling.
   - Atomic database transactions updating incident state, synchronizing public receipt delivery status, and inserting into `incident_audit_logs`.
   - Mandatory audit reason enforcement ($\ge 10$ characters) for activate, resolve, and reject actions.
   - Database-level immutability trigger `trg_incident_audit_logs_immutable` unconditionally preventing `UPDATE` and `DELETE` on audit records.

5. **Public GeoJSON Feed Filtering (`GET /api/v1/incidents/feed`):**
   - Returns RFC 7946 compliant GeoJSON FeatureCollection with `[longitude, latitude]` coordinate ordering.
   - Strict status filtering: only incidents with status `ACTIVE` and non-null coordinates are returned.
   - PII protection: reporter contact info, idempotency keys, and internal review notes are excluded from public feed features.

---

## 7. Ticket S5 Completed Evidence

1. **Retention Purge Implementation (Decision D-16):**
   - Migration `1731100000000_incident-purge-tracking.cjs` applied cleanly to `yct_alert_dev` and `yct_alert_test`, adding `purged_at TIMESTAMPTZ NULL` and partial index `idx_incidents_retention_purge`.
   - Concurrency-safe service function `purgeExpiredIncidents()` in `adminIncidentService.ts`:
     - Identifies `RESOLVED` and `REJECTED` incidents whose resolution/rejection timestamp is $\ge 30$ days old with `retention_hold = FALSE` and `purged_at IS NULL`.
     - Acquires exclusive row-level locks using `SELECT id FROM incidents ... FOR UPDATE SKIP LOCKED`.
     - Performs a post-lock recheck ensuring `retention_hold = FALSE` and `purged_at IS NULL`.
     - Cascades reporter deletion via `DELETE FROM incident_reports WHERE incident_id = $1` (which cascades to `idempotency_receipts` and `incident_report_links`).
     - Redacts parent incident fields: sets `summary = '[PURGED - RETENTION POLICY]'`, `latitude = NULL`, `longitude = NULL`, and sets `purged_at = CURRENT_TIMESTAMP`.
     - Audit trail immunity: `incident_audit_logs` are preserved unmodified, respecting the immutability trigger.
   - Manual superadmin trigger endpoint: `POST /api/v1/admin/purge-retention` (enforces `SUPER_ADMIN` role).
   - In-process background scheduler: runs every 24 hours with a 60-second initial startup delay, guarded by PostgreSQL advisory lock `pg_try_advisory_lock(hashtext('YCT_ALERT_RETENTION_PURGE_TASK'))`, disabled during test runs via `ENABLE_BACKGROUND_PURGE=false`.

2. **Automated Verification Suites (88 / 88 Tests Passing Across Monorepo):**
   - `services/api/tests/lifecycle-purge.test.ts`: 7/7 assertions verifying Active/Pending immunity, Retention hold immunity, 30-day resolved purge, 30-day rejected purge, concurrency recheck safety, and purge idempotency.
   - `services/api/tests/admin-login-ratelimit.test.ts`: Integration test verifying 5-attempt rate-limiting threshold returning 429 on the 6th attempt with `retry-after` header and recovery after window expiry.
   - `apps/public/tests/client-uncertainty-restart.test.ts`: 3 assertions verifying offline/airplane mode network failure handling without generating fake receipts, timeout abort handling, and memory-only privacy invariant (zero localStorage/sessionStorage persistence).

3. **Synthetic Campus Location Safeguards:**
   - Both `apps/public/src/components/report/LocationPicker.tsx` and `LocalReviewScreen.tsx` display a prominent visual badge: `SAMPLE TEST DATA — NOT LIVE MAP` when campus place fixtures are selected.

4. **Monorepo Quality Gates (Zero Failures):**
   - `npm test`: **122 / 122 tests passing** (`@yctalert/contracts`: 13, `@yctalert/api`: 66, `@yctalert/admin`: 11, `@yctalert/public`: 32).
   - `npm run typecheck`: **0 errors** across all workspaces.
   - `npm run lint`: **0 errors, 0 warnings** across all workspaces.
   - `npm run format:check`: **100% Prettier compliant**.
   - `npm run build`: Production builds succeeded for all packages (`contracts`, `api`, `admin`, `public`).

5. **Android Native Container Synchronization & Compilation:**
   - Synchronized web assets with native project: `npx cap sync android` in `apps/public`.
   - Verified Android compilation with JDK 21: `./gradlew assembleDebug` succeeded with exit code 0.
   - Generated debug APK: `apps/public/android/app/build/outputs/apk/debug/app-debug.apk` (`5,362,473 bytes`, compiled at 10:37:29).

6. **Targeted Physical-Device Acceptance Defect Corrections:**
   - **Android API Connectivity & Strict CORS:** Added exact Android WebView origin `https://localhost` to API CORS allowlist and environment defaults. Verified preflight handling (`OPTIONS`), state-changing report submissions (`POST`), receipt status lookup (`GET`), and rejection of unapproved origins. Maintained loopback-only binding (`127.0.0.1:4000`) with zero wildcard CORS or permissive proxy settings.
   - **Bounded Location Acquisition Engine:** Replaced fragile single-shot location in `locationService.ts` with user-initiated bounded acquisition:
     - Step 1: Attempts recent location fix via `getCurrentPosition`.
     - Step 2: On timeout or unavailable signal, transitions to temporary `watchPosition` bounded to ~20–25 seconds.
     - Step 3: Resolves with exact hardware accuracy (preserving broad accuracy > 100m without rejection).
     - Step 4: Clears watch and timers immediately upon success, timeout, cancellation, unmount, or terminal error.
     - Step 5: Serializes concurrent taps to prevent duplicate watches or watch leaks.
     - Step 6: Maps native Capacitor error codes (numeric 1, 2, 3 and string codes) before falling back to message parsing.
   - **Targeted Test Suites:** `services/api/tests/android-connectivity-cors.test.ts` (7/7 passed), `apps/public/tests/location-service.test.ts` (12/12 passed).

7. **Targeted Admin Incident Detail Rendering Defect Correction & Coordinate Serialization:**
   - **Confirmed Defect & Root Cause:** In `apps/admin/src/components/moderation/IncidentDetailModal.tsx`, opening the "Inspect & Moderate" view triggered `Uncaught TypeError: incident.display_lat.toFixed is not a function`. The PostgreSQL `node-pg` driver maps `NUMERIC(9, 6)` columns (`display_lat`, `display_lon`, `incident_lat`, `incident_lon`) to JavaScript strings (e.g. `'6.519818'`) to protect against 64-bit floating-point precision loss. When the frontend assumed `number`, runtime invocations of `.toFixed()` threw an unhandled exception that broke React component rendering.
   - **API Boundary Normalization (`services/api/src/services/adminIncidentService.ts`):** Introduced `parseCoordinate(val: unknown): number | null`. Coerces numeric strings and valid numbers into finite JavaScript numbers, maps `null`/`undefined`/empty strings/`NaN` to `null`, and strictly preserves valid `0` without converting missing coordinates into zero. Applied across `getQueue` and `getIncidentDetails` for incident summary coordinates and linked report coordinates.
   - **Defensive Admin Client Presentation (`apps/admin/src/utils/coordinates.ts` & `IncidentDetailModal.tsx`):**
     - Authored `safeCoordinate()` and `formatCoordinates(lat, lon, precision = 6): string | null` utilities.
     - Handled valid numbers, numeric strings from wire payloads, null/undefined coordinates, and malformed inputs.
     - Replaced fragile direct `.toFixed()` calls in `IncidentDetailModal.tsx` with `formatCoordinates(...)` with an accessible italic fallback: `Location coordinates not available`.
     - Preserved existing sample place badges and manual landmark descriptions without disruption.
     - Updated TypeScript models in `apps/admin/src/types/admin.ts` to `number | string | null` for defensive typing.
   - **Auth Probe Investigation (`GET /api/v1/admin/auth/me`):** Investigated browser console `401 Unauthorized` log. Confirmed this is the standard unauthenticated probe emitted by React `App.tsx` on initial mount to check for an existing session cookie. Without credentials, Fastify's `authenticateAdmin` hook rejects with `401 Unauthorized` (`Administrative authentication is required.`). Once authenticated with a valid session cookie, `GET /api/v1/admin/auth/me` returns `200 OK` with the authenticated `AdminUser` payload.
   - **Automated Verification:**
     - `apps/admin/tests/coordinates.test.ts`: 5/5 assertions passing.
     - `services/api/tests/incident-detail-serialization.test.ts`: 4/4 assertions passing (boundary units, API wire response verification, null-coordinate safety, and session probe 401/200 verification).
     - Full monorepo automated test suite: **118 / 118 tests passing**.


8. **Targeted Incident Claim Lifecycle & State Transition Correction:**
   - **Confirmed Defect & Root Cause:** In `services/api/src/services/adminIncidentService.ts`, `claimIncident()` previously updated `assigned_admin_id` and `triaged_at` without updating `status = 'UNDER_REVIEW'`, leaving the incident in `PENDING` status. Furthermore, the audit log insert had hardcoded `'PENDING', 'PENDING'` for `previous_status, new_status`. In addition, the PostgreSQL table constraint `chk_incident_status` originally only allowed `('PENDING', 'ACTIVE', 'RESOLVED', 'REJECTED')`.
   - **Database Migration (`1731200000000_incident-under-review-status.cjs`):**
     - Altered check constraint `chk_incident_status` on `incidents` to permit `('PENDING', 'UNDER_REVIEW', 'ACTIVE', 'RESOLVED', 'REJECTED')`.
     - Retroactively transitioned already claimed pending incidents in `yct_alert_dev` to `UNDER_REVIEW`, preserving their report and audit history.
   - **Contracts (`packages/contracts`):**
     - Added `'UNDER_REVIEW'` to `INCIDENT_STATUSES` in `incidents.ts`.
     - Updated OpenAPI 3.1 specification moderation queue parameter enum.
   - **Backend API & Lifecycle Service (`adminIncidentService.ts` & `reportService.ts`):**
     - `claimIncident()`: Atomically updates `status = 'UNDER_REVIEW'`, sets `assigned_admin_id` and `triaged_at`, and writes an immutable audit record recording `PENDING → UNDER_REVIEW`.
     - `activateIncident()`: Permits activation from both `PENDING` and `UNDER_REVIEW` (as well as `ACTIVE`).
     - `rejectIncident()`: Permits rejection from both `PENDING` and `UNDER_REVIEW`, recording accurate `previous_status → REJECTED`.
     - `getQueue()`: Added `under_review` breakdown counter to queue response, ensuring queue counters and status filter reflect `UNDER_REVIEW` incidents accurately.
     - `reportService.ts`: Explicitly maps `row.incident_status === 'UNDER_REVIEW'` to receipt `delivery_status: 'UNDER_REVIEW'` with informative message (`Your report is actively under review by campus safety moderators.`).
   - **Admin Portal UI Refinement (`apps/admin`):**
     - Updated `IncidentStatusFilter` and `IncidentSummary` types to include `'UNDER_REVIEW'`.
     - Added dedicated `Under Review` tab with live count badge in `ReviewQueue.tsx`.
     - Added indigo badge and pulsing dot indicator for `UNDER_REVIEW` cards in `IncidentCard.tsx`.
     - Updated `IncidentDetailModal.tsx` action button guards to permit `Activate & Broadcast` and `Reject Report` when in `UNDER_REVIEW` state, while hiding `Claim Triage` once claimed.
   - **Automated Verification:**
     - `services/api/tests/admin-claim-lifecycle.test.ts`: Regression suite verifying claim assignment, `PENDING → UNDER_REVIEW` transition, immutable audit logging, receipt status synchronization, tab queue filtering, re-claim prevention, and transaction rollback on failure.
     - `services/api/tests/admin-lifecycle-and-feed.test.ts`: Verified claim assertions, queue breakdown, and receipt status synchronization.
     - Full monorepo automated test suite: **122 / 122 tests passing (100%)**.

---

## 9. Ticket G2.1 Completed Evidence (Spatial & Temporal Candidate Matching Engine)

1. **Candidate Matching Core Engine (`services/api/src/services/matchingService.ts`):**
   - Exact spherical Haversine formula implementing $\leq 50$ metres distance threshold.
   - Temporal matching window: within 15 minutes of the candidate incident's `last_reported_at`.
   - Exact incident category requirement (`category_code` match).
   - Micro-location precedence: when coordinates are available on both reports, distance strictly determines geographic eligibility (shared place-ID does not override failed distance check).
   - Canonical place fallback: YCT Map `yct_map_place_id` matching utilized when micro-location coordinates are unavailable.
   - Ambiguity safeguarding: if more than 1 candidate matches within spatial-temporal thresholds, the system refuses to associate arbitrarily, spawning an independent `PENDING` incident.
2. **Transactional Concurrency & Safe Association (`services/api/src/services/reportService.ts`):**
   - Transaction-level category advisory locking (`MATCHING_LOCK:<category>`) preventing intake race conditions.
   - Candidate row-locking (`FOR UPDATE OF i`).
   - Generates reversible `SUGGESTED` link in `incident_report_links`.
   - Updates `report_count = report_count + 1` and `last_reported_at = NOW()`.
   - Preserves human moderation boundary: candidate association NEVER automatically activates an incident (`status` remains untouched).
   - Safe display coordinates: preserves initial display coordinates without silent drift from unverified subsequent reports.
3. **Automated Verification (`services/api/tests/candidate-matching.test.ts`):**
   - 15 comprehensive unit and integration tests covering spatial, temporal, category, place-ID fallback, ambiguity, advisory locking, and activation invariants.

---

## 10. Ticket G2.2 Completed Evidence (Administrator Role Management & Immediate Session Revocation)

1. **Database Architecture & Multi-Layer Invariants (`services/api/migrations/1731300000000_admin-governance-audit-and-protection.cjs`):**
   - Created append-only `admin_governance_audit_logs` table tracking administrative lifecycle actions (`MODERATOR_CREATED`, `MODERATOR_REVOKED`, `PASSWORD_RESET`, `ROLE_CHANGED`).
   - Immutability trigger `trg_admin_governance_audit_logs_immutable` prohibiting any SQL `UPDATE` or `DELETE` on governance audit logs.
   - Database engine trigger `trg_protect_bootstrap_superadmin` on `admin_users` permanently preventing `DELETE`, deactivation (`is_active = FALSE`), demotion (`role != 'SUPERADMIN'`), or renaming of `ALERTadmin`.
2. **Shared Contracts (`packages/contracts/src/adminUsers.ts`):**
   - `AdminRoleSchema` (`SUPERADMIN`, `MODERATOR`).
   - `AdminUserSummarySchema` and `ListAdminUsersResponseSchema` (strictly excluding password hashes and session tokens).
   - `CreateModeratorRequestSchema` (alphanumeric/underscore username, 3–32 chars, min 12 char password, optional audit reason).
   - `RevokeModeratorRequestSchema` (mandatory audit reason, 3–500 chars).
   - `ResetModeratorPasswordRequestSchema` (min 12 char password, optional audit reason).
3. **Service Logic (`services/api/src/services/adminUserService.ts`):**
   - Password policy validator: minimum 12 characters, uppercase, lowercase, number, and special character.
   - Argon2id password hashing ($m=65536, t=3, p=4$).
   - Advisory transaction lock `ADMIN_USER_PROVISION` serializing moderator provisioning and enforcing case-insensitive username uniqueness.
   - Explicit service-level protection preventing revocation or password reset of `ALERTadmin` via API.
   - Prevention of self-revocation.
   - Immediate session revocation: atomically setting `revoked_at = CURRENT_TIMESTAMP` for all active sessions in `admin_sessions` upon deactivation or password reset.
4. **API Endpoints & RBAC Protection (`services/api/src/app.ts`):**
   - `GET /api/v1/admin/users`: lists administrators (excluding password hashes and session tokens); SUPERADMIN only.
   - `POST /api/v1/admin/users`: creates moderator account; SUPERADMIN only; CSRF + Origin checked.
   - `POST /api/v1/admin/users/:id/revoke`: deactivates moderator and revokes all active sessions; SUPERADMIN only; CSRF + Origin checked.
   - `POST /api/v1/admin/users/:id/reset-password`: resets moderator credentials and revokes all active sessions; SUPERADMIN only; CSRF + Origin checked.
   - Ordinary moderators receive `403 FORBIDDEN` on all 4 endpoints.
5. **Automated Verification (`services/api/tests/admin-user-management.test.ts`):**
   - 11 comprehensive tests verifying list sanitization, creation with Argon2id, RBAC 403 enforcement, username validations, password strength policy, instant session revocation upon deactivation, instant session revocation upon password reset, ALERTadmin protection via API, PostgreSQL trigger engine-level protection against direct SQL mutation of ALERTadmin, and PostgreSQL trigger immutability of governance audit logs.
6. **Monorepo Quality & Verification Status:**
   - Full test suite: **148 / 148 tests passing across all workspaces** (Contracts: 13, API: 92, Admin: 11, Public: 32).
   - Typecheck: 0 errors (`tsc --noEmit` across all 4 workspaces).
   - Lint: 0 errors / 0 warnings (`eslint .`).
   - Format: 100% compliant (`prettier --check .`).
   - Build: Clean compilation across all workspaces (`packages/contracts`, `services/api`, `apps/admin`, `apps/public`).

---

## 11. Ticket G2.3 Completed Evidence (Safe Public-Summary Governance & Report Management)

1. **Database Migration (`services/api/migrations/1731400000000_summary-revision-and-report-governance-audit.cjs`):**
   - Altered check constraint `chk_audit_action` on `incident_audit_logs` to permit G2.3 moderation actions:
     `'SUMMARY_REVISED'`, `'REPORT_UNLINKED'`, `'REPORT_MERGED_OUT'`, `'REPORT_MERGED_IN'`, `'INCIDENT_CREATED_FROM_SPLIT'`.
   - Applied cleanly to both `yct_alert_dev` and `yct_alert_test`.
2. **Contracts & OpenAPI 3.1 (`packages/contracts`):**
   - Added Zod schemas: `ReviseIncidentSummaryRequestSchema`, `UnlinkReportRequestSchema`, and `MergeReportRequestSchema`.
   - Updated OpenAPI 3.1 specifications in `packages/contracts/src/openapi.ts` with new routes, parameters, request bodies, and component schemas.
   - Built and verified with 13/13 passing contracts tests.
3. **Server-Side PII Guardrail Service (`services/api/src/services/piiGuardrailService.ts`):**
   - Dedicated detection rules for Nigerian phone numbers (local `070...`, `080...`, `090...` and international `+234...`, `234...`, `00234...`), email addresses, and YABATECH matriculation numbers (`[FP]/(?:ND|HD|...)/...`).
   - Rejects prohibited identifiers without echoing detected PII in error messages or logs.
   - Verified with 5/5 dedicated positive and negative unit tests (`pii-guardrail.test.ts`).
4. **Backend Implementation (`services/api/src/services/adminIncidentService.ts` & `app.ts`):**
   - `PATCH /api/v1/admin/incidents/:id/summary`: Controlled revision of ACTIVE incidents, PII validation, optimistic concurrency (`expected_version` vs `row_version`), atomic `row_version` increment, immutable `SUMMARY_REVISED` audit log with previous/new summary metadata.
   - `POST /api/v1/admin/incidents/:id/reports/:reportId/unlink`: Detaches report, creates standalone PENDING incident with `CREATION` link, updates source incident report count and timestamps, transitions emptied source incident to `REJECTED`, records immutable audit entries on both incidents.
   - `POST /api/v1/admin/incidents/:id/merge-report`: Moves report association to target incident with match_method `'ADMIN'`, acquires locks in deterministic order to eliminate deadlock risk, verifies lifecycle state compatibility (rejects cross-status or terminal incident merges), updates report counts/versions, transitions emptied source incident to `REJECTED`, records immutable audit entries on both incidents.
5. **Automated Verification:**
   - Dedicated test suite `services/api/tests/safe-summary-and-report-management.test.ts` (13/13 passing).
   - Dedicated test suite `services/api/tests/pii-guardrail.test.ts` (5/5 passing).
   - Full monorepo test suite: **166 / 166 tests passing across all workspaces (100%)** (Contracts: 13, API: 110, Admin: 11, Public: 32).
   - Monorepo typecheck: 0 errors across all 4 workspaces (`npm run typecheck`).
   - Monorepo linter: 0 warnings, 0 errors (`npm run lint`).
   - Prettier formatting: 100% compliant (`npm run format:check`).
   - Monorepo build: Clean compilation across all 4 workspaces (`npm run build`).

---

## 12. Ticket G2.4 Completed Evidence (Admin Portal UI Extensions)

1. **Administrator Management Interface (`apps/admin/src/components/users/`):**
   - `UserManagementView.tsx`: Superadmin governance directory listing all administrator accounts with username, role badge (`SUPERADMIN` vs `MODERATOR`), status badge (`Active` vs `Revoked`), creation date, and last activity timestamp.
   - Strict Role Gate: UI hides and blocks access for non-superadmin users with prominent access denied feedback.
   - `CreateModeratorDialog.tsx`: Form for provisioning student moderators with client-side username validation (alphanumeric/underscore, 3–32 chars), strong password policy enforcement ($\ge 12$ chars, uppercase, lowercase, number, symbol), password confirmation check, and immediate credential clearing upon submission. Passwords are never logged or persisted in browser storage.
   - `RevokeModeratorDialog.tsx`: Controlled moderator deactivation workflow with explicit confirmation, identifying affected account, explaining immediate session invalidation, and requiring mandatory administrative reason ($\ge 3$ chars).
   - `ResetPasswordDialog.tsx`: Credential rotation workflow with password diversity validation, confirmation check, explanation of immediate session revocation, and immediate credential clearing.
   - Protected Invariants: `ALERTadmin` bootstrap account is visibly designated as a Protected System Identity with all revocation, demotion, and reset actions disabled. Current logged-in user is labeled `Current Session` with self-revocation blocked.

2. **Incident Detail & Report Association Display (`IncidentDetailModal.tsx`):**
   - Distinct association method badges for every linked report:
     - `CREATION`: "Initial Report" (emerald badge with sparkle icon).
     - `SUGGESTED`: "Suggested Match (Candidate Engine)" (amber badge with compass icon and tooltip clarifying provisional candidate corroboration, not an administrative merger).
     - `ADMIN`: "Manually Merged (Admin Action)" (blue badge with merge icon).
   - Preserves distinction between creation, automated candidate corroboration, and manual admin mergers without misrepresenting suggested links.

3. **Report Unlink / Incident Split Workflow (`UnlinkReportDialog.tsx`):**
   - Exposed alongside each linked report in non-terminal incidents (`PENDING`, `UNDER_REVIEW`, `ACTIVE`).
   - Displays targeted report snippet (receipt ID, category, description preview).
   - Explains detachment into a standalone `PENDING` incident while preserving the original report and audit trail.
   - Warns explicitly when unlinking the final report on an incident that the source incident will transition to `REJECTED`.
   - Requires mandatory administrative reason ($\ge 3$ chars) and submits current `row_version` as `expected_version`.
   - Handled HTTP 409 `VERSION_CONFLICT` without silent automatic retry, prompting administrator to review refreshed incident state.

4. **Manual Report Merge Workflow (`MergeReportDialog.tsx`):**
   - Destination incident selector fetching eligible candidates of compatible status (`adminIncidentService.getQueue({ status: currentIncident.status })`).
   - Automatically filters out current incident itself, terminal statuses (`RESOLVED`, `REJECTED`), and incompatible lifecycle statuses.
   - Displays destination candidate details (public ID, category, report count, summary snippet).
   - Warns explicitly when moving the final report on an incident that the source incident will transition to `REJECTED`.
   - Requires mandatory administrative reason ($\ge 3$ chars) and submits both target `expected_version` and source `source_expected_version`.
   - Handled HTTP 409 `VERSION_CONFLICT` cleanly without silent retry.

5. **Safe Public-Summary Editing Workflow (`ReviseSummaryDialog.tsx`):**
   - Available strictly for `ACTIVE` incidents in `IncidentDetailModal.tsx` via "Edit Public Summary".
   - Displays current summary, character counter (10–500 chars), and mandatory reason input.
   - Prominent warning regarding public visibility on the live GeoJSON feed and prohibition of PII.
   - Server-side PII guardrail feedback: handles `PROHIBITED_PII_DETECTED` gracefully without leaking or echoing sensitive inputs.
   - Submits current incident version as `expected_version` and handles 409 `VERSION_CONFLICT` without silent overwrite.

6. **Dashboard Navigation & View Synchronization (`AdminHeader.tsx` & `App.tsx`):**
   - Tabbed navigation in header: "Incident Queue" and "User Governance" (only visible to `SUPERADMIN`).
   - Responsive mobile navigation bar for superadmins on smaller viewports.
   - Live synchronization: queue counters, incident lists, and administrator tables refresh cleanly following state mutations.
   - Zero emojis used across all user interfaces, adhering strictly to design guidelines.

7. **Frontend Services & Types (`apps/admin`):**
   - `adminUserService.ts`: `listUsers()`, `createModerator()`, `revokeModerator()`, and `resetModeratorPassword()` using authenticated cookies and CSRF headers.
   - `adminIncidentService.ts`: extended with `reviseIncidentSummary()`, `unlinkReport()`, and `mergeReport()`.
   - `types/admin.ts`: updated with `IncidentLinkedReport` metadata (`match_method`, `linked_at`), `AdminUserRecord`, `ListAdminUsersResponse`, `UnlinkReportResponse`, `MergeReportResponse`, `ReviseSummaryResponse`, and `IncidentStatus`.

8. **Automated Verification & Monorepo Quality Gates:**
   - `apps/admin/tests/admin-ui-extensions.test.ts`: 13 comprehensive unit/integration tests covering user listing, moderator creation, revocation, password reset, summary revision, version conflict 409, unlink, merge, ALERTadmin invariant, self-revocation block, destination filtering, and match method representation.
   - `apps/admin` total test suite: **24 / 24 tests passing**.
   - Full monorepo test suite: **182 / 182 tests passing (100%)** (`@yctalert/contracts`: 13, `@yctalert/api`: 113, `@yctalert/admin`: 24, `@yctalert/public`: 32).
   - Monorepo typecheck: **0 errors** across all workspaces (`npm run typecheck`).
   - Monorepo linter: **0 warnings, 0 errors** across all workspaces (`npm run lint`).
   - Prettier formatting: **100% compliant** (`npm run format:check`).
   - Monorepo build: Clean compilation across all 4 workspaces (`npm run build`).

---

## 13. Gate G3.3 Completed Evidence (Public Incident GeoJSON Feed & Details API)

1. **Shared Eligibility Predicate (`PublicIncidentService`):**
   - Implemented unified CTE `eligible_incidents` enforcing identical public eligibility across both endpoints:
     - `incidents.status = 'ACTIVE'`
     - `incidents.purged_at IS NULL`
     - `incidents.safe_public_summary IS NOT NULL AND BTRIM(incidents.safe_public_summary, E' \t\r\n') <> ''`
     - `incidents.activated_at IS NOT NULL`
     - Non-test report linkage: `EXISTS (SELECT 1 FROM incident_report_links l JOIN incident_reports r ON r.id = l.report_id WHERE l.incident_id = i.id AND r.is_test = FALSE)`
   - Pure test incidents (`is_test = TRUE` solely) are strictly suppressed from both the active GeoJSON feed and the public details API.

2. **Strict Coordinate & Metadata Provenance:**
   - Public coordinates and place metadata are derived **exclusively** from legitimate non-test reports (`r.is_test = FALSE`).
   - `incidents.display_lat` and `incidents.display_lon` are **never used** for public output.
   - Independent lateral joins:
     - `primary_report`: selects `place_name_snapshot`, `landmark_description`, and `yct_map_place_id` ordered by `r.submitted_at ASC, r.id ASC` (deterministic tie-breaking).
     - `coord_report`: selects `incident_lat` and `incident_lon` bounded to $[-90, 90]$ and $[-180, 180]$ ordered by `r.submitted_at ASC, r.id ASC`.
   - Text-only incident handling:
     - Active eligible incidents without GPS reports resolve coordinates to `null`.
     - In the GeoJSON feed: filtered out (`resolved_lat IS NOT NULL AND resolved_lon IS NOT NULL`) in accordance with RFC 7946 Point geometry requirements.
     - In the Public Details API (`GET /api/v1/incidents/public/:public_id`): returned with `location.coordinates: null` and descriptive place metadata preserved.

3. **Timestamps, Property & Category Mapping:**
   - `published_at`: maps strictly to `incidents.activated_at`.
   - `reported_at`: maps strictly to `MIN(r.submitted_at)` across legitimate non-test reports (`r.is_test = FALSE`).
   - `updated_at`: maps to `incidents.updated_at`.
   - Category mapping: Preserves canonical taxonomy codes (`FIRE_OR_SMOKE`, `MEDICAL_EMERGENCY`, `PHYSICAL_HAZARD`, `SECURITY_INCIDENT`, `OTHER_URGENT`) emitted consistently with the existing contracts schema without abbreviation.
   - Feed geometry: RFC 7946 `[longitude, latitude]` (`[coord_report.incident_lon, coord_report.incident_lat]`).
   - Media: `public_photo_url: null` on feed; `photos: []` on details. Zero media endpoints created; zero database migrations.

4. **HTTP Endpoints & Infrastructure (`services/api/src/app.ts`):**
   - `GET /api/v1/incidents/active/` and `GET /api/v1/incidents/active`: returns RFC 7946 `FeatureCollection` with `Content-Type: application/geo+json`.
   - `GET /api/v1/incidents/public/:public_id`: returns public incident detail envelope (`{ incident: ... }`) or canonical 404 envelope (`INCIDENT_NOT_FOUND`).
   - Cache-Control header: `public, max-age=15, stale-while-revalidate=60, no-transform`.
   - Rate limiting: `@fastify/rate-limit` configured at 300 requests per 60 seconds per client IP, returning 429 `RATE_LIMIT_EXCEEDED` on violation.

5. **Contracts & OpenAPI (`packages/contracts`):**
   - `PublicIncidentFeaturePropertiesSchema`: updated to include `place_name`, `public_photo_url: null`.
   - `PublicIncidentDetailResponseSchema`: validates `incident` with `public_id`, `category`, `summary`, `status`, `location`, `timestamps`, `photos: []`.
   - OpenAPI 3.1 specification updated with `/api/v1/incidents/public/{public_id}`, removing deprecated `/api/v1/media/public/{token}`.

6. **Scope Compliance & Policy A:**
   - Zero modifications to YCT Map repository (`C:\Users\HP\Downloads\YCT_MAP_Repo`).
   - Zero database migrations created.
   - Policy A strictly enforced (zero autonomous git commits, pushes, merges, branch switches).

7. **Automated Verification:**
   - Dedicated integration test suite `services/api/tests/publicIncidentsApi.test.ts` (20/20 passing) covering all 19 mandatory test scenarios.
   - Regression compatibility verified in `services/api/tests/admin-lifecycle-and-feed.test.ts`.
   - Full monorepo test suite: **257 / 257 tests passing across all workspaces (100%)**:
     - `@yctalert/contracts`: 16/16 tests passing.
     - `@yctalert/api`: 164/164 tests passing.
     - `@yctalert/public`: 50/50 tests passing.
     - `@yctalert/admin`: 27/27 tests passing.
   - Monorepo typecheck: **0 errors** across all workspaces (`npm run typecheck`).
   - Monorepo build: Clean compilation across contracts (`npm run build --workspace=@yctalert/contracts`).


---

## 14. Gate G3.4 Completed Evidence (MapLibre Overlay & Amber Halo Display)

1. **YCT Map Client-Side Overlay Architecture (`static/yct_map/js/incidents.js`):**
   - Independent `IncidentOverlayController` managing MapLibre sources and layers (`incidents-halo`, `incidents-point`).
   - Periodic background polling (30s default) with RFC 7946 GeoJSON validation and graceful failure recovery preserving last-known-good state.
   - Layer positioning in `CAMPUS_INTERACTIVE_LAYER_ORDER` ensuring incident markers render above campus geometry/clusters and below active user navigation/GPS pins.
   - Distinct amber halo visual styling for active emergency incidents.

2. **Incident Details Slide-Out Panel (`static/yct_map/js/app.js` & `templates/map/index.html`):**
   - Dedicated slide-out drawer on desktop and bottom sheet on mobile (`#incident-details-panel`).
   - Displays category badge, verified/unverified state, safe summary, location details (place name, landmark description), relative timestamps, and incident photos safely.
   - Sanitized HTML rendering protecting against XSS injection.

3. **Taxonomy & Contract Alignment:**
   - Authoritative category mapping aligned with YCT Alert taxonomy: `FIRE_OR_SMOKE`, `MEDICAL_EMERGENCY`, `PHYSICAL_HAZARD`, `SECURITY_INCIDENT`, `OTHER_URGENT` with graceful fallback for unknown category codes.
   - Verified that YCT Map consumes public endpoints (`GET /api/v1/incidents/active/`, `GET /api/v1/incidents/public/:public_id`) exclusively over HTTP without database coupling.

4. **Automated Verification:**
   - 188 / 188 JS unit tests passing (`node --test tests/js/*.test.mjs`).
   - 99 / 99 Django backend tests passing (`manage.py test locations`).

---

## 15. Pre-G3.5 Hardening & Integration Readiness Completed Evidence

1. **Immediate Unverified Publication & Public Verification Contract:**
   - Database migration `1731600000000_pre-g3-5-hardening.cjs` applied cleanly to `yct_alert_dev` and `yct_alert_test`.
   - New eligible reports (valid description, valid non-test coordinates/place, non-abusive) publish immediately to the active GeoJSON feed as `UNVERIFIED` with `verification_status: 'UNVERIFIED'` and `activated_at: null`.
   - Internal lifecycle status remains `PENDING` until an administrator claims and activates the incident.
   - Admin activation transitions `verification_status` to `'VERIFIED'`, sets `activated_at`, and publishes the verified public summary.
   - Admin resolution or rejection immediately suppresses the incident from both the GeoJSON feed and public details endpoint.
   - YCT Map visual distinction: Distinct CSS classes (`.is-unverified` vs `.is-verified`), pulsing amber halo styling, panel status badge ("UNVERIFIED REPORT" vs "VERIFIED ALERT"), and verification notice.

2. **Coordinate Consensus Engine & Location Provenance:**
   - Implemented `coordinateConsensusService.ts` utilizing Haversine distance and medoid calculation with a 50-metre cluster threshold and deterministic tie-breaking.
   - Consensus coordinates (`consensus_lat`, `consensus_lon`, `consensus_confidence`) recomputed automatically on report intake, report unlinking/split, and manual report merge.
   - Auditable administrator coordinate override endpoint (`POST /api/v1/admin/incidents/:id/override-coordinates`):
     - Validates complete `[lat, lon]` pair within WGS84 and campus bounding bounds.
     - Logs immutable audit record with action `COORDINATE_OVERRIDE` capturing coordinates and mandatory reason.
     - Recomputes consensus or respects override in `ELIGIBLE_INCIDENTS_CTE` (`admin_override` -> `consensus` -> `coord_report` fallback).
     - Atomic query selection guarantees latitude and longitude always originate from the same source record.

3. **Reporter-Side & Server-Side Sensitive Information Protection:**
   - Pre-submission warning banner and real-time client-side PII detection in `apps/public/src/components/report/DescriptionInput.tsx`.
   - High-confidence regex patterns identifying Nigerian mobile numbers, email addresses, and student matriculation numbers.
   - Server-side guardrail in `services/api/src/services/piiGuardrailService.ts` and `reportService.ts`: rejects submissions with HTTP 400 `SENSITIVE_DATA_DETECTED` and `violation_type`.
   - Avoids false positives on campus building codes, room numbers, emergency service hotlines (112, 199, 767), and spatial descriptions.

4. **Report Receipt & Status Tracking Simplification:**
   - Generated human-readable reference number formatted as `#REF-XXXXXXXX` (alphanumeric uppercase CSPRNG) on report creation.
   - Prominently presented on `ReceiptScreen.tsx` with dedicated "Track My Report Status" action.
   - Token-based status lookups operate securely in application memory without leaking tokens into browser history, URL parameters, or server access logs.

5. **30-Day Retention Policy & Reactivation Rules:**
   - Resolved and rejected incidents disappear immediately from public feeds.
   - Retained in administrative database for 30 days post-resolution (`resolved_at`) or post-rejection (`rejected_at`).
   - Admin reactivation of resolved incidents within 30 days: clears `resolved_at` to `NULL`, resets purge countdown, logs `REACTIVATE` audit action, and immediately returns incident to the public map.
   - Reactivation after 30 days is rejected with HTTP 400 `CANNOT_REACTIVATE_EXPIRED`.
   - Reactivation of rejected incidents is strictly blocked.
   - Active incidents and records under administrative retention hold are permanently immune from automated purge.

6. **Local Testing Mechanism & Fail-Closed Safeguard:**
   - Environment variable `ALLOW_LOCAL_NON_TEST_REPORTS`:
     - When `true` in `NODE_ENV=development`, incoming reports are stored with `is_test = false`, enabling full end-to-end integration testing without manual DB edits.
     - Fail-closed safeguard in `services/api/src/config.ts`: if `ALLOW_LOCAL_NON_TEST_REPORTS === true` when `NODE_ENV === 'production'`, the server throws a critical exception and crashes on boot.
     - Pre-deployment cleanup checklist documented to ensure test flags are never deployed.

7. **Audit Hardening Implementations:**
   - Fastify graceful pool shutdown: registered pool closure in Fastify `onClose` hook, guarded with `if (config.NODE_ENV !== 'test')` to protect test sub-applications.
   - RFC 9111 HTTP caching headers: `Cache-Control: public, max-age=15, stale-while-revalidate=60, no-transform` applied on public active GeoJSON feed and details endpoints.
   - Geography synchronization verification: verified YCT Alert polls YCT Map's `GET /api/locations/` correctly.
   - MapLibre style reload resilience: added `style.load` event handler in YCT Map `incidents.js` to automatically re-add incident sources and layers if the base vector map style reloads.

8. **Automated Verification Matrix:**
   - `@yctalert/contracts`: **16 / 16 tests passing (100%)**
   - `@yctalert/public`: **50 / 50 tests passing (100%)**
   - `@yctalert/api`: **180 / 180 tests passing (100%)**
   - YCT Map JS (`tests/js/*.test.mjs`): **188 / 188 tests passing (100%)**
   - YCT Map Django (`manage.py test locations`): **99 / 99 tests passing (100%)**
   - Total Automated Tests Passing: **553 / 553 tests (100%)**
   - Monorepo Typecheck: **0 errors** across all workspaces (`npm run typecheck`).
   - Production Build: Clean compilation across all workspaces (`npm run build`).
