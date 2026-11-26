import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDatabaseUrl,
  FORBIDDEN_DB_NAMES,
  loadConfig,
  DEFAULT_DEV_DATABASE_URL,
  DEFAULT_TEST_DATABASE_URL,
  DEFAULT_ACCEPTANCE_DATABASE_URL,
} from '../src/config.js';

test('Database Safeguard: Forbidden database names are rejected', () => {
  const forbiddenUrls = [
    'postgresql://alert:pass@localhost:55433/yct_postgres',
    'postgresql://alert:pass@localhost:55433/yctmap',
    'postgresql://alert:pass@localhost:55433/yct_map',
    'postgresql://alert:pass@localhost:55433/YCT_POSTGRES',
    'postgresql://alert:pass@localhost:55433/YctMap_db',
    'postgres://user:secret@10.0.0.1:5432/production_yctmap_replica',
    'postgresql://localhost:55433/yct_map_v2',
  ];

  for (const url of forbiddenUrls) {
    assert.throws(
      () => validateDatabaseUrl(url, 'DATABASE_URL', 'development'),
      (err: Error) => {
        assert.match(
          err.message,
          /CRITICAL SAFEGUARD VIOLATION/,
          `Expected violation error for forbidden URL: ${url}`,
        );
        return true;
      },
      `Forbidden database URL should have been rejected: ${url}`,
    );
  }
});

test('Database Safeguard: Forbidden local ports 5432 and 55432 are rejected', () => {
  const forbiddenPortUrls = [
    'postgresql://alert_dev_user:alert_dev_password@127.0.0.1:5432/yct_alert_dev',
    'postgresql://alert_dev_user:alert_dev_password@localhost:5432/yct_alert_dev',
    'postgresql://alert_dev_user:alert_dev_password@127.0.0.1:55432/yct_alert_dev',
    'postgresql://alert_dev_user:alert_dev_password@localhost:55432/yct_alert_dev',
  ];

  for (const url of forbiddenPortUrls) {
    assert.throws(
      () => validateDatabaseUrl(url, 'DATABASE_URL', 'development'),
      (err: Error) => {
        assert.match(
          err.message,
          /forbidden local port (5432|55432)/,
          `Expected forbidden port violation for: ${url}`,
        );
        return true;
      },
      `Port should have been rejected: ${url}`,
    );
  }
});

test('Database Safeguard: Local database must use port 55433 in development and test', () => {
  const wrongPortUrl =
    'postgresql://alert_dev_user:alert_dev_password@127.0.0.1:5433/yct_alert_dev';
  assert.throws(
    () => validateDatabaseUrl(wrongPortUrl, 'DATABASE_URL', 'development'),
    /must target port 55433/,
  );

  const allowedDev = 'postgresql://alert_dev_user:alert_dev_password@127.0.0.1:55433/yct_alert_dev';
  assert.equal(validateDatabaseUrl(allowedDev, 'DATABASE_URL', 'development'), allowedDev);

  const allowedTest =
    'postgresql://alert_test_user:alert_test_password@127.0.0.1:55433/yct_alert_test';
  assert.equal(validateDatabaseUrl(allowedTest, 'TEST_DATABASE_URL', 'test'), allowedTest);
});

test('Database Safeguard: Local database name must match environment', () => {
  const wrongDevDb =
    'postgresql://alert_dev_user:alert_dev_password@127.0.0.1:55433/other_database';
  assert.throws(
    () => validateDatabaseUrl(wrongDevDb, 'DATABASE_URL', 'development'),
    /must target database "yct_alert_dev"/,
  );

  const wrongTestDb =
    'postgresql://alert_test_user:alert_test_password@127.0.0.1:55433/other_database';
  assert.throws(
    () => validateDatabaseUrl(wrongTestDb, 'TEST_DATABASE_URL', 'test'),
    /must target database "yct_alert_test"/,
  );

  const wrongAcceptanceDb =
    'postgresql://alert_accept_user:alert_accept_password@127.0.0.1:55433/other_database';
  assert.throws(
    () => validateDatabaseUrl(wrongAcceptanceDb, 'DATABASE_URL', 'acceptance'),
    /must target database "yct_alert_acceptance"/,
  );
});

test('Database Safeguard: Production rejects localhost database connections', () => {
  const prodLocal = 'postgresql://alert_dev_user:alert_dev_password@127.0.0.1:55433/yct_alert_dev';
  assert.throws(
    () => validateDatabaseUrl(prodLocal, 'DATABASE_URL', 'production'),
    /cannot target localhost or loopback/,
  );

  const allowedProdRemote =
    'postgresql://prod_user:prod_pass@db.yctalert.internal:5432/yct_alert_prod';
  assert.equal(
    validateDatabaseUrl(allowedProdRemote, 'DATABASE_URL', 'production'),
    allowedProdRemote,
  );
});

test('Database Safeguard: Defaults strictly isolate dev and test to 127.0.0.1:55433', () => {
  const defaultDev = validateDatabaseUrl(undefined, 'DATABASE_URL', 'development');
  assert.equal(defaultDev, DEFAULT_DEV_DATABASE_URL);
  assert.match(defaultDev, /55433\/yct_alert_dev/);

  const defaultTest = validateDatabaseUrl(undefined, 'TEST_DATABASE_URL', 'test');
  assert.equal(defaultTest, DEFAULT_TEST_DATABASE_URL);
  assert.match(defaultTest, /55433\/yct_alert_test/);

  const defaultAcceptance = validateDatabaseUrl(undefined, 'DATABASE_URL', 'acceptance');
  assert.equal(defaultAcceptance, DEFAULT_ACCEPTANCE_DATABASE_URL);
  assert.match(defaultAcceptance, /55433\/yct_alert_acceptance/);

  for (const forbidden of FORBIDDEN_DB_NAMES) {
    assert.equal(defaultDev.toLowerCase().includes(forbidden), false);
    assert.equal(defaultTest.toLowerCase().includes(forbidden), false);
  }
});

test('Database Safeguard: Production configuration fails closed on dev secrets', () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://prod_user:prod_pass@remote-db.yctalert.internal:5432/yct_alert_prod',
      }),
    /IDEMPOTENCY_REPLAY_SECRET must be configured with a production secret/,
  );
});
