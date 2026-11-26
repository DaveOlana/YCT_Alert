export const OPENAPI_SPECIFICATION = {
  openapi: '3.1.0',
  info: {
    title: 'YCT Alert API',
    version: '0.1.0',
    description:
      'Independent campus incident-reporting and public-safety awareness platform for Yaba College of Technology (YABATECH).',
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local development server',
    },
  ],
  paths: {
    '/health/live': {
      get: {
        summary: 'Process liveness probe',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Process is live',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    uptime_seconds: { type: 'number' },
                  },
                  required: ['status', 'uptime_seconds'],
                },
              },
            },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        summary: 'Service readiness probe (checks database and storage)',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Service is ready to handle traffic',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ready' },
                    database: { type: 'string', example: 'connected' },
                    snapshot_status: { type: 'string', example: 'HEALTHY' },
                  },
                  required: ['status', 'database'],
                },
              },
            },
          },
          '503': {
            description: 'Service is unavailable',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/taxonomy': {
      get: {
        summary: 'List approved incident categories',
        tags: ['Public'],
        responses: {
          '200': {
            description: 'Catalogue of approved incident categories',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    categories: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          code: { type: 'string' },
                          label: { type: 'string' },
                          description: { type: 'string' },
                          urgencyLevel: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM'] },
                          icon: { type: 'string' },
                        },
                        required: ['code', 'label', 'description', 'urgencyLevel', 'icon'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/places/': {
      get: {
        summary: 'List campus places from local YCT Map snapshot',
        tags: ['Public', 'Geography'],
        parameters: [
          {
            name: 'q',
            in: 'query',
            description: 'Search query matching place name or aliases',
            required: false,
            schema: { type: 'string', maxLength: 80 },
          },
          {
            name: 'category',
            in: 'query',
            description: 'Filter by place category slug or name',
            required: false,
            schema: { type: 'string', maxLength: 50 },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum number of places to return (default 50, max 200)',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        ],
        responses: {
          '200': {
            description: 'List of campus places from local snapshot',
            headers: {
              'Cache-Control': {
                schema: { type: 'string' },
                description: 'Cache directives: public, max-age=30, stale-while-revalidate=120',
              },
              'X-Geography-Stale': {
                schema: { type: 'boolean' },
                description: 'True if snapshot is currently stale (>2 hours without successful sync)',
              },
              'X-Geography-Degraded': {
                schema: { type: 'boolean' },
                description: 'True if the latest background sync attempt failed but last-known-good snapshot is served',
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CampusPlacesListResponse' },
              },
            },
          },
          '503': {
            description: 'Geography snapshot is not yet loaded into memory or database snapshot is empty',
            headers: {
              'Cache-Control': {
                schema: { type: 'string' },
                description: 'Cache directive: no-store',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'object',
                      properties: {
                        code: { type: 'string', example: 'GEOGRAPHY_UNAVAILABLE' },
                        message: { type: 'string' },
                      },
                      required: ['code', 'message'],
                    },
                  },
                  required: ['error'],
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/reports': {
      post: {
        summary: 'Submit an anonymous incident report',
        tags: ['Public'],
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            description: 'Client-generated UUIDv4 to safely retry requests without duplication',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateReportRequest' },
            },
          },
        },
        responses: {
          '202': {
            description: 'Report accepted and queued for review',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateReportResponse' },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '409': {
            description: 'Idempotency key reused with different payload',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '429': {
            description: 'Rate limit exceeded',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/reports/receipts/{receipt_id}': {
      get: {
        summary: 'Check report delivery and public lifecycle status',
        tags: ['Public'],
        parameters: [
          {
            name: 'receipt_id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'Authorization',
            in: 'header',
            required: true,
            description: 'Bearer {receipt_token} generated upon report acceptance',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Receipt status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReceiptStatusResponse' },
              },
            },
          },
          '403': {
            description: 'Invalid or missing bearer token',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '404': {
            description: 'Receipt not found',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/incidents/active/': {
      get: {
        summary: 'Public GeoJSON feed of approved ACTIVE incidents',
        tags: ['Public'],
        responses: {
          '200': {
            description: 'GeoJSON FeatureCollection of safe active incident points',
            content: {
              'application/geo+json': {
                schema: { $ref: '#/components/schemas/PublicActiveIncidentsGeoJSON' },
              },
            },
          },
        },
      },
    },
    '/api/v1/incidents/public/{public_id}': {
      get: {
        summary: 'Public details of an eligible ACTIVE incident',
        tags: ['Public'],
        parameters: [
          {
            name: 'public_id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Public incident details payload',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PublicIncidentDetailResponse' },
              },
            },
          },
          '404': {
            description: 'Incident not found or is not publicly accessible',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
        },
      },
    },
    '/api/v1/admin/auth/login': {
      post: {
        summary: 'Administrative login creating authenticated session',
        tags: ['Admin', 'Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string' },
                },
                required: ['username', 'password'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        username: { type: 'string' },
                        role: { type: 'string', enum: ['SUPERADMIN', 'MODERATOR'] },
                      },
                      required: ['id', 'username', 'role'],
                    },
                    csrf_token: { type: 'string' },
                  },
                  required: ['user', 'csrf_token'],
                },
              },
            },
          },
          '401': { description: 'Invalid credentials' },
          '429': { description: 'Brute-force rate limit exceeded' },
        },
      },
    },
    '/api/v1/admin/auth/logout': {
      post: {
        summary: 'Revoke active administrative session and clear cookie',
        tags: ['Admin', 'Auth'],
        responses: {
          '200': { description: 'Session revoked' },
        },
      },
    },
    '/api/v1/admin/auth/me': {
      get: {
        summary: 'Retrieve currently authenticated admin user profile',
        tags: ['Admin', 'Auth'],
        responses: {
          '200': {
            description: 'Current session user',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        username: { type: 'string' },
                        role: { type: 'string', enum: ['SUPERADMIN', 'MODERATOR'] },
                      },
                      required: ['id', 'username', 'role'],
                    },
                    csrf_token: { type: 'string' },
                  },
                  required: ['user'],
                },
              },
            },
          },
          '401': { description: 'Unauthenticated or session expired' },
        },
      },
    },
    '/api/v1/admin/incidents': {
      get: {
        summary: 'List incidents in moderation queue with status and category filtering',
        tags: ['Admin'],
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['PENDING', 'UNDER_REVIEW', 'ACTIVE', 'RESOLVED', 'REJECTED'],
            },
          },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
        ],
        responses: {
          '200': {
            description: 'Incident queue listing',
          },
          '401': { description: 'Unauthenticated' },
        },
      },
    },
    '/api/v1/admin/incidents/{id}': {
      get: {
        summary:
          'Retrieve detailed incident review record including linked reports and audit history',
        tags: ['Admin'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Incident detail record' },
          '401': { description: 'Unauthenticated' },
          '404': { description: 'Incident not found' },
        },
      },
    },
    '/api/v1/admin/incidents/{id}/claim': {
      post: {
        summary: 'Explicitly claim triage of a pending incident',
        tags: ['Admin'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Incident claimed successfully' },
          '400': { description: 'Incident cannot be claimed in current status' },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'CSRF validation failed' },
          '404': { description: 'Incident not found' },
        },
      },
    },
    '/api/v1/admin/incidents/{id}/activate': {
      post: {
        summary: 'Approve and activate an incident for public safety broadcast',
        tags: ['Admin'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ActivateIncidentRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Incident successfully activated and broadcast to public feed',
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
            },
          },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Incident not found' },
        },
      },
    },
    '/api/v1/admin/incidents/{id}/resolve': {
      post: {
        summary: 'Mark an active incident as RESOLVED with mandatory resolution reason',
        tags: ['Admin'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResolveIncidentRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Incident resolved. Begins 30-day post-resolution retention clock.',
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Incident not found' },
        },
      },
    },
    '/api/v1/admin/incidents/{id}/reject': {
      post: {
        summary: 'Reject an incident report with mandatory rejection reason',
        tags: ['Admin'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RejectIncidentRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Incident rejected.',
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Incident not found' },
        },
      },
    },
    '/api/v1/admin/incidents/{id}/retention-hold': {
      post: {
        summary:
          'Apply or release an administrative retention hold to preserve incident data indefinitely',
        tags: ['Admin'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RetentionHoldRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Retention hold status updated.',
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Incident not found' },
        },
      },
    },
    '/api/v1/admin/incidents/{id}/summary': {
      patch: {
        summary: 'Revise public safe summary of an active incident with PII guardrail validation',
        tags: ['Admin'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ReviseIncidentSummaryRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Summary revised successfully' },
          '400': { description: 'Validation error or prohibited PII detected' },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'Forbidden / CSRF failure' },
          '404': { description: 'Incident not found' },
          '409': { description: 'Version conflict' },
        },
      },
    },
    '/api/v1/admin/incidents/{id}/reports/{reportId}/unlink': {
      post: {
        summary: 'Unlink report from incident and create a separate PENDING incident',
        tags: ['Admin'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'reportId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnlinkReportRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Report unlinked and new incident created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'Forbidden / CSRF failure' },
          '404': { description: 'Incident or report not found' },
          '409': { description: 'Version conflict' },
        },
      },
    },
    '/api/v1/admin/incidents/{id}/merge-report': {
      post: {
        summary:
          'Manually move an existing report from its source incident into this destination incident',
        tags: ['Admin'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MergeReportRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Report merged into destination incident' },
          '400': { description: 'Validation error or incompatible incident statuses' },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'Forbidden / CSRF failure' },
          '404': { description: 'Incident or report not found' },
          '409': { description: 'Version conflict' },
        },
      },
    },
    '/api/v1/admin/sync-geography': {
      post: {
        summary: 'Trigger an immediate on-demand synchronization with YCT Map catalogue',
        tags: ['Admin', 'Geography'],
        responses: {
          '200': {
            description: 'Synchronization initiated or completed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GeographySyncMeta' },
              },
            },
          },
          '401': { description: 'Unauthenticated' },
          '403': { description: 'Forbidden' },
          '503': { description: 'Upstream YCT Map unavailable; snapshot preserved' },
        },
      },
    },
  },
  components: {
    schemas: {
      CreateReportRequest: {
        type: 'object',
        properties: {
          category_code: {
            type: 'string',
            enum: [
              'FIRE_OR_SMOKE',
              'MEDICAL_EMERGENCY',
              'PHYSICAL_HAZARD',
              'SECURITY_INCIDENT',
              'OTHER_URGENT',
            ],
          },
          description: { type: 'string', minLength: 5, maxLength: 1000 },
          incident_location: {
            type: 'object',
            properties: {
              latitude: { type: 'number', minimum: -90, maximum: 90, nullable: true },
              longitude: { type: 'number', minimum: -180, maximum: 180, nullable: true },
              source: {
                type: 'string',
                enum: ['MANUAL_POINT', 'MAP_PLACE', 'DEVICE_GPS', 'TEXT_ONLY'],
              },
              yct_map_place_id: { type: 'string', format: 'uuid', nullable: true },
              place_name_snapshot: { type: 'string', maxLength: 160, nullable: true },
              landmark_description: { type: 'string', maxLength: 300, nullable: true },
            },
            required: ['source'],
          },
          website_url: { type: 'string', description: 'Honeypot field (must be empty)' },
        },
        required: ['category_code', 'description', 'incident_location'],
      },
      CreateReportResponse: {
        type: 'object',
        properties: {
          receipt_id: { type: 'string' },
          receipt_token: { type: 'string', description: 'One-time CSPRNG bearer token' },
          delivery_status: { type: 'string', enum: ['RECEIVED'] },
          received_at: { type: 'string', format: 'date-time' },
          message: { type: 'string' },
        },
        required: ['receipt_id', 'receipt_token', 'delivery_status', 'received_at', 'message'],
      },
      ReceiptStatusResponse: {
        type: 'object',
        properties: {
          receipt_id: { type: 'string' },
          delivery_status: {
            type: 'string',
            enum: ['RECEIVED', 'UNDER_REVIEW', 'PUBLISHED', 'RESOLVED', 'REJECTED'],
          },
          category: { type: 'string' },
          received_at: { type: 'string', format: 'date-time' },
          public_advisory_id: { type: 'string', nullable: true },
        },
        required: ['receipt_id', 'delivery_status', 'category', 'received_at'],
      },
      PublicIncidentFeatureProperties: {
        type: 'object',
        properties: {
          public_id: { type: 'string' },
          category: {
            type: 'string',
            enum: [
              'FIRE_OR_SMOKE',
              'MEDICAL_EMERGENCY',
              'PHYSICAL_HAZARD',
              'SECURITY_INCIDENT',
              'OTHER_URGENT',
            ],
          },
          status: { type: 'string', enum: ['ACTIVE'] },
          summary: { type: 'string' },
          place_name: { type: 'string', nullable: true },
          published_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          public_photo_url: { type: 'string', format: 'uri', nullable: true },
        },
        required: ['public_id', 'category', 'status', 'summary', 'published_at', 'updated_at'],
      },
      PublicIncidentLocation: {
        type: 'object',
        properties: {
          coordinates: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
            nullable: true,
            description: '[longitude, latitude] per RFC 7946, or null for text-only incidents',
          },
          place_name: { type: 'string', nullable: true },
          landmark_description: { type: 'string', nullable: true },
          yct_map_place_id: { type: 'string', format: 'uuid', nullable: true },
        },
        required: ['coordinates', 'place_name', 'landmark_description', 'yct_map_place_id'],
      },
      PublicIncidentTimestamps: {
        type: 'object',
        properties: {
          reported_at: { type: 'string', format: 'date-time' },
          activated_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
        required: ['reported_at', 'activated_at', 'updated_at'],
      },
      PublicIncidentDetailResponse: {
        type: 'object',
        properties: {
          public_id: { type: 'string' },
          category: {
            type: 'string',
            enum: [
              'FIRE_OR_SMOKE',
              'MEDICAL_EMERGENCY',
              'PHYSICAL_HAZARD',
              'SECURITY_INCIDENT',
              'OTHER_URGENT',
            ],
          },
          status: { type: 'string', enum: ['ACTIVE'] },
          summary: { type: 'string' },
          location: { $ref: '#/components/schemas/PublicIncidentLocation' },
          timestamps: { $ref: '#/components/schemas/PublicIncidentTimestamps' },
          photos: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        required: [
          'public_id',
          'category',
          'status',
          'summary',
          'location',
          'timestamps',
          'photos',
        ],
      },
      PublicIncidentFeature: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['Feature'] },
          id: { type: 'string' },
          geometry: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['Point'] },
              coordinates: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description: '[longitude, latitude] per RFC 7946',
              },
            },
            required: ['type', 'coordinates'],
          },
          properties: {
            $ref: '#/components/schemas/PublicIncidentFeatureProperties',
          },
        },
        required: ['type', 'id', 'geometry', 'properties'],
      },
      PublicActiveIncidentsGeoJSON: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['FeatureCollection'] },
          features: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/PublicIncidentFeature',
            },
          },
          generated_at: { type: 'string', format: 'date-time' },
        },
        required: ['type', 'features', 'generated_at'],
      },
      ActivateIncidentRequest: {
        type: 'object',
        properties: {
          safe_summary: { type: 'string', minLength: 10, maxLength: 500 },
          display_latitude: { type: 'number', minimum: -90, maximum: 90 },
          display_longitude: { type: 'number', minimum: -180, maximum: 180 },
          safe_location_id: { type: 'string', format: 'uuid' },
          approve_photo: { type: 'boolean', default: false },
          reason: { type: 'string', maxLength: 300 },
        },
        required: ['safe_summary'],
      },
      ResolveIncidentRequest: {
        type: 'object',
        properties: {
          resolution_reason: { type: 'string', minLength: 3, maxLength: 500 },
        },
        required: ['resolution_reason'],
      },
      RejectIncidentRequest: {
        type: 'object',
        properties: {
          rejection_reason: { type: 'string', minLength: 3, maxLength: 500 },
        },
        required: ['rejection_reason'],
      },
      RetentionHoldRequest: {
        type: 'object',
        properties: {
          retention_hold: { type: 'boolean' },
          reason: { type: 'string', minLength: 5, maxLength: 500 },
        },
        required: ['retention_hold', 'reason'],
      },
      ReviseIncidentSummaryRequest: {
        type: 'object',
        properties: {
          safe_summary: { type: 'string', minLength: 10, maxLength: 500 },
          reason: { type: 'string', minLength: 3, maxLength: 500 },
          expected_version: { type: 'integer', minimum: 1 },
        },
        required: ['safe_summary', 'reason', 'expected_version'],
      },
      UnlinkReportRequest: {
        type: 'object',
        properties: {
          reason: { type: 'string', minLength: 3, maxLength: 500 },
          expected_version: { type: 'integer', minimum: 1 },
        },
        required: ['reason', 'expected_version'],
      },
      MergeReportRequest: {
        type: 'object',
        properties: {
          report_id: { type: 'string', format: 'uuid' },
          reason: { type: 'string', minLength: 3, maxLength: 500 },
          expected_version: { type: 'integer', minimum: 1 },
          source_expected_version: { type: 'integer', minimum: 1 },
        },
        required: ['report_id', 'reason', 'expected_version', 'source_expected_version'],
      },
      CampusEntrance: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
        },
        required: ['id', 'name', 'latitude', 'longitude'],
      },
      CampusPlace: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          category_slug: { type: 'string' },
          category_name: { type: 'string' },
          coordinates: {
            type: 'object',
            properties: {
              latitude: { type: 'number', minimum: -90, maximum: 90 },
              longitude: { type: 'number', minimum: -180, maximum: 180 },
            },
            required: ['latitude', 'longitude'],
          },
          primary_entrance: {
            $ref: '#/components/schemas/CampusEntrance',
            nullable: true,
          },
          verification_state: { type: 'string' },
          aliases: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
          is_active: { type: 'boolean', default: true },
        },
        required: [
          'id',
          'name',
          'category_slug',
          'category_name',
          'coordinates',
          'verification_state',
          'is_active',
        ],
      },
      CampusPlacesListResponse: {
        type: 'object',
        properties: {
          places: {
            type: 'array',
            items: { $ref: '#/components/schemas/CampusPlace' },
          },
          total: { type: 'integer', minimum: 0 },
          snapshot_age_seconds: { type: 'integer', minimum: 0 },
          sync_status: {
            type: 'string',
            enum: ['HEALTHY', 'DEGRADED', 'STALE', 'FAILED'],
          },
        },
        required: ['places', 'total', 'snapshot_age_seconds', 'sync_status'],
      },
      GeographySyncMeta: {
        type: 'object',
        properties: {
          last_sync_attempt_at: { type: 'string', format: 'date-time' },
          last_successful_sync_at: { type: 'string', format: 'date-time', nullable: true },
          upstream_etag: { type: 'string', nullable: true },
          record_count: { type: 'integer', minimum: 0 },
          sync_status: {
            type: 'string',
            enum: ['HEALTHY', 'DEGRADED', 'STALE', 'FAILED'],
          },
        },
        required: ['last_sync_attempt_at', 'record_count', 'sync_status'],
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_ERROR',
                  'UNAUTHENTICATED',
                  'FORBIDDEN',
                  'NOT_FOUND',
                  'IDEMPOTENCY_KEY_REUSED',
                  'VERSION_CONFLICT',
                  'RATE_LIMITED',
                  'SERVICE_UNAVAILABLE',
                  'INTERNAL_ERROR',
                ],
              },
              message: { type: 'string' },
              request_id: { type: 'string' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    message: { type: 'string' },
                  },
                  required: ['message'],
                },
              },
            },
            required: ['code', 'message', 'request_id'],
          },
        },
        required: ['error'],
      },
    },
  },
} as const;
