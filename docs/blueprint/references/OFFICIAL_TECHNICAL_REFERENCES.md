# Official Technical References and Verification Notes

These public references were checked while preparing this package (25 October 2026). Re-check versions and implementation-specific guidance before running commands; product documentation changes over time.

| Reference | URL | Relevance |
|---|---|---|
| Capacitor documentation (current v8 landing page when checked) | https://capacitorjs.com/docs | Cross-platform runtime overview |
| Capacitor setup and existing web-app requirements | https://capacitorjs.com/docs/getting-started | `package.json`, built web assets, `index.html`, install/add/sync workflow |
| Capacitor environment prerequisites | https://capacitorjs.com/docs/getting-started/environment-setup | Node, Android and iOS tooling requirements |
| Capacitor geolocation API | https://capacitorjs.com/docs/apis/geolocation | Permission handling, platform specifics; follow the matching installed version |
| GeoJSON standard RFC 7946 | https://www.rfc-editor.org/rfc/rfc7946 | WGS84 and `[longitude, latitude]` ordering |
| OWASP Application Security Verification Standard | https://owasp.org/www-project-application-security-verification-standard/ | Access control, sessions, inputs and logging verification requirements |
| OWASP Logging Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html | Privacy-aware audit/logging practices |

## Source hierarchy reminder

Capacitor docs guide implementation mechanics. The Map audit is a **reported observation** of existing code. Owner-approved product requirements specify desired Alert behaviour. These are different forms of authority and must not be conflated.

## References NOT yet available

- Full Gemini audit `YCT_MAP_REPOSITORY_AUDIT_FOR_YCT_ALERT.md` — user shared a pasted **summary**, not the full file.
- Actual YCT Map repository/API payloads at audit date.
- Campus response/approval policy, verified emergency contact list, privacy/retention counsel.
