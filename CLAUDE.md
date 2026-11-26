# CLAUDE.md — Project Memory and Operating Manual: YCT Alert

**Project:** YCT Alert  
**Version:** 0.2  
**Owner:** Independent Campus Public-Safety Platform  
**Architecture:** Monorepo (`apps/*`, `services/*`, `packages/*`)  

---

## 1. Operating Discipline & The 5 Invariants

1. **Map vs. Alert Separation:** YCT Map owns geography and pedestrian routing. YCT Alert owns reports, moderation, and public advisories. Zero shared DB tables, zero cross-DB foreign keys, zero shared session secrets.
2. **Anonymous Public Reporting:** Zero user accounts or compulsory identifiers for public reporters.
3. **Volume $\ne$ Verification:** Ten reports of the same incident corroborate it, but **never automatically activate or publish it**. Human review is strictly required.
4. **Honest System State:** `Report received` means the API stored the record. Never claim "Help is on the way" or "Dispatched" in V1.
5. **Mutual Outage Resilience:** If YCT Map fails, Alert reporting continues with manual text/coordinates. If Alert fails, Map continues normal routing.

---

## 2. Monorepo Structure

```
YCT Alert/
├── package.json              # Root npm workspaces
├── tsconfig.base.json        # Shared TypeScript compiler options
├── .gitignore
├── .prettierrc
├── eslint.config.mjs         # ESLint 9 flat config
├── .env.example              # Root environment template
├── apps/
│   ├── public/               # Vite + React + Tailwind + Capacitor (com.yctalert.app)
│   └── admin/                # Vite + React + Tailwind (Admin dashboard)
├── services/
│   └── api/                  # Fastify + TypeScript + PostgreSQL REST API
├── packages/
│   └── contracts/            # OpenAPI 3.1 & Zod shared schemas (@yctalert/contracts)
├── docs/
│   └── blueprint/            # Preserved 31 builder blueprint documents
└── aeos/                     # AEOS policies, templates, and playbooks
```

---

## 3. Technology Stack & Key Versions

* **Runtime:** Node.js v20+ (Verified on v24.16.0), npm 11+
* **Backend:** Fastify v5, TypeScript v5
* **Frontend:** React v19, Vite v6, Tailwind CSS v4, Lucide React
* **Mobile:** Capacitor v8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`), App ID: `com.yctalert.app`
* **Validation & Contracts:** Zod v3, OpenAPI 3.1
* **Database:** PostgreSQL (v15+) — Isolated test database configuration; strictly isolated from existing `yct_postgres`

---

## 4. Workspaces & Commands

* **Install dependencies:** `npm install`
* **Type-check all workspaces:** `npm run typecheck`
* **Lint all workspaces:** `npm run lint`
* **Format check:** `npm run format:check`
* **Build all workspaces:** `npm run build`
* **Start API (dev):** `npm run dev --workspace services/api`
* **Start Public Web (dev):** `npm run dev --workspace apps/public`
* **Start Admin Web (dev):** `npm run dev --workspace apps/admin`
* **Run automated simulation:** `npm run sim --workspace services/api`

---

## 5. Strict Safe Boundaries (Ticket Gating)

* **Code requires direct owner authorization.** Never advance tickets autonomously.
* **Database Safeguard:** Never touch, migrate, or truncate existing PostgreSQL containers or databases (`yct_postgres`). Test databases must use unique names (`yct_alert_test`) on separate credentials.
* **Two-Failure Rule:** If any script or test fails 2 times in a row, stop immediately, diagnose the root cause, and report rather than looping blind fixes.
* **Localhost Handoff:** Always provide accessible localhost URLs when delivering runnable components.
