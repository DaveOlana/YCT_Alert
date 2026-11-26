import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';
import { runMigrations } from '../scripts/migrate.js';

const ADMIN_PASSWORD = 'ValidSuperSecret123!@#Admin';

test('Safe Public-Summary Governance & Report Management Suite (G2.3)', async (t) => {
  const config = loadConfig({
    NODE_ENV: 'test',
    RATE_LIMIT_MAX: '1000',
    RATE_LIMIT_WINDOW_MINUTES: '1',
  });
  const app = buildApp(config);

  await runMigrations({
    databaseUrl: config.TEST_DATABASE_URL,
    direction: 'up',
    verbose: false,
  });

  const pool = new Pool({ connectionString: config.TEST_DATABASE_URL, max: 2 });

  t.after(async () => {
    await app.close();
    await pool.end();
  });

  // Clean tables before running suite
  await pool.query(
    'TRUNCATE TABLE admin_governance_audit_logs, incident_audit_logs, idempotency_receipts, incident_report_links, incident_reports, incidents, admin_sessions, admin_users CASCADE',
  );

  // 1. Provision superadmin and moderator
  await bootstrapAdmin({
    databaseUrl: config.TEST_DATABASE_URL,
    password: ADMIN_PASSWORD,
  });

  // Login as superadmin to get session & CSRF
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/login',
    remoteAddress: '127.0.0.1',
    payload: {
      username: 'ALERTadmin',
      password: ADMIN_PASSWORD,
    },
  });
  assert.equal(loginRes.statusCode, 200);
  const adminCookie = (loginRes.headers['set-cookie'] as string).split(';')[0];
  const adminCsrf = loginRes.json().csrf_token;

  // Helper to submit reports with distinct locations/categories
  async function submitReport(
    description: string,
    category: string = 'FIRE_OR_SMOKE',
    lat: number = 6.518,
    lon: number = 3.372,
  ) {
    const key = crypto.randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'idempotency-key': key },
      payload: {
        category_code: category,
        description,
        incident_location: {
          latitude: lat,
          longitude: lon,
          source: 'DEVICE_GPS',
          place_name_snapshot: 'Test Campus Facility',
          landmark_description: 'Workshop Rear Entrance',
        },
      },
    });
    assert.equal(res.statusCode, 202);
    const body = res.json();

    const linkRes = await pool.query<{ incident_id: string; report_id: string }>(
      `SELECT l.incident_id, l.report_id
       FROM incident_reports r
       JOIN incident_report_links l ON l.report_id = r.id
       WHERE r.receipt_id = $1`,
      [body.receipt_id],
    );

    return {
      receiptId: body.receipt_id,
      reportId: linkRes.rows[0].report_id,
      incidentId: linkRes.rows[0].incident_id,
    };
  }

  // Helper to activate an incident
  async function activateIncident(incidentId: string, summary: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incidentId}/activate`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        origin: 'http://localhost:5173',
      },
      payload: {
        safe_summary: summary,
        reason: 'Initial public activation',
      },
    });
    assert.equal(res.statusCode, 200);
    return res.json();
  }

  // Helper to claim an incident
  async function claimIncident(incidentId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incidentId}/claim`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        origin: 'http://localhost:5173',
      },
      payload: { reason: 'Triage investigation started' },
    });
    assert.equal(res.statusCode, 200);
    return res.json();
  }

  // Helper to resolve an incident
  async function resolveIncident(incidentId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incidentId}/resolve`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        origin: 'http://localhost:5173',
      },
      payload: { resolution_reason: 'Hazard cleared and verified by safety marshals' },
    });
    assert.equal(res.statusCode, 200);
    return res.json();
  }

  // Helper to reject an incident
  async function rejectIncident(incidentId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incidentId}/reject`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        origin: 'http://localhost:5173',
      },
      payload: { rejection_reason: 'Duplicate or unsubstantiated report' },
    });
    assert.equal(res.statusCode, 200);
    return res.json();
  }

  // =========================================================================
  // SUB-SUITE 1: Controlled Summary Revision & PII Guardrails
  // =========================================================================

  await t.test(
    'Summary Revision: Successful revision on ACTIVE incident with version increment and audit',
    async () => {
      const rep = await submitReport(
        'Report 1: Heavy smoke near workshop generator',
        'FIRE_OR_SMOKE',
        6.518,
        3.372,
      );
      const activated = await activateIncident(
        rep.incidentId,
        'Controlled generator exhaust smoke under routine maintenance inspection.',
      );
      const initialVersion = activated.incident.row_version;

      // PATCH summary
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${rep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary:
            'Generator exhaust test successfully concluded; no active fire hazard remains.',
          reason: 'Maintenance team confirmed test concluded without incident.',
          expected_version: initialVersion,
        },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.incident.status, 'ACTIVE');
      assert.equal(
        body.incident.safe_public_summary,
        'Generator exhaust test successfully concluded; no active fire hazard remains.',
      );
      assert.equal(body.incident.row_version, initialVersion + 1);

      // Audit log verification
      const auditRes = await pool.query<{
        action: string;
        previous_status: string;
        new_status: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT action, previous_status, new_status, metadata
       FROM incident_audit_logs
       WHERE incident_id = $1 AND action = 'SUMMARY_REVISED'`,
        [rep.incidentId],
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].previous_status, 'ACTIVE');
      assert.equal(auditRes.rows[0].new_status, 'ACTIVE');
      assert.equal(
        auditRes.rows[0].metadata.previous_summary,
        'Controlled generator exhaust smoke under routine maintenance inspection.',
      );
      assert.equal(
        auditRes.rows[0].metadata.new_summary,
        'Generator exhaust test successfully concluded; no active fire hazard remains.',
      );
    },
  );

  await t.test(
    'Summary Revision: Stale expected_version returns 409 VERSION_CONFLICT',
    async () => {
      const rep = await submitReport(
        'Report 2: Small electrical fault in lab',
        'PHYSICAL_HAZARD',
        6.52,
        3.374,
      );
      const activated = await activateIncident(
        rep.incidentId,
        'Electrical fault under review by facility technicians.',
      );
      const currentVersion = activated.incident.row_version;

      // Supply stale expected_version
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${rep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary: 'Electrical breaker isolated; repair work currently underway.',
          reason: 'Technician update',
          expected_version: currentVersion - 1, // Stale!
        },
      });

      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error.code, 'VERSION_CONFLICT');
    },
  );

  await t.test(
    'Summary Revision: Rejects revision on non-ACTIVE incidents (PENDING, UNDER_REVIEW, RESOLVED, REJECTED)',
    async () => {
      // 1. PENDING incident
      const pendingRep = await submitReport('Pending Report', 'SECURITY_INCIDENT', 6.53, 3.376);
      const resPending = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${pendingRep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary: 'Attempted summary update on pending report.',
          reason: 'Premature summary edit',
          expected_version: 1,
        },
      });
      assert.equal(resPending.statusCode, 400);
      assert.equal(resPending.json().error.code, 'VALIDATION_ERROR');

      // 2. UNDER_REVIEW incident
      await claimIncident(pendingRep.incidentId);
      const resReview = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${pendingRep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary: 'Attempted summary update on under_review report.',
          reason: 'Premature edit',
          expected_version: 2,
        },
      });
      assert.equal(resReview.statusCode, 400);

      // 3. RESOLVED incident
      await activateIncident(
        pendingRep.incidentId,
        'Security patrol responding to perimeter alert.',
      );
      await resolveIncident(pendingRep.incidentId);
      const resResolved = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${pendingRep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary: 'Post-resolution modification attempt.',
          reason: 'Post-mortem update',
          expected_version: 4,
        },
      });
      assert.equal(resResolved.statusCode, 400);

      // 4. REJECTED incident
      const rejRep = await submitReport('Report to reject', 'OTHER_URGENT', 6.54, 3.378);
      await rejectIncident(rejRep.incidentId);
      const resRejected = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${rejRep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary: 'Attempted summary update on rejected report.',
          reason: 'Rejected summary edit',
          expected_version: 2,
        },
      });
      assert.equal(resRejected.statusCode, 400);
    },
  );

  await t.test(
    'Summary Revision: Server-side PII guardrails reject phone numbers, emails, and matriculation numbers without leaking data',
    async () => {
      const rep = await submitReport('Report for PII test', 'FIRE_OR_SMOKE', 6.515, 3.371);
      const act = await activateIncident(
        rep.incidentId,
        'Initial active safe summary without personal details.',
      );
      const v = act.incident.row_version;

      // Test Nigerian Phone Number
      const phoneRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${rep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary: 'Call marshals at 08012345678 for access clearance.',
          reason: 'Safety coordinator phone update',
          expected_version: v,
        },
      });
      assert.equal(phoneRes.statusCode, 400);
      assert.equal(phoneRes.json().error.code, 'VALIDATION_ERROR');
      assert.ok(phoneRes.json().error.message.includes('phone number detected'));
      assert.equal(phoneRes.json().error.message.includes('08012345678'), false);

      // Test Email Address
      const emailRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${rep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary: 'Inquiries should be directed to marshal@yabatech.edu.ng immediately.',
          reason: 'Marshal contact email update',
          expected_version: v,
        },
      });
      assert.equal(emailRes.statusCode, 400);
      assert.ok(emailRes.json().error.message.includes('email address detected'));
      assert.equal(emailRes.json().error.message.includes('marshal@yabatech.edu.ng'), false);

      // Test Matriculation Number
      const matricRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${rep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary: 'Student with matric F/ND/21/3210001 reported power outage.',
          reason: 'Student report info update',
          expected_version: v,
        },
      });
      assert.equal(matricRes.statusCode, 400);
      assert.ok(matricRes.json().error.message.includes('matriculation number detected'));
      assert.equal(matricRes.json().error.message.includes('F/ND/21/3210001'), false);
    },
  );

  // =========================================================================
  // SUB-SUITE 2: Report Unlinking & Incident Splitting
  // =========================================================================

  await t.test(
    'Unlink / Split: Multi-report incident detaches report into new PENDING incident and keeps source status',
    async () => {
      // Submit 2 reports within 50m to associate them under candidate matching
      const repA = await submitReport(
        'Report A: Workshop sparking wire',
        'PHYSICAL_HAZARD',
        6.518,
        3.372,
      );
      const repB = await submitReport(
        'Report B: Additional sparking wire observation',
        'PHYSICAL_HAZARD',
        6.51805,
        3.37205,
      );
      assert.equal(repA.incidentId, repB.incidentId);

      // Claim the incident so it is in UNDER_REVIEW
      const claimed = await claimIncident(repA.incidentId);
      assert.equal(claimed.incident.status, 'UNDER_REVIEW');
      assert.equal(claimed.incident.report_count, 2);
      const sourceVersion = claimed.incident.row_version;

      // Unlink Report B
      const unlinkRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repA.incidentId}/reports/${repB.reportId}/unlink`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          reason: 'Separate issue in adjacent workshop room requiring distinct triage',
          expected_version: sourceVersion,
        },
      });

      assert.equal(unlinkRes.statusCode, 200);
      const body = unlinkRes.json();

      // Source incident assertions
      assert.equal(body.sourceIncident.incident.id, repA.incidentId);
      assert.equal(body.sourceIncident.incident.status, 'UNDER_REVIEW'); // Preserved status!
      assert.equal(body.sourceIncident.incident.report_count, 1);
      assert.equal(body.sourceIncident.incident.row_version, sourceVersion + 1);

      // New incident assertions
      const newInc = body.newIncident.incident;
      assert.notEqual(newInc.id, repA.incidentId);
      assert.equal(newInc.status, 'PENDING'); // Always PENDING!
      assert.equal(newInc.report_count, 1);
      assert.equal(newInc.row_version, 1);
      assert.equal(body.newIncident.reports[0].id, repB.reportId);
      assert.equal(body.newIncident.reports[0].match_method, 'CREATION');

      // Audit logs verification on both incidents
      const sourceAudit = await pool.query<{ action: string; metadata: Record<string, unknown> }>(
        `SELECT action, metadata FROM incident_audit_logs WHERE incident_id = $1 AND action = 'REPORT_UNLINKED'`,
        [repA.incidentId],
      );
      assert.equal(sourceAudit.rows.length, 1);
      assert.equal(sourceAudit.rows[0].metadata.unlinked_report_id, repB.reportId);

      const newAudit = await pool.query<{ action: string; metadata: Record<string, unknown> }>(
        `SELECT action, metadata FROM incident_audit_logs WHERE incident_id = $1 AND action = 'INCIDENT_CREATED_FROM_SPLIT'`,
        [newInc.id],
      );
      assert.equal(newAudit.rows.length, 1);
      assert.equal(newAudit.rows[0].metadata.source_incident_id, repA.incidentId);
    },
  );

  await t.test('Unlink / Split: Emptied source incident transitions to REJECTED', async () => {
    // Single report incident
    const rep = await submitReport('Single report incident', 'MEDICAL_EMERGENCY', 6.55, 3.38);
    const claimed = await claimIncident(rep.incidentId);
    const sourceVersion = claimed.incident.row_version;

    // Unlink the only report
    const unlinkRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${rep.incidentId}/reports/${rep.reportId}/unlink`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        origin: 'http://localhost:5173',
      },
      payload: {
        reason: 'Report was logged under wrong incident cluster; splitting to standalone record',
        expected_version: sourceVersion,
      },
    });

    assert.equal(unlinkRes.statusCode, 200);
    const body = unlinkRes.json();

    // Emptied source incident must be REJECTED
    assert.equal(body.sourceIncident.incident.status, 'REJECTED');
    assert.equal(body.sourceIncident.incident.report_count, 0);
    assert.ok(
      body.sourceIncident.incident.rejection_reason.includes(
        'Incident emptied through report split',
      ),
    );

    // New incident must be PENDING
    assert.equal(body.newIncident.incident.status, 'PENDING');
    assert.equal(body.newIncident.incident.report_count, 1);

    // Verify audit history records BOTH report unlinking and transition to REJECTED (Requirement 5)
    const auditEntries = await pool.query<{
      action: string;
      previous_status: string;
      new_status: string;
    }>(
      `SELECT action, previous_status, new_status
       FROM incident_audit_logs
       WHERE incident_id = $1
       ORDER BY created_at ASC`,
      [rep.incidentId],
    );
    const actions = auditEntries.rows.map((r) => r.action);
    assert.ok(
      actions.includes('REPORT_UNLINKED'),
      'Expected REPORT_UNLINKED in emptied incident audit',
    );
    assert.ok(actions.includes('REJECT'), 'Expected REJECT in emptied incident audit');
  });

  await t.test(
    'Unlink / Split Concurrency & Idempotency: Concurrent and repeated unlink requests cannot create duplicate incidents',
    async () => {
      // 2 reports linked under candidate matching
      const repA = await submitReport('Concurrency Unlink A', 'FIRE_OR_SMOKE', 6.513, 3.363);
      const repB = await submitReport('Concurrency Unlink B', 'FIRE_OR_SMOKE', 6.51305, 3.36305);
      assert.equal(repA.incidentId, repB.incidentId);

      const details = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${repA.incidentId}`,
        headers: { cookie: adminCookie },
      });
      const initialVersion = details.json().incident.row_version;

      // Send 2 concurrent unlink requests for the exact same report
      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/v1/admin/incidents/${repA.incidentId}/reports/${repB.reportId}/unlink`,
          headers: {
            cookie: adminCookie,
            'x-csrf-token': adminCsrf,
            origin: 'http://localhost:5173',
          },
          payload: {
            reason: 'Concurrent unlink test attempt 1',
            expected_version: initialVersion,
          },
        }),
        app.inject({
          method: 'POST',
          url: `/api/v1/admin/incidents/${repA.incidentId}/reports/${repB.reportId}/unlink`,
          headers: {
            cookie: adminCookie,
            'x-csrf-token': adminCsrf,
            origin: 'http://localhost:5173',
          },
          payload: {
            reason: 'Concurrent unlink test attempt 2',
            expected_version: initialVersion,
          },
        }),
      ]);

      const statusCodes = [res1.statusCode, res2.statusCode].sort();
      assert.strictEqual(statusCodes[0], 200, 'Expected exactly one request to succeed with 200');
      assert.ok(
        statusCodes[1] === 409 || statusCodes[1] === 400,
        `Expected conflicting concurrent request to be rejected with 409 or 400, got ${statusCodes[1]}`,
      );

      // Verify that repeating the request now fails with 400 (report already unlinked)
      const repeatRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repA.incidentId}/reports/${repB.reportId}/unlink`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          reason: 'Repeat unlink attempt',
          expected_version: initialVersion + 1,
        },
      });
      assert.equal(repeatRes.statusCode, 400);

      // Verify DB integrity: exactly 1 link for repB exists
      const linkCount = await pool.query<{ count: string }>(
        'SELECT count(*) FROM incident_report_links WHERE report_id = $1',
        [repB.reportId],
      );
      assert.equal(linkCount.rows[0].count, '1');
    },
  );

  await t.test('Unlink / Split: Rejects stale version and unlinked report mismatches', async () => {
    const rep = await submitReport('Report mismatch check', 'PHYSICAL_HAZARD', 6.56, 3.382);

    // Stale version
    const staleRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${rep.incidentId}/reports/${rep.reportId}/unlink`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        origin: 'http://localhost:5173',
      },
      payload: {
        reason: 'Valid split reason',
        expected_version: 999, // Stale!
      },
    });
    assert.equal(staleRes.statusCode, 409);
    assert.equal(staleRes.json().error.code, 'VERSION_CONFLICT');

    // Report not linked to incident
    const randomReportId = crypto.randomUUID();
    const wrongReportRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${rep.incidentId}/reports/${randomReportId}/unlink`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        origin: 'http://localhost:5173',
      },
      payload: {
        reason: 'Valid split reason',
        expected_version: 1,
      },
    });
    assert.equal(wrongReportRes.statusCode, 400);
    assert.equal(wrongReportRes.json().error.code, 'VALIDATION_ERROR');
  });

  // =========================================================================
  // SUB-SUITE 3: Manual Report Merge
  // =========================================================================

  await t.test(
    'Manual Merge: Successfully moves report to destination incident with match_method ADMIN and preserves audit',
    async () => {
      // 2 separate PENDING incidents (use coordinates isolated from previous tests)
      const repA = await submitReport('Target Incident Report', 'FIRE_OR_SMOKE', 6.511, 3.361);
      const repB = await submitReport('Source Incident Report 1', 'FIRE_OR_SMOKE', 6.528, 3.382);
      const repC = await submitReport(
        'Source Incident Report 2',
        'FIRE_OR_SMOKE',
        6.52805,
        3.38205,
      );

      // Both are PENDING
      const targetDetailsBefore = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${repA.incidentId}`,
        headers: { cookie: adminCookie },
      });
      const targetVersion = targetDetailsBefore.json().incident.row_version;

      const sourceDetailsBefore = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${repB.incidentId}`,
        headers: { cookie: adminCookie },
      });
      const sourceVersion = sourceDetailsBefore.json().incident.row_version;

      // Merge repC from repB.incidentId into repA.incidentId
      const mergeRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repA.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          report_id: repC.reportId,
          reason: 'Corroborating witness statement regarding Central Workshop incident',
          expected_version: targetVersion,
          source_expected_version: sourceVersion,
        },
      });

      assert.equal(mergeRes.statusCode, 200);
      const body = mergeRes.json();

      // Target incident assertions
      assert.equal(body.targetIncident.incident.id, repA.incidentId);
      assert.equal(body.targetIncident.incident.report_count, 2);
      assert.equal(body.targetIncident.incident.row_version, targetVersion + 1);
      assert.equal(body.targetIncident.incident.status, 'PENDING'); // Status preserved!
      const movedReport = body.targetIncident.reports.find(
        (r: { id: string }) => r.id === repC.reportId,
      );
      assert.ok(movedReport);
      assert.equal(movedReport.match_method, 'ADMIN');

      // Source incident assertions
      assert.equal(body.sourceIncident.incident.id, repB.incidentId);
      assert.equal(body.sourceIncident.incident.report_count, 1);
      assert.equal(body.sourceIncident.incident.row_version, sourceVersion + 1);
      assert.equal(body.sourceIncident.incident.status, 'PENDING'); // Status preserved!

      // Audit logs verification
      const targetAudit = await pool.query<{ action: string; metadata: Record<string, unknown> }>(
        `SELECT action, metadata FROM incident_audit_logs WHERE incident_id = $1 AND action = 'REPORT_MERGED_IN'`,
        [repA.incidentId],
      );
      assert.equal(targetAudit.rows.length, 1);
      assert.equal(targetAudit.rows[0].metadata.moved_report_id, repC.reportId);

      const sourceAudit = await pool.query<{ action: string; metadata: Record<string, unknown> }>(
        `SELECT action, metadata FROM incident_audit_logs WHERE incident_id = $1 AND action = 'REPORT_MERGED_OUT'`,
        [repB.incidentId],
      );
      assert.equal(sourceAudit.rows.length, 1);
      assert.equal(sourceAudit.rows[0].metadata.moved_report_id, repC.reportId);
    },
  );

  await t.test('Manual Merge: Emptied source incident transitions to REJECTED', async () => {
    // 2 single-report PENDING incidents
    const repA = await submitReport('Target single', 'SECURITY_INCIDENT', 6.53, 3.37);
    const repB = await submitReport('Source single', 'SECURITY_INCIDENT', 6.54, 3.38);

    const targetDetails = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/incidents/${repA.incidentId}`,
      headers: { cookie: adminCookie },
    });
    const sourceDetails = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/incidents/${repB.incidentId}`,
      headers: { cookie: adminCookie },
    });

    const mergeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${repA.incidentId}/merge-report`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        origin: 'http://localhost:5173',
      },
      payload: {
        report_id: repB.reportId,
        reason: 'Merging duplicate report from secondary perimeter gate',
        expected_version: targetDetails.json().incident.row_version,
        source_expected_version: sourceDetails.json().incident.row_version,
      },
    });

    assert.equal(mergeRes.statusCode, 200);
    const body = mergeRes.json();

    // Source incident was emptied -> REJECTED
    assert.equal(body.sourceIncident.incident.status, 'REJECTED');
    assert.equal(body.sourceIncident.incident.report_count, 0);
    assert.ok(
      body.sourceIncident.incident.rejection_reason.includes(
        'Incident emptied through report merge',
      ),
    );

    // Target incident retains original status
    assert.equal(body.targetIncident.incident.status, 'PENDING');
    assert.equal(body.targetIncident.incident.report_count, 2);

    // Verify audit history records BOTH report merge-out and transition to REJECTED (Requirement 5)
    const auditEntries = await pool.query<{
      action: string;
      previous_status: string;
      new_status: string;
    }>(
      `SELECT action, previous_status, new_status
       FROM incident_audit_logs
       WHERE incident_id = $1
       ORDER BY created_at ASC`,
      [repB.incidentId],
    );
    const actions = auditEntries.rows.map((r) => r.action);
    assert.ok(
      actions.includes('REPORT_MERGED_OUT'),
      'Expected REPORT_MERGED_OUT in emptied incident audit',
    );
    assert.ok(actions.includes('REJECT'), 'Expected REJECT in emptied incident audit');
  });

  await t.test(
    'Manual Merge Concurrency & Idempotency: Concurrent and repeated merge requests cannot create duplicate associations or duplicate increments',
    async () => {
      const targetRep = await submitReport('Target Concurrency Hub', 'FIRE_OR_SMOKE', 6.514, 3.364);
      const sourceRep = await submitReport(
        'Source Concurrency Leaf',
        'FIRE_OR_SMOKE',
        6.524,
        3.374,
      );

      const targetDetails = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${targetRep.incidentId}`,
        headers: { cookie: adminCookie },
      });
      const sourceDetails = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${sourceRep.incidentId}`,
        headers: { cookie: adminCookie },
      });

      const tVersion = targetDetails.json().incident.row_version;
      const sVersion = sourceDetails.json().incident.row_version;

      // 2 concurrent merge requests for the exact same report into the target incident
      const [res1, res2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/v1/admin/incidents/${targetRep.incidentId}/merge-report`,
          headers: {
            cookie: adminCookie,
            'x-csrf-token': adminCsrf,
            origin: 'http://localhost:5173',
          },
          payload: {
            report_id: sourceRep.reportId,
            reason: 'Concurrent merge test branch 1',
            expected_version: tVersion,
            source_expected_version: sVersion,
          },
        }),
        app.inject({
          method: 'POST',
          url: `/api/v1/admin/incidents/${targetRep.incidentId}/merge-report`,
          headers: {
            cookie: adminCookie,
            'x-csrf-token': adminCsrf,
            origin: 'http://localhost:5173',
          },
          payload: {
            report_id: sourceRep.reportId,
            reason: 'Concurrent merge test branch 2',
            expected_version: tVersion,
            source_expected_version: sVersion,
          },
        }),
      ]);

      const statusCodes = [res1.statusCode, res2.statusCode].sort();
      assert.strictEqual(statusCodes[0], 200, 'Expected exactly one request to succeed with 200');
      assert.ok(
        statusCodes[1] === 409 || statusCodes[1] === 400,
        `Expected conflicting concurrent request to be rejected with 409 or 400, got ${statusCodes[1]}`,
      );

      // Verify repeating the merge now returns 400 (already linked to target incident)
      const repeatRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${targetRep.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          report_id: sourceRep.reportId,
          reason: 'Repeat merge attempt',
          expected_version: tVersion + 1,
          source_expected_version: sVersion + 1,
        },
      });
      assert.equal(repeatRes.statusCode, 400);

      // Database verification: exactly 1 link for sourceRep exists, pointing to targetRep.incidentId
      const linkRes = await pool.query<{ count: string; incident_id: string }>(
        'SELECT count(*), incident_id FROM incident_report_links WHERE report_id = $1 GROUP BY incident_id',
        [sourceRep.reportId],
      );
      assert.equal(linkRes.rows.length, 1);
      assert.equal(linkRes.rows[0].count, '1');
      assert.equal(linkRes.rows[0].incident_id, targetRep.incidentId);
    },
  );

  await t.test(
    'Retention Compatibility: Emptied incidents in REJECTED state are fully compatible with 30-day retention purge (Decision D-16)',
    async () => {
      // Create and empty an incident
      const repA = await submitReport('Retention Target', 'PHYSICAL_HAZARD', 6.516, 3.366);
      const repB = await submitReport('Retention Source To Empty', 'PHYSICAL_HAZARD', 6.526, 3.376);

      const targetD = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${repA.incidentId}`,
        headers: { cookie: adminCookie },
      });
      const sourceD = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${repB.incidentId}`,
        headers: { cookie: adminCookie },
      });

      const mergeRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repA.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          report_id: repB.reportId,
          reason: 'Merge emptying source to test retention purge compatibility',
          expected_version: targetD.json().incident.row_version,
          source_expected_version: sourceD.json().incident.row_version,
        },
      });
      assert.equal(mergeRes.statusCode, 200);

      // Verify repB.incidentId is in REJECTED status with rejected_at set
      const emptiedCheck = await pool.query<{
        status: string;
        rejected_at: Date;
        purged_at: Date | null;
      }>('SELECT status, rejected_at, purged_at FROM incidents WHERE id = $1', [repB.incidentId]);
      assert.equal(emptiedCheck.rows[0].status, 'REJECTED');
      assert.ok(emptiedCheck.rows[0].rejected_at !== null);
      assert.equal(emptiedCheck.rows[0].purged_at, null);

      // Call manual retention purge trigger simulating 31 days in the future
      // Under D-16, retention purge is scheduled or triggered by superadmin
      // Let's test the AdminIncidentService.purgeExpiredIncidents() directly with simulated future date
      const { AdminIncidentService } = await import('../src/services/adminIncidentService.js');
      const adminService = new AdminIncidentService();

      const futureDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const purgeResult = await adminService.purgeExpiredIncidents(futureDate);
      assert.ok(purgeResult.purgedIncidentCount >= 1);

      // Verify the emptied incident record is redacted and marked purged
      const postPurge = await pool.query<{
        status: string;
        purged_at: Date | null;
        safe_public_summary: string | null;
      }>('SELECT status, purged_at, safe_public_summary FROM incidents WHERE id = $1', [
        repB.incidentId,
      ]);
      assert.equal(postPurge.rows[0].status, 'REJECTED');
      assert.ok(postPurge.rows[0].purged_at !== null);
      assert.ok(postPurge.rows[0].safe_public_summary?.includes('REDACTED ARCHIVAL RECORD'));
    },
  );

  await t.test(
    'Manual Merge: Incompatible statuses, terminal statuses, and same-incident merges are rejected',
    async () => {
      const repA = await submitReport('Incident Active', 'PHYSICAL_HAZARD', 6.57, 3.39);
      await activateIncident(repA.incidentId, 'Active hazard at cafeteria entrance.');

      const repB = await submitReport('Incident Pending', 'PHYSICAL_HAZARD', 6.58, 3.395);

      // 1. Incompatible statuses: ACTIVE vs PENDING
      const incompRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repA.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          report_id: repB.reportId,
          reason: 'Attempting to merge PENDING report into ACTIVE incident',
          expected_version: 2,
          source_expected_version: 1,
        },
      });
      assert.equal(incompRes.statusCode, 400);
      assert.ok(incompRes.json().error.message.includes('INCOMPATIBLE_INCIDENT_STATUS'));

      // 2. Same-incident merge: repA already in repA.incidentId
      const sameRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repA.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          report_id: repA.reportId,
          reason: 'Merging into self',
          expected_version: 2,
          source_expected_version: 2,
        },
      });
      assert.equal(sameRes.statusCode, 400);
      assert.ok(sameRes.json().error.message.includes('CANNOT_MERGE_SAME_INCIDENT'));

      // 3. Terminal status: RESOLVED incident
      await resolveIncident(repA.incidentId);
      const termRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repA.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          report_id: repB.reportId,
          reason: 'Merging into resolved incident',
          expected_version: 3,
          source_expected_version: 1,
        },
      });
      assert.equal(termRes.statusCode, 400);
      assert.ok(
        termRes.json().error.message.includes('CANNOT_MERGE_TERMINAL_INCIDENT') ||
          termRes.json().error.message.includes('INCOMPATIBLE_INCIDENT_STATUS'),
      );
    },
  );

  await t.test(
    'Manual Merge: Stale target and stale source versions return 409 VERSION_CONFLICT',
    async () => {
      const repA = await submitReport('Target Concurrency', 'FIRE_OR_SMOKE', 6.518, 3.372);
      const repB = await submitReport('Source Concurrency', 'FIRE_OR_SMOKE', 6.528, 3.382);

      // Stale target version
      const staleTargetRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repA.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          report_id: repB.reportId,
          reason: 'Valid merge reason',
          expected_version: 999, // Stale!
          source_expected_version: 1,
        },
      });
      assert.equal(staleTargetRes.statusCode, 409);
      assert.equal(staleTargetRes.json().error.code, 'VERSION_CONFLICT');

      // Stale source version
      const staleSourceRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repA.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          report_id: repB.reportId,
          reason: 'Valid merge reason',
          expected_version: 1,
          source_expected_version: 999, // Stale!
        },
      });
      assert.equal(staleSourceRes.statusCode, 409);
      assert.equal(staleSourceRes.json().error.code, 'VERSION_CONFLICT');
    },
  );

  // =========================================================================
  // SUB-SUITE 4: Security & Origin Guards
  // =========================================================================

  await t.test(
    'Security: Unauthenticated, CSRF-absent, and unapproved-origin requests are rejected across all three endpoints, and MODERATOR role is authorized',
    async () => {
      const rep = await submitReport('Security test report', 'FIRE_OR_SMOKE', 6.561, 3.391);
      const repTarget = await submitReport('Security test target', 'FIRE_OR_SMOKE', 6.571, 3.401);

      // --- Endpoint 1: PATCH /api/v1/admin/incidents/:id/summary ---
      // 1a. Unauthenticated (401)
      const unauthSum = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${rep.incidentId}/summary`,
        payload: {
          safe_summary: 'Unauthenticated patch attempt.',
          reason: 'Test',
          expected_version: 1,
        },
      });
      assert.equal(unauthSum.statusCode, 401);

      // 1b. Missing CSRF header (403)
      const noCsrfSum = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${rep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          origin: 'http://localhost:5173',
        },
        payload: {
          safe_summary: 'Missing CSRF header patch attempt.',
          reason: 'Test',
          expected_version: 1,
        },
      });
      assert.equal(noCsrfSum.statusCode, 403);

      // 1c. Unapproved Origin header (403)
      const evilOriginSum = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/incidents/${rep.incidentId}/summary`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://malicious-site.com',
        },
        payload: {
          safe_summary: 'Malicious origin patch attempt.',
          reason: 'Test',
          expected_version: 1,
        },
      });
      assert.equal(evilOriginSum.statusCode, 403);

      // --- Endpoint 2: POST /api/v1/admin/incidents/:id/reports/:reportId/unlink ---
      // 2a. Unauthenticated (401)
      const unauthUnlink = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${rep.incidentId}/reports/${rep.reportId}/unlink`,
        payload: {
          reason: 'Unauthenticated unlink',
          expected_version: 1,
        },
      });
      assert.equal(unauthUnlink.statusCode, 401);

      // 2b. Missing CSRF header (403)
      const noCsrfUnlink = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${rep.incidentId}/reports/${rep.reportId}/unlink`,
        headers: {
          cookie: adminCookie,
          origin: 'http://localhost:5173',
        },
        payload: {
          reason: 'Missing CSRF unlink',
          expected_version: 1,
        },
      });
      assert.equal(noCsrfUnlink.statusCode, 403);

      // 2c. Unapproved Origin (403)
      const evilOriginUnlink = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${rep.incidentId}/reports/${rep.reportId}/unlink`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://malicious-site.com',
        },
        payload: {
          reason: 'Malicious origin unlink',
          expected_version: 1,
        },
      });
      assert.equal(evilOriginUnlink.statusCode, 403);

      // --- Endpoint 3: POST /api/v1/admin/incidents/:id/merge-report ---
      // 3a. Unauthenticated (401)
      const unauthMerge = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repTarget.incidentId}/merge-report`,
        payload: {
          report_id: rep.reportId,
          reason: 'Unauthenticated merge',
          expected_version: 1,
          source_expected_version: 1,
        },
      });
      assert.equal(unauthMerge.statusCode, 401);

      // 3b. Missing CSRF header (403)
      const noCsrfMerge = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repTarget.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          origin: 'http://localhost:5173',
        },
        payload: {
          report_id: rep.reportId,
          reason: 'Missing CSRF merge',
          expected_version: 1,
          source_expected_version: 1,
        },
      });
      assert.equal(noCsrfMerge.statusCode, 403);

      // 3c. Unapproved Origin (403)
      const evilOriginMerge = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${repTarget.incidentId}/merge-report`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
          origin: 'http://malicious-site.com',
        },
        payload: {
          report_id: rep.reportId,
          reason: 'Malicious origin merge',
          expected_version: 1,
          source_expected_version: 1,
        },
      });
      assert.equal(evilOriginMerge.statusCode, 403);

      // --- Moderator Role Authorization Check ---
      // Create student MODERATOR account
      const adminLookup = await pool.query<{ id: string }>(
        `SELECT id FROM admin_users WHERE username = 'ALERTadmin' LIMIT 1`,
      );
      const superAdminId = adminLookup.rows[0].id;
      const { AdminUserService } = await import('../src/services/adminUserService.js');
      const userService = new AdminUserService();
      const mod = await userService.createModerator(
        { id: superAdminId, username: 'ALERTadmin' },
        {
          username: 'mod_ops_lead',
          password: 'ModOperationsPass123!@#',
          reason: 'Authorized shift operations lead',
        },
      );
      assert.equal(mod.role, 'MODERATOR');

      // Login as moderator
      const modLoginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        remoteAddress: '127.0.0.100',
        payload: {
          username: 'mod_ops_lead',
          password: 'ModOperationsPass123!@#',
        },
      });
      assert.equal(modLoginRes.statusCode, 200);
      const modCookie = (modLoginRes.headers['set-cookie'] as string).split(';')[0];
      const modCsrf = modLoginRes.json().csrf_token;

      // Moderator unlinks a report successfully (proves MODERATOR authorization on G2.3 moderation endpoints)
      const currentIncRes = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${rep.incidentId}`,
        headers: { cookie: adminCookie },
      });
      const modExpectedVersion = currentIncRes.json().incident.row_version;

      const modUnlinkRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${rep.incidentId}/reports/${rep.reportId}/unlink`,
        headers: {
          cookie: modCookie,
          'x-csrf-token': modCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          reason: 'Moderator authorized report separation',
          expected_version: modExpectedVersion,
        },
      });
      assert.equal(modUnlinkRes.statusCode, 200);
      assert.equal(modUnlinkRes.json().newIncident.incident.status, 'PENDING');
    },
  );
});
