import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

export const FORBIDDEN_DB_NAMES = ['yct_postgres', 'yctmap', 'yct_map'];
export const FORBIDDEN_PORTS = [5432, 55432];
export const ALLOWED_LOCAL_PORT = 55433;

export const DEFAULT_DEV_DATABASE_URL =
  'postgresql://alert_dev_user:alert_dev_password@127.0.0.1:55433/yct_alert_dev';
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://alert_test_user:alert_test_password@127.0.0.1:55433/yct_alert_test';
export const DEFAULT_ACCEPTANCE_DATABASE_URL =
  'postgresql://alert_accept_user:alert_accept_password@127.0.0.1:55433/yct_alert_acceptance';

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  );
}

export function validateDatabaseUrl(
  url: string | undefined,
  variableName: string = 'DATABASE_URL',
  env: string = process.env.NODE_ENV || 'development',
): string {
  if (!url) {
    if (variableName === 'TEST_DATABASE_URL' || env === 'test') {
      return DEFAULT_TEST_DATABASE_URL;
    }
    if (env === 'acceptance') {
      return DEFAULT_ACCEPTANCE_DATABASE_URL;
    }
    return DEFAULT_DEV_DATABASE_URL;
  }

  const lower = url.toLowerCase();
  for (const forbidden of FORBIDDEN_DB_NAMES) {
    if (lower.includes(forbidden)) {
      throw new Error(
        `CRITICAL SAFEGUARD VIOLATION: ${variableName} contains forbidden name "${forbidden}". ` +
          `YCT Alert must NEVER connect to, modify, or interfere with the existing YCT Map or yct_postgres database.`,
      );
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`CRITICAL SAFEGUARD VIOLATION: ${variableName} is not a valid URL: ${url}`);
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  const isLocal = isLocalHostname(parsed.hostname);

  if (isLocal) {
    if (FORBIDDEN_PORTS.includes(port)) {
      throw new Error(
        `CRITICAL SAFEGUARD VIOLATION: ${variableName} targets forbidden local port ${port}. ` +
          `Ports 5432 (yct_postgres) and 55432 (backend-experiment-postgres) are strictly off-limits. ` +
          `YCT Alert local database must use port ${ALLOWED_LOCAL_PORT}.`,
      );
    }

    if (env === 'development' || env === 'test' || env === 'acceptance') {
      if (port !== ALLOWED_LOCAL_PORT) {
        throw new Error(
          `CRITICAL SAFEGUARD VIOLATION: ${variableName} local database must target port ${ALLOWED_LOCAL_PORT} (yct-alert-postgres). ` +
            `Received port: ${port}.`,
        );
      }

      const dbName = parsed.pathname.replace(/^\//, '');
      if (variableName === 'DATABASE_URL' && env === 'development' && dbName !== 'yct_alert_dev') {
        throw new Error(
          `CRITICAL SAFEGUARD VIOLATION: DATABASE_URL in development must target database "yct_alert_dev". Received: "${dbName}".`,
        );
      }
      if ((variableName === 'TEST_DATABASE_URL' || env === 'test') && dbName !== 'yct_alert_test') {
        throw new Error(
          `CRITICAL SAFEGUARD VIOLATION: ${variableName} in test must target database "yct_alert_test". Received: "${dbName}".`,
        );
      }
      if (
        variableName === 'DATABASE_URL' &&
        env === 'acceptance' &&
        dbName !== 'yct_alert_acceptance'
      ) {
        throw new Error(
          `CRITICAL SAFEGUARD VIOLATION: DATABASE_URL in acceptance must target database "yct_alert_acceptance". Received: "${dbName}".`,
        );
      }
    }
  }

  if (env === 'production') {
    if (isLocal) {
      throw new Error(
        `CRITICAL SAFEGUARD VIOLATION: ${variableName} in production cannot target localhost or loopback address.`,
      );
    }
  }

  return url;
}

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'acceptance', 'production']).default('development'),
    API_PORT: z.coerce.number().default(4000),
    API_HOST: z.string().default('127.0.0.1'),
    API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
    DATABASE_URL: z.string().optional(),
    TEST_DATABASE_URL: z.string().optional(),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('./tmp/media_uploads'),
    YCT_MAP_BASE_URL: z.string().url().default('https://yct-map.onrender.com'),
    GEOGRAPHY_SYNC_INTERVAL_MINUTES: z.coerce.number().default(15),
    ADMIN_SESSION_SECRET: z.string().min(16).default('development-session-secret-min-16-chars'),
    ADMIN_BOOTSTRAP_SECRET: z.string().min(8).default('bootstrap-dev-token'),
    IDEMPOTENCY_REPLAY_SECRET: z
      .string()
      .min(32)
      .default('development-idempotency-replay-secret-32-chars-minimum'),
    IDEMPOTENCY_REPLAY_KEY_VERSION: z.coerce.number().default(1),
    TRUST_PROXY: z
      .union([z.boolean(), z.string()])
      .default(false)
      .transform((val) => val === true || val === 'true' || val === '1'),
    RATE_LIMIT_MAX: z.coerce.number().default(10),
    RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(15),
    ENABLE_BACKGROUND_PURGE: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (val !== undefined) return val === true || val === 'true' || val === '1';
        return process.env.NODE_ENV !== 'test';
      }),
    RETENTION_PURGE_INTERVAL_HOURS: z.coerce.number().default(24),
    ENABLE_GEOGRAPHY_SYNC: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (val !== undefined) return val === true || val === 'true' || val === '1';
        return process.env.NODE_ENV !== 'test';
      }),

    ALLOW_LOCAL_NON_TEST_REPORTS: z
      .union([z.boolean(), z.string()])
      .default(false)
      .transform((val) => val === true || val === 'true' || val === '1'),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default(
        'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,https://localhost',
      ),
  })
  .transform((env) => {
    const nodeEnv = env.NODE_ENV;
    const dbUrl = validateDatabaseUrl(
      env.DATABASE_URL,
      'DATABASE_URL',
      nodeEnv === 'test' ? 'development' : nodeEnv,
    );
    const testDbUrl = validateDatabaseUrl(env.TEST_DATABASE_URL, 'TEST_DATABASE_URL', 'test');

    if (nodeEnv === 'production') {
      if (!env.DATABASE_URL) {
        throw new Error('DATABASE_URL must be explicitly provided in production');
      }
      if (
        env.IDEMPOTENCY_REPLAY_SECRET === 'development-idempotency-replay-secret-32-chars-minimum'
      ) {
        throw new Error('IDEMPOTENCY_REPLAY_SECRET must be configured with a production secret');
      }
      if (env.ADMIN_SESSION_SECRET === 'development-session-secret-min-16-chars') {
        throw new Error('ADMIN_SESSION_SECRET must be configured with a production secret');
      }
      if (env.ADMIN_BOOTSTRAP_SECRET === 'bootstrap-dev-token') {
        throw new Error('ADMIN_BOOTSTRAP_SECRET must be configured with a production secret');
      }
      if (env.ALLOW_LOCAL_NON_TEST_REPORTS === true) {
        throw new Error(
          'CRITICAL SAFEGUARD VIOLATION: ALLOW_LOCAL_NON_TEST_REPORTS is strictly prohibited in production mode.',
        );
      }
    }

    return {
      ...env,
      DATABASE_URL: dbUrl,
      TEST_DATABASE_URL: testDbUrl,
    };
  });

export type Environment = z.infer<typeof EnvironmentSchema>;

export function loadConfig(overrides?: Record<string, string | undefined>): Environment {
  const envToParse = overrides ? { ...process.env, ...overrides } : process.env;
  return EnvironmentSchema.parse(envToParse);
}

export function getActiveDatabaseUrl(config: Environment): string {
  return config.NODE_ENV === 'test' ? config.TEST_DATABASE_URL : config.DATABASE_URL;
}
