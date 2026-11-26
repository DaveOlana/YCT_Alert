# YCT Alert — Agent Guide for Using the Builder Blueprint ZIP

**Companion archive:** `YCT_Alert_V1_Builder_Blueprint_2026-10-25.zip`  
**Version:** 1.0 · 25 October 2026  
**Audience:** Gemini, Codex, Antigravity, other coding agents, human developers, technical reviewers and project owner.

## Your assignment

Treat the ZIP as a **controlled planning and delivery framework** for the new YCT Alert system: anonymous campus incident reporting through web and Capacitor Android, backed by a separate API/database and reviewable administrative workflow. **Do not implement or deploy the whole project in one uncontrolled pass.**

This companion file is the entry point. Keep it **outside** the extracted ZIP so it can be sent to any new agent before they receive the project files.

## Step 1 — Extract and understand

1. Unzip the archive into a read-only documentation/reference directory or a `docs/blueprint/` folder in the **new YCT Alert repository**, not into YCT Map by default.
2. Open `README.md`, followed by `00_STATUS_AND_SCOPE.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_SYSTEM_ARCHITECTURE.md` and `AGENTS.md`.
3. Next read `03_MAP_AUDIT_EVIDENCE.md`, `04_YCT_MAP_INTEGRATION.md`, and `17_DECISIONS_AND_ASSUMPTIONS.md`. Understand which claims are **AUDIT-REPORTED**, **AGREED** or merely **PROPOSED**.
4. Follow the remaining document order from the ZIP's `README.md` to learn API/data, admin security, Capacitor, acceptance tests, roadmap and operational boundaries.
5. Report a concise understanding of the architecture, proposed stack, blocking open decisions and the exact first safe milestone. **Do not start editing code until owner approves Gate G0.**

## Step 2 — Understand the evidence limitation

The supplied Gemini result was **an audit summary**, not the full `YCT_MAP_REPOSITORY_AUDIT_FOR_YCT_ALERT.md` it says it wrote. The summary reports that YCT Map already provides `GET /api/locations/` as published-place GeoJSON and uses stable UUID place identities. It also reports 265 Django and 162 JS passing tests; **you have not independently rerun them**.

Before making **any YCT Map code change**, obtain the full audit and inspect the current source and actual API response. The proposed YCT Alert integration must reuse the existing endpoint where possible, and must not modify YCT Map's routing, GPS, verification system, DB or auth.

## Step 3 — Identify scope and preserve ownership boundaries

- **YCT Map** owns campus place data, walkways, entrances and pedestrian A* routing.
- **YCT Alert** owns submitted reports, incident lifecycle, the separate PostgreSQL database, admin users and safe public ACTIVE feed.
- Alert reports work when Map is asleep or down; manual incident location must always remain possible.
- Map continues normal navigation when Alert fails; incident markers are a separate optional MapLibre layer.
- No shared DB tables, cross-DB foreign keys, shared admin credentials, route avoidance or direct Map editor writes.

## Step 4 — Understand admin governance (do not copy passwords)

The protected super-administrator has the reserved **username** `ALERTadmin`. Other administrators are student accounts granted and revoked by authorized super-admin action. Security officials may later receive admin authority after an approved handover.

The password previously shared by the owner must **never** be reused, embedded in code, written in Markdown, put in `.env.example`, committed, logged or placed in an APK. The future account must be securely bootstrapped, hashed, recoverable, and the original chat-exposed password replaced with a newly generated secret. Read `08_ADMIN_ROLES_AND_ASSIGNMENT.md` and `09_ADMIN_BOOTSTRAP_AND_RECOVERY.md`.

## Step 5 — Plan the first development sprint

Review `20_FIRST_IMPLEMENTATION_SPRINT.md` and propose a sequence of **small tasks**, with affected files, tests, and excluded scope. Begin with a synthetic-only vertical slice:

**Browser/Android report → Alert API → separate test DB → authenticated admin review → test-only approved feed.**

Capacitor is set up in the first sprint, while the shared frontend remains easy to develop in the browser. Test with a physical Android device from the beginning.

For each task use `templates/TASK_BRIEF_TEMPLATE.md`. For architecture decisions use `templates/ADR_TEMPLATE.md`. For release assessment use `templates/RELEASE_CHECKLIST.md`.

## Step 6 — Work by gates, not guesses

| Gate | Minimum owner-approved proof |
|---|---|
| G0 | Confirm stack, scope, taxonomy and repo ownership; unresolved blockers tracked |
| G1 | Complete end-to-end synthetic vertical slice on browser + physical Android |
| G2 | Safe incident matching, state machine, admin RBAC/revocation and privacy controls |
| G3 | Inspect current Map code/full audit, verify real geography contract, add isolated Map incident layer only with permission |
| G4 | Tested supervised pilot **plus** verified contacts, administrators, monitoring plan, privacy/retention and institutional/operational clearance |
| G5 | Proper Android signing/release ownership, native QA and any app-store requirements |

Never treat a functional APK as proof of a staffed emergency-response service. A report receipt does not mean dispatch occurred. Multiple reports cannot automatically activate an incident.

## Step 7 — Report your evidence

Every builder must deliver a status report listing:

- Task ID and approved specification reference.
- Files created/changed and unrelated files deliberately untouched.
- Tests actually executed, passing/failing counts, **blocked/not run** suites.
- Browser and **real Android** checks for device-dependent changes.
- Data migration/seed/deployment effects and targeted environment.
- API/schema changes, privacy/security risks, remaining blockers and rollback route.
- Whether the next gate is genuinely ready for owner review.

Do not claim `safe to deploy` merely because unit tests passed. No production database write, credentials reset, merge, push or deployment without owner permission.

## Important implementation notes

1. Start with real Map's `GET /api/locations/` rather than inventing a second locations API.
2. GeoJSON uses `[longitude, latitude]`, while common form fields are `latitude`, `longitude`.
3. V1 incident public feed and admin APIs **are proposed**; they do not yet exist.
4. Matching windows (e.g., ~50 m / 15 min) are **suggestions** requiring test/approval.
5. Do not build responder dispatch, background tracking, image uploads, AI risk scoring or incident-aware route avoidance in V1.
6. If Map data isn't available, use a user-supplied incident point or meaningful textual landmark and mark uncertainty; never invent coordinates.
7. If the API cannot confirm receipt, explicitly show the outcome as unknown/unsent, not `Report received`.
8. Use separate DEV/TEST/STAGING/PROD environments and never seed/reset production as part of routine agent work.

## Suggested first message back to the owner

> I have reviewed the YCT Alert blueprint. I understand the Map/Alert separation, anonymous reporting, admin review, Capacitor-first shared frontend, and safety constraints. Before implementation I will resolve the G0 blockers, verify the proposed stack and establish isolated development and test environments. My first delivery will be a synthetic-only, end-to-end web + Android vertical slice. I will not change YCT Map or deploy without explicit approval.

## Final directive

**Use this package as a source of controlled requirements and explicit decisions, not as permission to improvise.** The objective is a secure, testable and maintainable incident-reporting pilot. Real-world emergency operations require separate staffing, governance and reliability decisions.
