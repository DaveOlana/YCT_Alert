import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  CreateReportRequest,
  CreateReportResponse,
  ReceiptStatusResponse,
  ReportLifecycleStatus,
  IncidentCategory,
} from '@yctalert/contracts';
import { withTransaction, query } from '../db/pool.js';
import { EncryptionService } from './encryptionService.js';
import { findCandidateIncidents, evaluateCandidateMatches } from './matchingService.js';
import { detectPublicSummaryPii } from './piiGuardrailService.js';
import { recomputeIncidentCoordinateConsensus } from './coordinateConsensusService.js';

export function canonicalisePayload(req: CreateReportRequest): string {
  const loc = req.incident_location;
  const canonicalObj = {
    category_code: req.category_code,
    description: req.description.trim(),
    incident_location: {
      landmark_description: loc.landmark_description ? loc.landmark_description.trim() : null,
      latitude: typeof loc.latitude === 'number' ? Number(loc.latitude.toFixed(6)) : null,
      longitude: typeof loc.longitude === 'number' ? Number(loc.longitude.toFixed(6)) : null,
      place_name_snapshot: loc.place_name_snapshot ? loc.place_name_snapshot.trim() : null,
      source: loc.source || 'MANUAL_POINT',
      yct_map_place_id: loc.yct_map_place_id || null,
    },
  };
  return JSON.stringify(canonicalObj);
}

export function generateReceiptToken(): { rawToken: string; tokenHash: string } {
  const rawToken = `tok_${crypto.randomBytes(32).toString('base64url')}`;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

export function generatePublicIncidentId(): string {
  return `inc_${crypto.randomBytes(12).toString('base64url')}`;
}

export interface IntakeResult {
  statusCode: 202 | 400 | 409;
  body: CreateReportResponse | { error: { code: string; message: string; violation_type?: string } };
}

export interface ReceiptLookupResult {
  statusCode: 200 | 403 | 404;
  body: ReceiptStatusResponse | { error: { code: string; message: string } };
}

export class ReportService {
  constructor(private encryptionService: EncryptionService) {}

  public async createOrReplayReport(
    idempotencyKey: string,
    payload: CreateReportRequest,
    isTest: boolean = true,
  ): Promise<IntakeResult> {
    // 0. Sensitive data & PII publication guardrail
    const piiCheck = detectPublicSummaryPii(payload.description);
    if (piiCheck.hasPii) {
      return {
        statusCode: 400,
        body: {
          error: {
            code: 'SENSITIVE_DATA_DETECTED',
            violation_type: piiCheck.violationType,
            message:
              piiCheck.message ||
              'Report description contains prohibited personal contact or identifying information.',
          },
        },
      };
    }

    const keyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
    const canonical = canonicalisePayload(payload);
    const fingerprint = crypto.createHash('sha256').update(canonical).digest('hex');
    const aadString = `PUBLIC_REPORT:${keyHash}`;

    return withTransaction<IntakeResult>(async (client: PoolClient) => {
      // 1. Transaction-level advisory lock serializes concurrent requests with the same key
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [aadString]);

      // 2. Check for existing idempotency record
      const existing = await client.query<{
        id: string;
        request_fingerprint: string;
        response_code: number;
        encrypted_response: Buffer | null;
        encryption_iv: Buffer | null;
        encryption_tag: Buffer | null;
        key_version: number;
        is_expired: boolean;
      }>(
        `SELECT 
          id,
          request_fingerprint,
          response_code,
          encrypted_response,
          encryption_iv,
          encryption_tag,
          key_version,
          (CURRENT_TIMESTAMP >= replay_expires_at) AS is_expired
        FROM idempotency_receipts
        WHERE scope = 'PUBLIC_REPORT' AND key_hash = $1
        FOR UPDATE`,
        [keyHash],
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];

        // Conflicting payload with reused key
        if (row.request_fingerprint !== fingerprint) {
          return {
            statusCode: 409,
            body: {
              error: {
                code: 'IDEMPOTENCY_KEY_REUSED',
                message: 'Idempotency key has already been used with a different request payload.',
              },
            },
          };
        }

        // Replay window expired
        if (row.is_expired || !row.encrypted_response) {
          return {
            statusCode: 409,
            body: {
              error: {
                code: 'IDEMPOTENCY_REPLAY_EXPIRED',
                message:
                  'The 7-day retry replay window has expired. The original report was previously accepted and cannot be duplicated.',
              },
            },
          };
        }

        // Valid cached replay
        try {
          const cachedResponse = this.encryptionService.decryptPayload<CreateReportResponse>(
            row.encrypted_response,
            row.encryption_iv!,
            row.encryption_tag!,
            aadString,
            row.key_version,
          );
          return {
            statusCode: 202,
            body: cachedResponse,
          };
        } catch (decryptErr) {
          console.error('[reportService] Failed to decrypt replay payload', decryptErr);
          throw new Error('Failed to decrypt authenticated idempotency receipt.');
        }
      }

      // 3. Fresh Submission: Generate credentials & entities
      const receiptId = crypto.randomUUID();
      const { rawToken, tokenHash } = generateReceiptToken();
      const incidentPublicId = generatePublicIncidentId();

      const loc = payload.incident_location;
      const lat = typeof loc.latitude === 'number' ? loc.latitude : null;
      const lon = typeof loc.longitude === 'number' ? loc.longitude : null;

      // Insert incident_reports
      const reportInsert = await client.query<{ id: string; submitted_at: Date }>(
        `INSERT INTO incident_reports (
          receipt_id,
          receipt_token_hash,
          category_code,
          description,
          location_source,
          incident_lat,
          incident_lon,
          yct_map_place_id,
          place_name_snapshot,
          landmark_description,
          is_test,
          submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
        RETURNING id, submitted_at`,
        [
          receiptId,
          tokenHash,
          payload.category_code,
          payload.description.trim(),
          loc.source || 'MANUAL_POINT',
          lat,
          lon,
          loc.yct_map_place_id || null,
          loc.place_name_snapshot?.trim() || null,
          loc.landmark_description?.trim() || null,
          isTest,
        ],
      );
      const report = reportInsert.rows[0];

      // Acquire category-level transaction advisory lock to serialize matching evaluations
      // for simultaneous submissions with distinct idempotency keys in the same category.
      // This prevents race conditions where simultaneous submissions create duplicate incidents.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `MATCHING_LOCK:${payload.category_code}`,
      ]);

      // Search for candidate incidents eligible for proximity and temporal matching
      const candidates = await findCandidateIncidents(
        client,
        payload.category_code,
        report.submitted_at,
        isTest,
      );

      const { matchedCandidates } = evaluateCandidateMatches(
        {
          latitude: lat,
          longitude: lon,
          yct_map_place_id: loc.yct_map_place_id || null,
        },
        candidates,
        50.0,
      );

      let targetIncidentId: string;
      let matchMethod: 'CREATION' | 'SUGGESTED';

      if (matchedCandidates.length === 1) {
        // Exactly one unambiguous candidate incident matched
        const target = matchedCandidates[0];
        targetIncidentId = target.incident_id;
        matchMethod = 'SUGGESTED';

        // Update candidate incident: observation timestamp, row version, updated_at
        // CRITICAL INVARIANT: NEVER automatically activate an incident.
        // Status remains strictly unchanged (whether PENDING, UNDER_REVIEW, or ACTIVE).
        await client.query(
          `UPDATE incidents
           SET last_reported_at = GREATEST(last_reported_at, $1),
               updated_at = CURRENT_TIMESTAMP,
               row_version = row_version + 1
           WHERE id = $2`,
          [report.submitted_at, targetIncidentId],
        );
      } else {
        // Zero candidates, or multiple ambiguous candidates exist.
        // When multiple plausible candidates exist, do not arbitrarily associate with one.
        // Create an independent PENDING incident and preserve ambiguity for moderator review.
        const incidentInsert = await client.query<{ id: string }>(
          `INSERT INTO incidents (
            public_id,
            status,
            category_code,
            safe_public_summary,
            display_lat,
            display_lon,
            first_reported_at,
            last_reported_at
          ) VALUES ($1, 'PENDING', $2, $3, $4, $5, $6, $6)
          RETURNING id`,
          [
            incidentPublicId,
            payload.category_code,
            payload.description.trim(),
            lat,
            lon,
            report.submitted_at,
          ],
        );
        targetIncidentId = incidentInsert.rows[0].id;
        matchMethod = 'CREATION';
      }

      // Insert link
      await client.query(
        `INSERT INTO incident_report_links (incident_id, report_id, match_method)
         VALUES ($1, $2, $3)`,
        [targetIncidentId, report.id, matchMethod],
      );

      // Recompute coordinate consensus for the incident
      await recomputeIncidentCoordinateConsensus(targetIncidentId, client);

      const shortRef = `#REF-${receiptId.slice(0, 8).toUpperCase()}`;

      // Construct response body
      const responseBody: CreateReportResponse = {
        receipt_id: receiptId,
        receipt_token: rawToken,
        reference_number: shortRef,
        delivery_status: 'RECEIVED',
        received_at: report.submitted_at.toISOString(),
        message: 'Report received and queued for safety team review.',
      };

      // Encrypt response for 7-day replay
      const encrypted = this.encryptionService.encryptPayload(responseBody, aadString);

      // Insert idempotency_receipts
      await client.query(
        `INSERT INTO idempotency_receipts (
          scope,
          key_hash,
          request_fingerprint,
          report_id,
          response_code,
          encrypted_response,
          encryption_iv,
          encryption_tag,
          key_version,
          replay_expires_at
        ) VALUES ('PUBLIC_REPORT', $1, $2, $3, 202, $4, $5, $6, $7, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
        [
          keyHash,
          fingerprint,
          report.id,
          encrypted.encryptedResponse,
          encrypted.encryptionIv,
          encrypted.encryptionTag,
          encrypted.keyVersion,
        ],
      );

      return {
        statusCode: 202,
        body: responseBody,
      };
    });
  }

  public async getReceiptStatus(
    receiptId: string,
    providedToken: string,
  ): Promise<ReceiptLookupResult> {
    const result = await query<{
      receipt_id: string;
      receipt_token_hash: string;
      category_code: IncidentCategory;
      submitted_at: Date;
      incident_status: string | null;
      public_id: string | null;
      assigned_admin_id: string | null;
    }>(
      `SELECT 
        r.receipt_id,
        r.receipt_token_hash,
        r.category_code,
        r.submitted_at,
        i.status AS incident_status,
        i.public_id,
        i.assigned_admin_id
      FROM incident_reports r
      LEFT JOIN incident_report_links l ON l.report_id = r.id
      LEFT JOIN incidents i ON i.id = l.incident_id
      WHERE r.receipt_id = $1`,
      [receiptId],
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        body: {
          error: {
            code: 'RECEIPT_NOT_FOUND',
            message: 'No report receipt found for the provided identifier.',
          },
        },
      };
    }

    const row = result.rows[0];

    // Constant-time token verification
    const computedHash = crypto.createHash('sha256').update(providedToken).digest('hex');
    const storedHash = row.receipt_token_hash;

    const computedBuffer = Buffer.from(computedHash, 'utf8');
    const storedBuffer = Buffer.from(storedHash, 'utf8');

    if (
      computedBuffer.length !== storedBuffer.length ||
      !crypto.timingSafeEqual(computedBuffer, storedBuffer)
    ) {
      return {
        statusCode: 403,
        body: {
          error: {
            code: 'INVALID_RECEIPT_TOKEN',
            message: 'The provided bearer receipt token is invalid.',
          },
        },
      };
    }

    // Map internal status to contract status
    let mappedStatus: ReportLifecycleStatus = 'RECEIVED';
    let statusMessage = 'Report received and queued for safety team review.';

    switch (row.incident_status) {
      case 'ACTIVE':
        mappedStatus = 'PUBLISHED';
        statusMessage = 'Active campus safety advisory issued.';
        break;
      case 'RESOLVED':
        mappedStatus = 'RESOLVED';
        statusMessage = 'Incident has been resolved and cleared.';
        break;
      case 'REJECTED':
        mappedStatus = 'REJECTED';
        statusMessage =
          'Reviewed and closed by safety moderators. No public campus advisory was issued.';
        break;
      case 'UNDER_REVIEW':
        mappedStatus = 'UNDER_REVIEW';
        statusMessage = 'Your report is actively under review by campus safety moderators.';
        break;
      case 'PENDING':
      default:
        if (row.assigned_admin_id) {
          mappedStatus = 'UNDER_REVIEW';
          statusMessage = 'Your report is actively under review by campus safety moderators.';
        } else {
          mappedStatus = 'RECEIVED';
          statusMessage = 'Report received and queued for safety team review.';
        }
        break;
    }

    const response: ReceiptStatusResponse = {
      receipt_id: row.receipt_id,
      delivery_status: mappedStatus,
      category: row.category_code,
      received_at: row.submitted_at.toISOString(),
      public_advisory_id: row.incident_status === 'ACTIVE' ? row.public_id : null,
      status_message: statusMessage,
    };

    return {
      statusCode: 200,
      body: response,
    };
  }
}
