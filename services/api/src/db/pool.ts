import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { validateDatabaseUrl, getActiveDatabaseUrl, type Environment } from '../config.js';

let poolInstance: Pool | null = null;

export function initPool(config: Environment): Pool {
  if (poolInstance) {
    return poolInstance;
  }

  const dbUrl = getActiveDatabaseUrl(config);
  validateDatabaseUrl(
    dbUrl,
    config.NODE_ENV === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL',
    config.NODE_ENV,
  );

  poolInstance = new Pool({
    connectionString: dbUrl,
    max: config.NODE_ENV === 'test' ? 5 : 20,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });

  poolInstance.on('error', (err) => {
    console.error('[db:pool] Unexpected error on idle client', err);
  });

  return poolInstance;
}

export function getPool(): Pool {
  if (!poolInstance) {
    throw new Error('Database pool has not been initialized. Call initPool() first.');
  }
  return poolInstance;
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

export async function isDatabaseConnected(): Promise<boolean> {
  try {
    if (!poolInstance) {
      return false;
    }
    await poolInstance.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  return getPool().query<R>(text, params);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
