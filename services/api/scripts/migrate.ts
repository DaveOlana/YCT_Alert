import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { loadConfig, validateDatabaseUrl } from '../src/config.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(options: {
  databaseUrl: string;
  direction?: 'up' | 'down';
  count?: number;
  verbose?: boolean;
}): Promise<void> {
  const direction = options.direction || 'up';
  // Validate database URL against safeguards
  validateDatabaseUrl(options.databaseUrl, 'MIGRATION_DATABASE_URL');

  const migrationsDir = path.resolve(__dirname, '../migrations');

  console.log(`[migrate] Running migrations (${direction}) on ${options.databaseUrl}...`);

  await runner({
    databaseUrl: options.databaseUrl,
    dir: migrationsDir,
    direction,
    count: options.count,
    migrationsTable: 'pgmigrations',
    verbose: options.verbose ?? true,
    logger: {
      info: (msg) => console.log(`[migrate:info] ${msg}`),
      warn: (msg) => console.warn(`[migrate:warn] ${msg}`),
      error: (msg) => console.error(`[migrate:error] ${msg}`),
    },
  });

  console.log(`[migrate] Completed (${direction}) successfully.`);
}

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);
  const direction: 'up' | 'down' = args.includes('down') ? 'down' : 'up';
  const targetBoth = args.includes('--both');
  const targetTest = args.includes('--test') || config.NODE_ENV === 'test';

  const targets: string[] = [];
  if (targetBoth) {
    targets.push(config.DATABASE_URL, config.TEST_DATABASE_URL);
  } else if (targetTest) {
    targets.push(config.TEST_DATABASE_URL);
  } else {
    targets.push(config.DATABASE_URL);
  }

  for (const url of targets) {
    await runMigrations({
      databaseUrl: url,
      direction,
      verbose: true,
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[migrate:error] Migration failed:', err);
    process.exit(1);
  });
}
