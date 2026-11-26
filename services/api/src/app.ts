import fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import {
  CATEGORY_CATALOGUE,
  OPENAPI_SPECIFICATION,
  CreateReportRequestSchema,
  ActivateIncidentRequestSchema,
  ResolveIncidentRequestSchema,
  RejectIncidentRequestSchema,
  RetentionHoldRequestSchema,
  IncidentStatusSchema,
  type IncidentStatus,
  CreateModeratorRequestSchema,
  RevokeModeratorRequestSchema,
  ResetModeratorPasswordRequestSchema,
  ReviseIncidentSummaryRequestSchema,
  UnlinkReportRequestSchema,
  MergeReportRequestSchema,
  OverrideIncidentCoordinatesRequestSchema,
  CampusPlacesQuerySchema,
} from '@yctalert/contracts';
import { type Environment } from './config.js';
import { initPool, isDatabaseConnected, closePool } from './db/pool.js';
import { EncryptionService } from './services/encryptionService.js';
import { ReportService } from './services/reportService.js';
import { AdminAuthService, type AdminSession } from './services/adminAuthService.js';
import { AdminIncidentService } from './services/adminIncidentService.js';
import { AdminUserService } from './services/adminUserService.js';
import { PublicIncidentService } from './services/publicIncidentService.js';
import { geographySyncService, GeographySyncService } from './services/geographySyncService.js';

export interface AppServices {
  geographySyncService?: GeographySyncService;
}

declare module 'fastify' {
  interface FastifyRequest {
    adminSession?: AdminSession;
  }
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LoginRequestSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export function buildApp(config: Environment, services?: AppServices): FastifyInstance {
  initPool(config);

  const encryptionService = new EncryptionService(
    config.IDEMPOTENCY_REPLAY_SECRET,
    config.IDEMPOTENCY_REPLAY_KEY_VERSION,
  );
  const reportService = new ReportService(encryptionService);
  const adminAuthService = new AdminAuthService();
  const adminIncidentService = new AdminIncidentService();
  const adminUserService = new AdminUserService();
  const publicIncidentService = new PublicIncidentService();
  const geoSync = services?.geographySyncService ?? geographySyncService;
  geoSync.configure(config);

  const app = fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
    },
    trustProxy: config.TRUST_PROXY,
  });

  // Graceful database pool shutdown
  if (config.NODE_ENV !== 'test') {
    app.addHook('onClose', async () => {
      await closePool();
    });
  }

  // Cross-Origin Resource Sharing
  const configuredOrigins = config.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  const allowedOrigins = Array.from(
    new Set([
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost',
      'https://localhost',
      'capacitor://localhost',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      ...configuredOrigins,
    ]),
  );

  app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  });

  // Cookie Support
  app.register(cookie, {
    secret: config.ADMIN_SESSION_SECRET,
  });

  // Rate Limiting Plugin
  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      code: 'RATE_LIMIT_EXCEEDED',
    }),
  });

  // Health Probes
  app.get('/health/live', async () => {
    return {
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
    };
  });

  app.get('/health/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    const dbConnected = await isDatabaseConnected();
    if (!dbConnected) {
      return reply.status(503).send({
        status: 'not_ready',
        database: 'disconnected',
      });
    }

    const catalog = geoSync.getCachedCatalog();
    return reply.status(200).send({
      status: 'ready',
      database: 'connected',
      geography: {
        status: catalog ? catalog.sync_status : 'UNINITIALIZED',
        record_count: catalog ? catalog.total : 0,
        snapshot_age_seconds: catalog ? catalog.snapshot_age_seconds : null,
      },
    });
  });

  // Taxonomy endpoint (Public)
  app.get('/api/v1/taxonomy', async () => {
    return {
      categories: Object.values(CATEGORY_CATALOGUE),
    };
  });

  // OpenAPI 3.1 specification export
  app.get('/api/v1/openapi.json', async () => {
    return OPENAPI_SPECIFICATION;
  });

  // Helper auth middlewares
  async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply) {
    const rawCookie = request.cookies.yct_admin_session;
    if (!rawCookie) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Administrative authentication is required.',
        },
      });
    }

    const unsigned = request.unsignCookie(rawCookie);
    if (!unsigned.valid || !unsigned.value) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Administrative session cookie is invalid or forged.',
        },
      });
    }

    const session = await adminAuthService.validateSession(unsigned.value);
    if (!session) {
      reply.clearCookie('yct_admin_session', { path: '/' });
      return reply.status(401).send({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Administrative session is invalid, expired, or revoked.',
        },
      });
    }

    request.adminSession = session;
  }

  async function requireCsrfAndOrigin(request: FastifyRequest, reply: FastifyReply) {
    const origin = request.headers.origin;
    if (origin) {
      if (!allowedOrigins.includes(origin)) {
        return reply.status(403).send({
          error: {
            code: 'CSRF_VALIDATION_FAILED',
            message: `Origin "${origin}" is not permitted for administrative actions.`,
          },
        });
      }
    }

    const rawCsrf = request.headers['x-csrf-token'];
    const csrfHeader = Array.isArray(rawCsrf) ? rawCsrf[0] : rawCsrf;
    if (!csrfHeader || !request.adminSession) {
      return reply.status(403).send({
        error: {
          code: 'CSRF_VALIDATION_FAILED',
          message:
            'A valid X-CSRF-Token header is required for state-changing administrative requests.',
        },
      });
    }

    const isValid = adminAuthService.validateCsrfToken(
      csrfHeader,
      request.adminSession.csrfTokenHash,
    );
    if (!isValid) {
      return reply.status(403).send({
        error: {
          code: 'CSRF_VALIDATION_FAILED',
          message: 'X-CSRF-Token does not match active session token.',
        },
      });
    }
  }

  async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.adminSession || request.adminSession.role !== 'SUPERADMIN') {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'This operation requires SUPERADMIN privileges.',
        },
      });
    }
  }

  // API Routes wrapped in plugin to properly inherit rate-limit hooks
  app.register(async (api) => {
    // POST /api/v1/reports (Intake & Idempotency)
    api.post(
      '/api/v1/reports',
      {
        config: {
          rateLimit: {
            max: config.RATE_LIMIT_MAX,
            timeWindow: config.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const rawKey = request.headers['idempotency-key'];
        const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

        if (!idempotencyKey || !UUID_V4_REGEX.test(idempotencyKey)) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_IDEMPOTENCY_KEY',
              message: 'A valid UUIDv4 Idempotency-Key header is required.',
            },
          });
        }

        const parseResult = CreateReportRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request payload validation failed.',
              details: parseResult.error.format(),
            },
          });
        }

        const isTest =
          config.NODE_ENV === 'production' ? false : !config.ALLOW_LOCAL_NON_TEST_REPORTS;
        const result = await reportService.createOrReplayReport(
          idempotencyKey,
          parseResult.data,
          isTest,
        );

        return reply.status(result.statusCode).send(result.body);
      },
    );

    // GET /api/v1/reports/receipts/:receipt_id (Status Lookup)
    api.get(
      '/api/v1/reports/receipts/:receipt_id',
      async (request: FastifyRequest<{ Params: { receipt_id: string } }>, reply: FastifyReply) => {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'A valid Bearer receipt token is required.',
            },
          });
        }

        const receiptToken = authHeader.slice(7).trim();
        if (!receiptToken) {
          return reply.status(401).send({
            error: {
              code: 'UNAUTHORIZED',
              message: 'A valid Bearer receipt token is required.',
            },
          });
        }

        const { receipt_id } = request.params;
        const result = await reportService.getReceiptStatus(receipt_id, receiptToken);

        return reply.status(result.statusCode).send(result.body);
      },
    );

    // GET /api/v1/incidents/active/ & /api/v1/incidents/active (Public Active Incidents GeoJSON)
    const activeIncidentsHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
      const geojson = await publicIncidentService.getActiveIncidentsGeoJSON();
      return reply
        .header('content-type', 'application/geo+json; charset=utf-8')
        .header('cache-control', 'public, max-age=15, stale-while-revalidate=60, no-transform')
        .status(200)
        .send(geojson);
    };

    api.get(
      '/api/v1/incidents/active/',
      {
        config: {
          rateLimit: {
            max: 300,
            timeWindow: 60 * 1000,
          },
        },
      },
      activeIncidentsHandler,
    );

    api.get(
      '/api/v1/incidents/active',
      {
        config: {
          rateLimit: {
            max: 300,
            timeWindow: 60 * 1000,
          },
        },
      },
      activeIncidentsHandler,
    );

    // GET /api/v1/incidents/public/:public_id (Public Incident Details)
    api.get(
      '/api/v1/incidents/public/:public_id',
      {
        config: {
          rateLimit: {
            max: 300,
            timeWindow: 60 * 1000,
          },
        },
      },
      async (request: FastifyRequest<{ Params: { public_id: string } }>, reply: FastifyReply) => {
        const { public_id } = request.params;
        const detail = await publicIncidentService.getPublicIncidentDetail(public_id);
        if (!detail) {
          return reply
            .header('cache-control', 'no-cache, no-store, must-revalidate')
            .status(404)
            .send({
              error: {
                code: 'INCIDENT_NOT_FOUND',
                message: 'Incident not found or is not publicly accessible.',
              },
            });
        }
        return reply
          .header('content-type', 'application/json; charset=utf-8')
          .header('cache-control', 'public, max-age=15, stale-while-revalidate=60, no-transform')
          .status(200)
          .send(detail);
      },
    );

    // GET /api/v1/places/ (Public Campus Places from Cached Snapshot)
    const placesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = CampusPlacesQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters.',
            details: parseResult.error.format(),
          },
        });
      }

      const catalog = geoSync.queryPlaces(parseResult.data);
      if (!catalog) {
        return reply
          .header('Cache-Control', 'no-store')
          .status(503)
          .send({
            error: {
              code: 'GEOGRAPHY_UNAVAILABLE',
              message: 'Campus places catalogue is not yet initialized or temporarily unavailable.',
            },
          });
      }

      reply.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');

      if (catalog.sync_status === 'STALE') {
        reply.header('X-Geography-Stale', 'true');
      } else if (catalog.sync_status === 'DEGRADED') {
        reply.header('X-Geography-Degraded', 'true');
      }

      return reply.status(200).send(catalog);
    };

    api.get(
      '/api/v1/places/',
      {
        config: {
          rateLimit: {
            max: 300,
            timeWindow: 60 * 1000,
          },
        },
      },
      placesHandler,
    );

    api.get(
      '/api/v1/places',
      {
        config: {
          rateLimit: {
            max: 300,
            timeWindow: 60 * 1000,
          },
        },
      },
      placesHandler,
    );

    // POST /api/v1/admin/auth/login
    api.post(
      '/api/v1/admin/auth/login',
      {
        config: {
          rateLimit: {
            max: 5,
            timeWindow: 15 * 60 * 1000, // 5 failed attempts per 15 minutes
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const parseResult = LoginRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Username and password are required.',
            },
          });
        }

        const { username, password } = parseResult.data;
        const user = await adminAuthService.verifyCredentials(username, password);
        if (!user) {
          return reply.status(401).send({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid administrative username or password.',
            },
          });
        }

        const sessionResult = await adminAuthService.createSession(
          user.id,
          request.ip,
          request.headers['user-agent'],
        );

        reply.setCookie('yct_admin_session', sessionResult.rawSessionToken, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          signed: true,
          secure: config.NODE_ENV === 'production',
          maxAge: 12 * 60 * 60,
        });

        return reply.status(200).send({
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
          },
          csrf_token: sessionResult.rawCsrfToken,
        });
      },
    );

    // POST /api/v1/admin/auth/logout
    api.post(
      '/api/v1/admin/auth/logout',
      { preHandler: [authenticateAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const rawCookie = request.cookies.yct_admin_session;
        if (rawCookie) {
          const unsigned = request.unsignCookie(rawCookie);
          if (unsigned.valid && unsigned.value) {
            await adminAuthService.revokeSession(unsigned.value);
          }
        }

        reply.clearCookie('yct_admin_session', { path: '/' });
        return reply.status(200).send({ success: true, message: 'Logged out successfully.' });
      },
    );

    // GET /api/v1/admin/auth/me
    api.get(
      '/api/v1/admin/auth/me',
      { preHandler: [authenticateAdmin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { rawCsrfToken, csrfTokenHash } = await adminAuthService.refreshCsrfToken(
          request.adminSession!.sessionId,
        );
        request.adminSession!.csrfTokenHash = csrfTokenHash;

        return reply.status(200).send({
          user: {
            id: request.adminSession!.adminId,
            username: request.adminSession!.username,
            role: request.adminSession!.role,
          },
          csrf_token: rawCsrfToken,
        });
      },
    );

    // GET /api/v1/admin/incidents (Queue Listing)
    api.get(
      '/api/v1/admin/incidents',
      { preHandler: [authenticateAdmin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const queryParams = request.query as {
          status?: string;
          category?: string;
          page?: string;
          limit?: string;
        };
        const { status, category, page, limit } = queryParams;

        let parsedStatus: IncidentStatus | undefined = undefined;
        if (status && status !== 'ALL') {
          const sRes = IncidentStatusSchema.safeParse(status);
          if (sRes.success) {
            parsedStatus = sRes.data;
          }
        }

        const queue = await adminIncidentService.getQueue({
          status: parsedStatus,
          category,
          page: page ? parseInt(page, 10) : 1,
          limit: limit ? parseInt(limit, 10) : 25,
        });

        return reply.status(200).send(queue);
      },
    );

    // GET /api/v1/admin/incidents/:id (Detail Inspection)
    api.get(
      '/api/v1/admin/incidents/:id',
      { preHandler: [authenticateAdmin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const detail = await adminIncidentService.getIncidentDetails(id);
        if (!detail) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Incident not found.',
            },
          });
        }
        return reply.status(200).send(detail);
      },
    );

    // POST /api/v1/admin/incidents/:id/claim
    api.post(
      '/api/v1/admin/incidents/:id/claim',
      { preHandler: [authenticateAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const body = request.body as { reason?: string } | undefined;
        const reason = (body && body.reason) || undefined;

        try {
          const detail = await adminIncidentService.claimIncident(
            id,
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            request.id,
            reason,
          );
          return reply.status(200).send(detail);
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'INCIDENT_NOT_FOUND') {
            return reply
              .status(404)
              .send({ error: { code: 'NOT_FOUND', message: 'Incident not found.' } });
          }
          if (message?.startsWith('CANNOT_CLAIM_STATUS')) {
            return reply.status(400).send({ error: { code: 'INVALID_STATUS', message } });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/incidents/:id/activate
    api.post(
      '/api/v1/admin/incidents/:id/activate',
      { preHandler: [authenticateAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const parseResult = ActivateIncidentRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid incident activation request.',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const detail = await adminIncidentService.activateIncident(
            id,
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            parseResult.data,
            request.id,
          );
          return reply.status(200).send(detail);
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'INCIDENT_NOT_FOUND') {
            return reply
              .status(404)
              .send({ error: { code: 'NOT_FOUND', message: 'Incident not found.' } });
          }
          if (message?.startsWith('CANNOT_ACTIVATE_STATUS')) {
            return reply.status(400).send({ error: { code: 'INVALID_STATUS', message } });
          }
          if (message?.startsWith('CANNOT_REACTIVATE_EXPIRED')) {
            return reply.status(400).send({ error: { code: 'CANNOT_REACTIVATE_EXPIRED', message } });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/incidents/:id/resolve
    api.post(
      '/api/v1/admin/incidents/:id/resolve',
      { preHandler: [authenticateAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const parseResult = ResolveIncidentRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Resolution reason is required (min 3 characters).',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const detail = await adminIncidentService.resolveIncident(
            id,
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            parseResult.data,
            request.id,
          );
          return reply.status(200).send(detail);
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'INCIDENT_NOT_FOUND') {
            return reply
              .status(404)
              .send({ error: { code: 'NOT_FOUND', message: 'Incident not found.' } });
          }
          if (message?.startsWith('CANNOT_RESOLVE_STATUS')) {
            return reply.status(400).send({ error: { code: 'INVALID_STATUS', message } });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/incidents/:id/reject
    api.post(
      '/api/v1/admin/incidents/:id/reject',
      { preHandler: [authenticateAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const parseResult = RejectIncidentRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Rejection reason is required (min 3 characters).',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const detail = await adminIncidentService.rejectIncident(
            id,
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            parseResult.data,
            request.id,
          );
          return reply.status(200).send(detail);
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'INCIDENT_NOT_FOUND') {
            return reply
              .status(404)
              .send({ error: { code: 'NOT_FOUND', message: 'Incident not found.' } });
          }
          if (message?.startsWith('CANNOT_REJECT_STATUS')) {
            return reply.status(400).send({ error: { code: 'INVALID_STATUS', message } });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/incidents/:id/retention-hold
    api.post(
      '/api/v1/admin/incidents/:id/retention-hold',
      { preHandler: [authenticateAdmin, requireSuperAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const parseResult = RetentionHoldRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Retention hold status and reason (min 5 characters) are required.',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const detail = await adminIncidentService.setRetentionHold(
            id,
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
              role: request.adminSession!.role,
            },
            parseResult.data,
            request.id,
          );
          return reply.status(200).send(detail);
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'INCIDENT_NOT_FOUND') {
            return reply
              .status(404)
              .send({ error: { code: 'NOT_FOUND', message: 'Incident not found.' } });
          }
          if (message === 'SUPERADMIN_REQUIRED') {
            return reply
              .status(403)
              .send({ error: { code: 'FORBIDDEN', message: 'SUPERADMIN role required.' } });
          }
          throw err;
        }
      },
    );

    // PATCH /api/v1/admin/incidents/:id/summary (G2.3: Revise Safe Public Summary)
    api.patch(
      '/api/v1/admin/incidents/:id/summary',
      { preHandler: [authenticateAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        if (!UUID_V4_REGEX.test(id)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Incident ID must be a valid UUIDv4.',
            },
          });
        }

        const parseResult = ReviseIncidentSummaryRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request payload validation failed.',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const detail = await adminIncidentService.reviseIncidentSummary(
            id,
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            parseResult.data,
            request.id,
          );
          return reply.status(200).send(detail);
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'INCIDENT_NOT_FOUND') {
            return reply.status(404).send({
              error: { code: 'NOT_FOUND', message: 'Incident not found.' },
            });
          }
          if (message.startsWith('VERSION_CONFLICT')) {
            return reply.status(409).send({
              error: { code: 'VERSION_CONFLICT', message },
            });
          }
          if (message.startsWith('CANNOT_REVISE_STATUS')) {
            return reply.status(400).send({
              error: { code: 'VALIDATION_ERROR', message },
            });
          }
          if (message.startsWith('PROHIBITED_PII_DETECTED:')) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: message.replace('PROHIBITED_PII_DETECTED: ', ''),
              },
            });
          }
          if (message === 'REASON_REQUIRED') {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'A meaningful administrative reason (min 3 characters) is required.',
              },
            });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/incidents/:id/override-coordinates (Explicit Coordinate Override)
    api.post(
      '/api/v1/admin/incidents/:id/override-coordinates',
      { preHandler: [authenticateAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        if (!UUID_V4_REGEX.test(id)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Incident ID must be a valid UUIDv4.',
            },
          });
        }

        const parseResult = OverrideIncidentCoordinatesRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid coordinate override request.',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const detail = await adminIncidentService.overrideCoordinates(
            id,
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            parseResult.data,
            request.id,
          );
          return reply.status(200).send(detail);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (message === 'INCIDENT_NOT_FOUND') {
            return reply.status(404).send({
              error: {
                code: 'NOT_FOUND',
                message: 'Incident not found.',
              },
            });
          }
          if (message.startsWith('VERSION_CONFLICT')) {
            return reply.status(409).send({
              error: {
                code: 'VERSION_CONFLICT',
                message: message,
              },
            });
          }
          if (message.startsWith('CANNOT_OVERRIDE_TERMINAL')) {
            return reply.status(409).send({
              error: {
                code: 'TERMINAL_STATE',
                message: message,
              },
            });
          }
          if (message === 'REASON_REQUIRED') {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'A meaningful administrative reason (min 3 characters) is required.',
              },
            });
          }
          if (message.startsWith('INVALID_COORDINATES')) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: message,
              },
            });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/incidents/:id/reports/:reportId/unlink (G2.3: Unlink Report & Split)
    api.post(
      '/api/v1/admin/incidents/:id/reports/:reportId/unlink',
      { preHandler: [authenticateAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id, reportId } = request.params as { id: string; reportId: string };
        if (!UUID_V4_REGEX.test(id) || !UUID_V4_REGEX.test(reportId)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Incident ID and Report ID must be valid UUIDv4 strings.',
            },
          });
        }

        const parseResult = UnlinkReportRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request payload validation failed.',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const result = await adminIncidentService.unlinkReport(
            id,
            reportId,
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            parseResult.data,
            request.id,
          );
          return reply.status(200).send({
            message: 'Report unlinked and new pending incident created successfully.',
            sourceIncident: result.sourceIncident,
            newIncident: result.newIncident,
          });
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'INCIDENT_NOT_FOUND') {
            return reply.status(404).send({
              error: { code: 'NOT_FOUND', message: 'Incident not found.' },
            });
          }
          if (message === 'REPORT_NOT_FOUND') {
            return reply.status(404).send({
              error: { code: 'NOT_FOUND', message: 'Report not found.' },
            });
          }
          if (message === 'REPORT_NOT_LINKED_TO_INCIDENT') {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'The specified report is not associated with this incident.',
              },
            });
          }
          if (message.startsWith('VERSION_CONFLICT')) {
            return reply.status(409).send({
              error: { code: 'VERSION_CONFLICT', message },
            });
          }
          if (message === 'REASON_REQUIRED') {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'A meaningful administrative reason (min 3 characters) is required.',
              },
            });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/incidents/:id/merge-report (G2.3: Manual Report Merge)
    api.post(
      '/api/v1/admin/incidents/:id/merge-report',
      { preHandler: [authenticateAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        if (!UUID_V4_REGEX.test(id)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Target incident ID must be a valid UUIDv4.',
            },
          });
        }

        const parseResult = MergeReportRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request payload validation failed.',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const result = await adminIncidentService.mergeReport(
            id,
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            parseResult.data,
            request.id,
          );
          return reply.status(200).send({
            message: 'Report merged into destination incident successfully.',
            targetIncident: result.targetIncident,
            sourceIncident: result.sourceIncident,
          });
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (
            message === 'REPORT_NOT_LINKED' ||
            message === 'SOURCE_INCIDENT_NOT_FOUND' ||
            message === 'TARGET_INCIDENT_NOT_FOUND'
          ) {
            return reply.status(404).send({
              error: { code: 'NOT_FOUND', message },
            });
          }
          if (message.startsWith('CANNOT_MERGE_SAME_INCIDENT')) {
            return reply.status(400).send({
              error: { code: 'VALIDATION_ERROR', message },
            });
          }
          if (
            message.startsWith('SOURCE_VERSION_CONFLICT') ||
            message.startsWith('TARGET_VERSION_CONFLICT')
          ) {
            return reply.status(409).send({
              error: { code: 'VERSION_CONFLICT', message },
            });
          }
          if (message.startsWith('INCOMPATIBLE_INCIDENT_STATUS')) {
            return reply.status(400).send({
              error: { code: 'VALIDATION_ERROR', message },
            });
          }
          if (message.startsWith('CANNOT_MERGE_TERMINAL_INCIDENT')) {
            return reply.status(400).send({
              error: { code: 'VALIDATION_ERROR', message },
            });
          }
          if (message === 'REASON_REQUIRED') {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'A meaningful administrative reason (min 3 characters) is required.',
              },
            });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/purge-retention (Manual Superadmin Trigger)
    api.post(
      '/api/v1/admin/purge-retention',
      { preHandler: [authenticateAdmin, requireSuperAdmin, requireCsrfAndOrigin] },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const result = await adminIncidentService.purgeExpiredIncidents();
        return reply.status(200).send({
          status: 'COMPLETED',
          purgedIncidentCount: result.purgedIncidentCount,
          purgedReportCount: result.purgedReportCount,
          timestamp: new Date().toISOString(),
        });
      },
    );

    // GET /api/v1/admin/users (List Administrative Accounts - Superadmin Only)
    api.get(
      '/api/v1/admin/users',
      { preHandler: [authenticateAdmin, requireSuperAdmin] },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const users = await adminUserService.listUsers();
        return reply.status(200).send({ users });
      },
    );

    // POST /api/v1/admin/users (Create Moderator - Superadmin Only)
    api.post(
      '/api/v1/admin/users',
      { preHandler: [authenticateAdmin, requireSuperAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const parseResult = CreateModeratorRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request payload validation failed.',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const user = await adminUserService.createModerator(
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            parseResult.data,
            request.id,
          );
          return reply.status(201).send({
            user,
            message: 'Moderator account created successfully.',
          });
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'DUPLICATE_USERNAME') {
            return reply.status(409).send({
              error: {
                code: 'DUPLICATE_USERNAME',
                message: 'An administrative account with this username already exists.',
              },
            });
          }
          if (message === 'RESERVED_USERNAME') {
            return reply.status(400).send({
              error: {
                code: 'RESERVED_USERNAME',
                message: 'The username "ALERTadmin" is reserved and cannot be created.',
              },
            });
          }
          if (message.startsWith('PASSWORD_POLICY_VIOLATION:')) {
            return reply.status(400).send({
              error: {
                code: 'WEAK_PASSWORD',
                message: message.replace('PASSWORD_POLICY_VIOLATION: ', ''),
              },
            });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/users/:id/revoke (Revoke Moderator & Active Sessions - Superadmin Only)
    api.post(
      '/api/v1/admin/users/:id/revoke',
      { preHandler: [authenticateAdmin, requireSuperAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        if (!UUID_V4_REGEX.test(id)) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_USER_ID',
              message: 'User ID must be a valid UUIDv4.',
            },
          });
        }

        const parseResult = RevokeModeratorRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request payload validation failed.',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const user = await adminUserService.revokeModerator(
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            id,
            parseResult.data.reason,
            request.id,
          );
          return reply.status(200).send({
            user,
            message: 'Moderator account deactivated and all active sessions revoked.',
          });
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'USER_NOT_FOUND') {
            return reply.status(404).send({
              error: {
                code: 'NOT_FOUND',
                message: 'Administrative user not found.',
              },
            });
          }
          if (message === 'CANNOT_REVOKE_SUPERADMIN') {
            return reply.status(403).send({
              error: {
                code: 'FORBIDDEN',
                message: 'The bootstrap superadmin ALERTadmin cannot be deactivated or revoked.',
              },
            });
          }
          if (message === 'CANNOT_REVOKE_SELF') {
            return reply.status(400).send({
              error: {
                code: 'INVALID_ACTION',
                message: 'Administrators cannot revoke their own account.',
              },
            });
          }
          throw err;
        }
      },
    );

    // POST /api/v1/admin/users/:id/reset-password (Reset Moderator Password & Revoke Sessions - Superadmin Only)
    api.post(
      '/api/v1/admin/users/:id/reset-password',
      { preHandler: [authenticateAdmin, requireSuperAdmin, requireCsrfAndOrigin] },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        if (!UUID_V4_REGEX.test(id)) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_USER_ID',
              message: 'User ID must be a valid UUIDv4.',
            },
          });
        }

        const parseResult = ResetModeratorPasswordRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request payload validation failed.',
              details: parseResult.error.format(),
            },
          });
        }

        try {
          const user = await adminUserService.resetModeratorPassword(
            {
              id: request.adminSession!.adminId,
              username: request.adminSession!.username,
            },
            id,
            parseResult.data.new_password,
            parseResult.data.reason,
            request.id,
          );
          return reply.status(200).send({
            user,
            message: 'Moderator password reset successfully and active sessions invalidated.',
          });
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message === 'USER_NOT_FOUND') {
            return reply.status(404).send({
              error: {
                code: 'NOT_FOUND',
                message: 'Administrative user not found.',
              },
            });
          }
          if (message === 'CANNOT_RESET_SUPERADMIN_VIA_API') {
            return reply.status(403).send({
              error: {
                code: 'FORBIDDEN',
                message:
                  'The bootstrap superadmin credentials cannot be reset via the API. Use the bootstrap CLI script.',
              },
            });
          }
          if (message.startsWith('PASSWORD_POLICY_VIOLATION:')) {
            return reply.status(400).send({
              error: {
                code: 'WEAK_PASSWORD',
                message: message.replace('PASSWORD_POLICY_VIOLATION: ', ''),
              },
            });
          }
          throw err;
        }
      },
    );
  });

  // Background retention purge scheduler
  if (config.ENABLE_BACKGROUND_PURGE) {
    let isPurging = false;
    let timer: NodeJS.Timeout | null = null;
    let initialTimer: NodeJS.Timeout | null = null;

    const runPurge = async () => {
      if (isPurging) return;
      isPurging = true;

      const pool = initPool(config);
      let client;
      let lockAcquired = false;

      try {
        client = await pool.connect();
        const lockRes = await client.query<{ acquired: boolean }>(
          `SELECT pg_try_advisory_lock(hashtext('YCT_ALERT_RETENTION_PURGE_TASK')) AS acquired`,
        );
        lockAcquired = lockRes.rows[0]?.acquired === true;

        if (!lockAcquired) {
          app.log.debug(
            '[retention-purge] Another worker is currently executing retention purge. Skipping.',
          );
          return;
        }

        const result = await adminIncidentService.purgeExpiredIncidents();
        if (result.purgedIncidentCount > 0) {
          app.log.info(
            `[retention-purge] Purged ${result.purgedIncidentCount} expired incidents and ${result.purgedReportCount} raw reports.`,
          );
        }
      } catch (err) {
        app.log.error({ err }, '[retention-purge] Error during scheduled retention purge');
      } finally {
        if (lockAcquired && client) {
          try {
            await client.query(
              `SELECT pg_advisory_unlock(hashtext('YCT_ALERT_RETENTION_PURGE_TASK'))`,
            );
          } catch (unlockErr) {
            app.log.error({ unlockErr }, '[retention-purge] Error releasing advisory lock');
          }
        }
        if (client) client.release();
        isPurging = false;
      }
    };

    initialTimer = setTimeout(() => {
      runPurge();
      const intervalMs = config.RETENTION_PURGE_INTERVAL_HOURS * 60 * 60 * 1000;
      timer = setInterval(runPurge, intervalMs);
    }, 60 * 1000);

    app.addHook('onClose', async () => {
      if (initialTimer) clearTimeout(initialTimer);
      if (timer) clearInterval(timer);
    });
  }

  // Load persisted campus geography snapshot into memory before Fastify accepts requests
  app.addHook('onReady', async () => {
    try {
      await geoSync.loadPersistedSnapshot();
      app.log.info('[geography] Campus geography snapshot loaded into memory on startup.');
    } catch (err) {
      app.log.error({ err }, '[geography] Failed to load snapshot into memory on startup');
    }
  });

  // Scheduled campus geography synchronization worker (G3.1)
  if (config.ENABLE_GEOGRAPHY_SYNC) {
    app.addHook('onReady', async () => {
      geoSync.startScheduledSync().catch((err) => {
        app.log.error({ err }, '[geography-sync] Failed to start scheduled sync');
      });
    });

    app.addHook('onClose', async () => {
      geoSync.stopScheduledSync();
    });
  }

  return app;
}
