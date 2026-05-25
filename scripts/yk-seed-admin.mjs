import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
const email = process.env.YK_ADMIN_EMAIL;
const password = process.env.YK_ADMIN_INITIAL_PASSWORD;

if (!email) throw new Error('YK_ADMIN_EMAIL is required');
if (!password) throw new Error('YK_ADMIN_INITIAL_PASSWORD is required');

const pool = new Pool(
  process.env.YK_DATABASE_URL || process.env.DATABASE_URL
    ? { connectionString: process.env.YK_DATABASE_URL || process.env.DATABASE_URL }
    : {
        host: process.env.YK_DB_HOST || 'postgres',
        port: Number(process.env.YK_DB_PORT || 5432),
        database: process.env.YK_POSTGRES_DB || 'suoyunculari_yk',
        user: process.env.YK_POSTGRES_USER || 'suo_yk',
        password: process.env.YK_POSTGRES_PASSWORD || 'suo_yk_password',
      },
);

async function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const hash = ((await scrypt(value, salt, 64))).toString('hex');
  return { salt, hash };
}

try {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await pool.query('select id from yk_users where email = $1', [normalizedEmail]);
  if (existing.rowCount) {
    console.log('Seed admin already exists');
    process.exit(0);
  }
  const { salt, hash } = await hashPassword(password);
  await pool.query(
    `insert into yk_users
       (email, display_name, role, password_hash, password_salt, must_change_password, active)
     values ($1, $2, 'admin', $3, $4, true, true)`,
    [normalizedEmail, 'Ege Ertan', hash, salt],
  );
  console.log('Seed admin created');
} finally {
  await pool.end();
}
