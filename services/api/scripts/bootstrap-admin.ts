import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { Pool } from 'pg';
import { loadConfig, validateDatabaseUrl } from '../src/config.js';

export const SUPERADMIN_USERNAME = 'ALERTadmin';

export interface BootstrapOptions {
  databaseUrl?: string;
  password?: string;
  rotatePassword?: boolean;
}

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (password.length < 10) {
    return { valid: false, reason: 'Password must be at least 10 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one number.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one special character.' };
  }
  return { valid: true };
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function bootstrapAdmin(options: BootstrapOptions = {}): Promise<{
  action: 'CREATED' | 'ROTATED';
  username: string;
  role: string;
  adminId: string;
}> {
  const config = loadConfig();
  const dbUrl = options.databaseUrl || config.DATABASE_URL;

  // Enforce critical database safeguard
  validateDatabaseUrl(dbUrl, 'BOOTSTRAP_DATABASE_URL', config.NODE_ENV);

  const password = options.password || process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password) {
    throw new Error(
      'Password must be provided via argument, interactive prompt, or ADMIN_BOOTSTRAP_PASSWORD.',
    );
  }

  const check = validatePasswordStrength(password);
  if (!check.valid) {
    throw new Error(`Password policy violation: ${check.reason}`);
  }

  const passwordHash = await hashPassword(password);

  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  try {
    const existing = await pool.query<{ id: string; role: string }>(
      'SELECT id, role FROM admin_users WHERE username = $1',
      [SUPERADMIN_USERNAME],
    );

    if (existing.rows.length > 0) {
      if (!options.rotatePassword) {
        throw new Error(
          `Super-administrator ${SUPERADMIN_USERNAME} is already provisioned. Duplicate super-administrators are prohibited. Use --rotate-password to change password.`,
        );
      }

      const res = await pool.query<{ id: string; role: string }>(
        `UPDATE admin_users 
         SET password_hash = $1, updated_at = CURRENT_TIMESTAMP, is_active = TRUE
         WHERE username = $2
         RETURNING id, role`,
        [passwordHash, SUPERADMIN_USERNAME],
      );

      return {
        action: 'ROTATED',
        username: SUPERADMIN_USERNAME,
        role: res.rows[0].role,
        adminId: res.rows[0].id,
      };
    }

    const res = await pool.query<{ id: string; role: string }>(
      `INSERT INTO admin_users (username, password_hash, role, is_active)
       VALUES ($1, $2, 'SUPERADMIN', TRUE)
       RETURNING id, role`,
      [SUPERADMIN_USERNAME, passwordHash],
    );

    return {
      action: 'CREATED',
      username: SUPERADMIN_USERNAME,
      role: res.rows[0].role,
      adminId: res.rows[0].id,
    };
  } finally {
    await pool.end();
  }
}

async function promptPasswordMasked(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    process.stdout.write(prompt);

    // If stdin is not a TTY (piped), read standard line
    if (!process.stdin.isTTY) {
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    // Mask input for interactive TTY
    let password = '';
    const onData = (char: Buffer) => {
      const str = char.toString('utf-8');
      switch (str) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdin.removeListener('data', onData);
          process.stdin.setRawMode(false);
          rl.close();
          process.stdout.write('\n');
          resolve(password);
          break;
        case '\u0003': // Ctrl+C
          process.stdin.setRawMode(false);
          process.exit(1);
          break;
        case '\b':
        case '\x7f': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          password += str;
          process.stdout.write('*');
          break;
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);
  const rotatePassword = args.includes('--rotate-password');
  const ifMissing = args.includes('--if-missing');
  const targetTest = args.includes('--test') || config.NODE_ENV === 'test';
  const targetBoth = args.includes('--both');

  const targets: string[] = [];
  if (targetBoth) {
    targets.push(config.DATABASE_URL, config.TEST_DATABASE_URL);
  } else if (targetTest) {
    targets.push(config.TEST_DATABASE_URL);
  } else {
    targets.push(config.DATABASE_URL);
  }

  for (const dbUrl of targets) {
    const parsed = new URL(dbUrl);
    const maskedHost = `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
    console.log(`[bootstrap] Target database: ${maskedHost}`);

    if (ifMissing) {
      validateDatabaseUrl(dbUrl, 'BOOTSTRAP_DATABASE_URL', config.NODE_ENV);
      const checkPool = new Pool({ connectionString: dbUrl, max: 1 });
      try {
        const existing = await checkPool.query<{ id: string }>(
          'SELECT id FROM admin_users WHERE username = $1',
          [SUPERADMIN_USERNAME],
        );
        if (existing.rows.length > 0) {
          console.log(
            `[bootstrap] Super-admin ${SUPERADMIN_USERNAME} already provisioned; skipping (--if-missing).`,
          );
          continue;
        }
      } finally {
        await checkPool.end();
      }
    }

    let password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (!password) {
      if (ifMissing) {
        console.warn(
          `[bootstrap:warn] Super-admin ${SUPERADMIN_USERNAME} not yet provisioned and ADMIN_BOOTSTRAP_PASSWORD is unset. Skipping automatic bootstrap; set ADMIN_BOOTSTRAP_PASSWORD or run bootstrap:admin manually.`,
        );
        continue;
      }
      password = await promptPasswordMasked(
        `Enter secure password for ${SUPERADMIN_USERNAME} (min 12 chars, upper/lower/number/symbol): `,
      );
      const confirm = await promptPasswordMasked('Confirm password: ');
      if (password !== confirm) {
        console.error('\n[bootstrap:error] Passwords do not match.');
        process.exit(1);
      }
    }

    const result = await bootstrapAdmin({
      databaseUrl: dbUrl,
      password,
      rotatePassword,
    });
    console.log(
      `[bootstrap] Success: Super-admin ${result.username} (${result.role}) ${result.action.toLowerCase()} (ID: ${result.adminId})`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\n[bootstrap:error] ${(err as Error).message}`);
    process.exit(1);
  });
}
