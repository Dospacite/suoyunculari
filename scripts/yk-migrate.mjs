import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

try {
  await pool.query(`
    create table if not exists yk_schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const migrationsDir = path.join(root, 'db', 'yk');
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const existing = await pool.query('select filename from yk_schema_migrations where filename = $1', [file]);
    if (existing.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await pool.query('begin');
    try {
      await pool.query(sql);
      await pool.query('insert into yk_schema_migrations (filename) values ($1)', [file]);
      await pool.query('commit');
      console.log(`Applied ${file}`);
    } catch (error) {
      await pool.query('rollback');
      throw error;
    }
  }
} finally {
  await pool.end();
}
