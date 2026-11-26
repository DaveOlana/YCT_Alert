# 12 — Emergency Safety, Operations and Governance

## Status of service

YCT Alert V1 is a **pilot reporting and information platform**, not an official dispatch or 24-hour emergency service. Until an institution formally authorizes and staffs response operations, the product must never imply a submission reaches on-duty responders or triggers rescue.

## Required public disclaimer principles

- `For immediate danger, contact authorized campus or local emergency services directly.` Show only **verified, owner-approved contact information**; no invented telephone numbers.
- `Submitting a report does not guarantee monitoring, response or assistance.`
- `Report received` denotes successful API storage only.
- `Active incident` denotes authorized publication, not independently validated emergency status unless a separate verification workflow exists.
- Keep user-facing language concise and accessible; never use panic-inducing false urgency labels.

## Pending operational decisions

| Question | Status | Gate |
|---|---|---|
| Who monitors reports and when? | OPEN | Before real-user pilot |
| Is YCT Alert institutionally recognized? | OPEN; do not claim official status | Before public branding/launch |
| Emergency line numbers/contacts | OPEN; verify and get permission | Before pilot |
| What happens if no admin responds? | OPEN | Before pilot |
| What level of detail is safe to publish? | OPEN | Before active-public feed pilot |
| If security officials join, who appoints/revokes them? | OPEN, future process | Before role transition |
| Availability target and hosting budget | OPEN | Before production-like deployment |
| Who handles incident abuse, complaints and privacy requests? | OPEN | Before pilot |

## Admin operating procedure — pilot

1. Authenticate; confirm shift/availability expectations if established.
2. Review pending report and linked evidence; understand location confidence.
3. Where evidence insufficient, leave pending or reject with reason under policy; do not invent eyewitness verification.
4. Where appropriate, approve a short safe public advisory with visible age and location precision indicator.
5. Record audited decision; review live incident statuses; resolve with documented basis.
6. Escalate real emergency to authorized external responders only through an independently approved process. This project does **not** implement automated dispatch in V1.
7. Handle complaints/false or unsafe publication with rollback and audit.

## Failure-handling playbook

- **API unavailable:** public form shows service unavailable and verified direct-contact options; don't queue as successfully received.
- **Request timeout/uncertain receipt:** use same idempotency key on deliberate retry; avoid duplicate report.
- **Map unavailable:** manual incident description/point still accepted. Show place lookup temporarily unavailable.
- **Alert feed unavailable on Map:** mark last update stale/unavailable rather than showing `No incidents`.
- **Database/identity incident:** disable new privileged changes if necessary, preserve logs and contact owner; do not simulate response success.
- **Abuse surge:** throttle and review without suppressing critical reports through naive network-based blocks.

## Outage communication

Include public status text, owner contact for system faults (not emergency contact), last-known feed freshness and a manual fallback plan. Test communications with a simulated outage before public pilot. Backend cold starts or free-tier pauses should be treated as a known risk, not hidden from stakeholders.

## Launch governance

A **technical build acceptance** is not a **live emergency service authorization**. Distinct signatures/approvals are needed for software QA and for institutional response operations. Record both separately.
