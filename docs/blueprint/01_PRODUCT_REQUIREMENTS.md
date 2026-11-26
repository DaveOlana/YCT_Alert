# 01 — Product Requirements, Roles and User Journeys

## Product position

YCT Alert is an **independent campus incident-reporting and public-awareness pilot**, initially designed for YABATECH. It does not promise official institutional endorsement, emergency dispatch, ongoing monitoring or emergency-grade uptime. The public interface must direct users to verified official emergency contact mechanisms for immediate help once such details have been authorized and confirmed. Never invent contact numbers.

## Personas

| Actor | Needs | Permission boundary |
|---|---|---|
| Reporter (student/staff/visitor) | Report possible incident quickly without login | May submit; no access to private reports or admin actions |
| Public map visitor | See only published ACTIVE incidents with safe context | Public read only |
| Assigned student admin | Assess report evidence, group/split incidents, approve/reject/resolve | Temporarily granted scoped moderator role |
| Protected super admin | Same moderation plus grant/revoke admin roles and manage privileged operations | Non-deletable ordinary UI account; secure recovery and transfer |
| Future approved security officials | May receive admin powers after authorization | No automatic privileges; potential carefully governed leadership transition |

## Core functional requirements

| ID | Requirement | Acceptance condition |
|---|---|---|
| FR-01 | Report incidents anonymously from web and Android | No public account prompt; validated POST persists one report |
| FR-02 | Choose incident category and description | Client/server validate approved taxonomy and length constraints |
| FR-03 | Specify incident location flexibly | Manual place/text/point works if GPS denied or Map unavailable |
| FR-04 | Preserve accepted raw IncidentReport | Submission and incident linkage queryable to authorized admins |
| FR-05 | Retry safely using idempotency key | Repeated requests with same key/payload produce same receipt, not a second report |
| FR-06 | Suggest or associate duplicates | Compatible category, time, geography, and optional place ID; reversible |
| FR-07 | Separate approval from volume | Ten reports never auto-publish one incident |
| FR-08 | Maintain controlled incident state | Only valid server-enforced transitions and privileges |
| FR-09 | Admin login and grant/revoke | Super admin handles assignments; removed admin immediately loses elevated access |
| FR-10 | Display safe active feed | No raw reporter text, PII or private notes; only ACTIVE, approved and safe fields |
| FR-11 | Map incident markers | Additive MapLibre layer fails without breaking routing/search |
| FR-12 | Work when Map unavailable | Manual location intake unaffected; explain temporarily unavailable place search |
| FR-13 | Mobile support | Browser experience and physical Android Capacitor build test the same core flow |
| FR-14 | Admin audit trail | Actor, action, subject, timestamp and nonsecret rationale recorded |
| FR-15 | Honest acknowledgments | UI distinguishes unsent, sending, server-received and reviewed; never claims dispatch |

## Reporting journey

1. Open site/app, see pilot scope and verified call-for-help alternative (when officially provided).
2. Pick incident type, choose where **incident occurred** (not necessarily current device location), add short description.
3. Review sensitive information warning and submit. The device-generated idempotency key is stable across retry of the same attempt.
4. Show `RECEIVED` with receipt ID and timestamp **only after** successful server confirmation. If request outcome is unknown, check receipt status or retry with same key; never falsely claim success.
5. Admin reviews data. Reporter need not create account or see private moderation results.

## Admin journey

1. Sign in using securely provisioned account and fresh session.
2. See pending incident queue with count of associated reports and age; no assertion that independent people verified it.
3. Inspect report evidence; verify category/location appropriately and request clarification only when a safe communication mechanism exists.
4. Associate/split reports as necessary, with an audit record.
5. Activate for public viewing, reject or later resolve; publish a short **safe summary** instead of raw text.

## Product language / accessibility

- Prefer simple phrasing: `Report incident`, `Incident location`, `Report received — awaiting review`, `Published incident`, `Resolved`.
- Never use `Help is on the way`, `Responder dispatched`, or `Official YABATECH emergency service` without real authorization and event evidence.
- Keep short forms, large touch targets, keyboard/screen-reader support, colour-independent incident status and low-bandwidth pages.
- Disable misleading confirmation when offline. Drafts should be locally stored only where privacy policy and user intent permit.

## Operational/nonfunctional requirements

- Authentication and authorization enforced on the server, not client-only role checks.
- Browser and Android feature parity for incident submission and status wording.
- Accessible on supported low-end phones, with responsive UI and measured payload sizes.
- Document latency expectations but **do not promise** free-tier uptime or response SLAs.
- Handle missing coordinates as an explicitly triage-needed report rather than inventing a map point.
- Defined data retention, privileged access review, incident severity taxonomy and escalation policy **must be decided** before live public pilot.

## Change control

If stakeholders request image evidence, push notification guarantees, responder dispatch, WhatsApp integration or incident-aware routing, capture separate change requests with schedule/cost/security impact. No agent may expand V1 silently.
