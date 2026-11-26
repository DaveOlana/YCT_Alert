# 10 — Web-First Development with Capacitor from Day One

**Owner decision:** initialize Capacitor during the initial sprint, not after finishing the web application. Browser and Android share one frontend. Android first; iOS later only if authorized.

## Why this architecture

A Vite/TypeScript frontend builds static `index.html` and assets. The same bundle is hosted for browsers and copied into the Capacitor native Android container. The API is independently deployed; no embedded Django/Node backend ships in APK.

Official Capacitor installation guidance: https://capacitorjs.com/docs/getting-started

## Suggested setup sequence (commands are examples; do not run production actions)

```bash
# Only after stack approval and creating a local workspace
npm install
npm run build --workspace apps/public
cd apps/public
npm install @capacitor/core
npm install -D @capacitor/cli
npx cap init
npm install @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```

Verify actual workspace execution locations, `webDir`, package versions and Node/Android compatibility; do not paste these blindly into an unknown repo. Capacitor requires `package.json`, built web assets, and `index.html` with a `<head>` element.

**Native application ID:** immutable published identifier to be decided by owner. Do not invent an official college package namespace. Signing key ownership and Play account must be agreed **before** release.

## Adapter interfaces

- `LocationService`: web browser geolocation vs Capacitor native plugin, typed `lat/lon/accuracy/timestamp`, manual fallback.
- `ConnectivityService`: online/offline awareness; authoritative delivery only from server result.
- `DraftStore`: optional local encrypted/limited storage with explicit retention and privacy decision.
- `NotificationService`: initially no required push; later browser/native implementation only if justified and tested.
- `AppLifecycleService`: foreground revalidation, pending request state resolution; never automatic 24/7 location tracking.

## UX and network-state matrix

| State | UI |
|---|---|
| Opening app, API ready | Show accessible incident form |
| Device GPS denied | Manual location and text instructions |
| Map location list unavailable | Nonblocking notice; manual report stays enabled |
| Request in flight | Disable duplicate click; keep idempotency key |
| API returns 202 receipt | Show exact server-confirmed receipt and pending-review wording |
| Network timeout, outcome unknown | State explicitly unknown; retry **with same key** or check receipt; do not claim failure or success without proof |
| Explicit HTTP validation error | Explain field issue; allow edit and new submission attempt as applicable |
| App returns from background | Refresh connectivity and pending receipt safely |

## Device test checklist

- Physical Android device via USB debugging early; test fresh install/upgrade/reinstall.
- Deny and grant location; turn system Location off; approximate versus precise permission.
- Network switch Wi-Fi↔mobile data; airplane mode; timeout after request sent.
- Rotate, switch background/foreground, kill/resume during POST; maintain idempotency.
- Keyboard layout, small screens, 200% font, accessibility semantics, full-screen behavior, Android Back action.
- Map UI (if present) is optional for reporting; content loading errors do not block submission.

## Native constraints

Capacitor's standard Geolocation plugin does **not** directly implement persistent background geolocation. No background tracking is required by V1. Android runtime permissions and iOS project requirements must be reviewed against current official docs when implemented.

## Bundles and environments

`dev`, `test`, `pilot` and `prod` API base URLs selected at build time through nonsecret config. Do not put DB password, admin credential, API private key or signing secret in the mobile bundle. Enforce TLS and appropriate CORS origins. A mobile client's source is inspectable and cannot securely store a backend super-admin secret.

## Minimal first-day demonstration

Blank but branded public form with a synthetic report button, packaged in Android, hitting a **test-only** Alert API endpoint; same form functions in desktop/mobile browser. No real incident published. This removes native integration surprises before investing in features.
