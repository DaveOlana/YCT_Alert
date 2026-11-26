# 08 — Administrative Roles, Assignment and Revocation

## Owner-confirmed governance intent

- One **permanent protected super-admin identity** controls administrator assignment and higher-level settings.
- Other administrators are **students** whose elevated permissions are assigned and later revoked (in spirit like YCEP organiser privileges).
- Future **campus security officials** may be given administrator powers after verified authorization; a designated head may receive leadership privileges through a controlled process.
- These are Alert-specific accounts, not Map or YCEP accounts.

## Proposed role model

| Permission | Protected super admin | Assigned admin | Public reporter |
|---|---:|---:|---:|
| Submit anonymous report | Allowed, via public interface | Allowed, via public interface | Yes |
| View private report/queue | Yes | Yes within scope | No |
| Link/split reports | Yes | Yes within scope | No |
| Activate/reject/resolve | Yes | Yes within scope | No |
| View moderation audit | Yes | Scoped | No |
| Grant/revoke admin role | Yes | No | No |
| Configure matching/taxonomy policy | Owner-approved super-admin operation | No | No |
| Transfer protected leadership | Controlled, out-of-band authorization | No | No |
| Delete protected identity | No through normal admin UI | No | No |

Implement authorizations on each backend endpoint. A hidden UI button is **not** access control.

## Assignment lifecycle

`REQUESTED/IDENTIFIED → VERIFIED/APPROVED → ACTIVE → REVOKED or EXPIRED`. The student verification rule and approver evidence are **not finalized**; do not copy YCEP's exact registration or matric-number scheme without a privacy and governance decision.

Each assignment records target account, role, scope (e.g. reviewer), issuer, reason, start/end dates, revoked time and audit row. Temporary privileges default to an expiry/review date; audit should flag inactive accounts.

**Revocation requirement:** effective immediately for all privileged requests. Store server-side session version or centrally revocable tokens, terminate active privileged sessions and enforce the assignment at every action. Admin account itself may remain after revocation without privileged access.

## Permanent role versus unchangeable individual

A protected super-admin identity should always be recoverable and have audited leadership transfer. It must **not** imply that a human who loses authorization can retain irreversible access. Institutional takeover requires written agreement, identity verification, approved account migration and audit of authority. Multiple active super admins are **not** assumed in V1.

## Future security-official handover (non-V1)

1. Institution formally appoints authorized security personnel.
2. Existing owner verifies appointment outside the platform.
3. Assign normal admin privileges first to validate operations.
4. If formally approved, execute controlled head/super-admin transfer with secure bootstrap/reset, key ownership and accountability documentation.
5. Review all student-admin assignments and remove unneeded access.
6. Keep auditable handover record. Never silently share the protected password.

## Operational caveat

Moderation power means approving public **information**, not necessarily dispatching responders. Do not add `dispatch` actions or response claims until real campus-response authority and workflow are established.
