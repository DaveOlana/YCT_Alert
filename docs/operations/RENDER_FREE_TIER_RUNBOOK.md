# YCT Alert — Render Free Tier Operations, Limitations & Backup Runbook

**Notice:** This deployment uses Render Free Tier resources for the initial pilot. Free-tier infrastructure has **no uptime SLA** and **is not emergency-grade**. Users must continue to use campus security / official emergency numbers when in immediate physical danger.

---

## 1. Free-Tier Architecture & Limitations

| Component | Render Resource | Free-Tier Limits & Operational Behavior |
| :--- | :--- | :--- |
| **Public PWA** | `yct-alert-public` (`runtime: static`) | Global CDN, HTTPS, `100 GB/month` bandwidth, no idle spin-down. |
| **Admin Portal** | `yct-alert-admin` (`runtime: static`) | Global CDN, HTTPS, `100 GB/month` bandwidth, no idle spin-down. |
| **Fastify API** | `yct-alert-api` (`runtime: node`, `plan: free`) | `512 MB RAM`, shared CPU, `750` workspace free instance hours/month. **Spins down after 15 minutes of zero inbound HTTP traffic.** Cold start takes **~50–60 seconds**. Ephemeral local filesystem (never rely on local disk uploads in production). |
| **PostgreSQL** | `yct-alert-db` (`plan: free`) | `1 GB` SSD storage, `256 MB` RAM, `100` max connections, max `1` free Postgres per Render workspace, **no automated backups**, and **automatic expiration 30 days after creation** (followed by a **14-day grace period** to upgrade before permanent deletion). |

### Impact of API Sleep on Background Jobs
1. **Cold-Start Delays (`~50–60s`):** When `yct-alert-api` wakes after >15 min idle, initial API calls experience up to ~60s latency. The Public PWA defaults `submitReport` timeout to `65s` so first-wake submissions are not prematurely aborted.
2. **Campus Geography Synchronization (`GeographySyncService`):** While the API is asleep, the 15-minute `setInterval` poller does not execute. On wake, Fastify's `onReady` hook immediately loads the persisted `campus_geography_snapshots` row from PostgreSQL into memory (preserving search availability right away) and triggers an asynchronous background sync against `YCT_MAP_BASE_URL`.
3. **Retention Purge Scheduler:** The background retention purge waits 60s after boot and then runs every 24h (`RETENTION_PURGE_INTERVAL_HOURS`). If the free API spins down after 15 minutes of inactivity, the 24-hour interval resets upon sleep. While using the Free tier, superadmins (`ALERTadmin`) should periodically trigger retention purge explicitly via `POST /api/v1/admin/purge-retention` (or the Admin Portal) rather than relying solely on a 24h in-process timer.

---

## 2. Database Backup & Export Before 30-Day Expiration

Render Free PostgreSQL databases expire **30 days after creation**. Always run a verified backup before Day 25 (or before deleting/replacing an expired DB).

### Step A — Export Backup Locally
1. In the Render Dashboard, open **`yct-alert-db`** -> **Connect** -> copy the **External Database URL**.
2. Run the backup helper script from the repository root:
   ```powershell
   .\services\api\scripts\backup-db.ps1 -ExternalDatabaseUrl "<RENDER_EXTERNAL_DATABASE_URL>"
   ```
3. Verify the generated `.dump` and `.sql` files in `tmp\db_backups\` are non-empty. Keep them out of Git.

### Step B — Restore to a New PostgreSQL Database (or Upgraded Paid Instance)
1. Provision a new PostgreSQL database (or upgrade the existing one in Render before the 14-day grace period ends).
2. Restore the custom-format dump:
   ```powershell
   docker run --rm -v "C:\Users\HP\Documents\YCT Alert\tmp\db_backups:/backups" postgres:16-alpine `
     pg_restore --clean --if-exists --no-owner --no-privileges --dbname="<NEW_EXTERNAL_DATABASE_URL>?sslmode=require" "/backups/<backup_file>.dump"
   ```

---

## 3. Upgrading to Paid Render Instances (Zero Code Rewrite)

To move from pilot to always-on production without changing application code:
1. In Render Dashboard (or [`render.yaml`](../../render.yaml)), change `plan: free` on `yct-alert-api` to `starter` (always-on, zero spin-down, persistent 15-min YCT Map polling & 24h retention purge, interactive Shell access).
2. Upgrade `yct-alert-db` from `free` to a paid PostgreSQL plan (removes the 30-day expiration and enables daily automated backups).
3. Optional custom domain: If moving `yct-alert-admin` and `yct-alert-api` under the same root domain (e.g., `admin.yourdomain.org` and `api.yourdomain.org`), you may tighten `ADMIN_COOKIE_SAMESITE` from `none` to `lax`.
