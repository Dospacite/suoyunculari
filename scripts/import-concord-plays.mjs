#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const options = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(options.file);
const records = await readInput(inputPath);

if (options.dryRun) {
  const ids = new Set(records.map((record) => String(record.source_id || '')));
  console.log(`dry run: ${records.length} records, ${ids.size} unique source ids`);
  process.exit(0);
}

const connectionString = options.databaseUrl || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL or pass --database-url before importing.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  await ensureSchema(pool);

  if (options.truncate) {
    await pool.query('TRUNCATE TABLE concord_plays');
  }

  let imported = 0;
  await pool.query('BEGIN');

  for (const record of records) {
    await upsertRecord(pool, record);
    imported += 1;
  }

  await pool.query('COMMIT');
  console.log(`imported ${imported} Concord plays into PostgreSQL`);
} catch (error) {
  await pool.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await pool.end();
}

function parseArgs(args) {
  const parsed = {
    file: 'scraped/concord/concord-plays.json',
    databaseUrl: '',
    truncate: false,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      index += 1;
      if (index >= args.length) throw new Error(`Missing value for ${arg}`);
      return args[index];
    };

    if (arg === '--file') parsed.file = next();
    else if (arg === '--database-url') parsed.databaseUrl = next();
    else if (arg === '--truncate') parsed.truncate = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run db:import:concord -- [options]

Options:
  --file <path>          JSON input file (default: scraped/concord/concord-plays.json)
  --database-url <url>   PostgreSQL connection URL (default: DATABASE_URL)
  --truncate            Delete existing Concord rows before import
  --dry-run             Validate and count records without connecting to PostgreSQL
`);
}

async function readInput(file) {
  const payload = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(payload)) {
    throw new Error(`${file} must contain a JSON array`);
  }

  return payload.map((record, index) => {
    if (!record || typeof record !== 'object') {
      throw new Error(`Record ${index} must be an object`);
    }

    if (!record.source_id || !record.title || !record.slug) {
      throw new Error(`Record ${index} is missing source_id, title, or slug`);
    }

    return normalizeRecord(record);
  });
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS concord_plays (
      source text NOT NULL DEFAULT 'concord_theatricals',
      source_id text PRIMARY KEY,
      source_url text,
      scraped_at timestamptz,
      title text NOT NULL,
      slug text NOT NULL,
      summary_text text,
      summary_html text,
      full_description_html text,
      authors jsonb NOT NULL DEFAULT '[]'::jsonb,
      play_type text,
      genres text[] NOT NULL DEFAULT '{}',
      subgenres text[] NOT NULL DEFAULT '{}',
      duration_text text,
      duration_minutes integer,
      casting_text text,
      min_cast_size integer,
      max_cast_size integer,
      female_roles integer,
      male_roles integer,
      neutral_roles integer,
      setting_html text,
      themes text[] NOT NULL DEFAULT '{}',
      target_audience text,
      performance_groups text[] NOT NULL DEFAULT '{}',
      features text[] NOT NULL DEFAULT '{}',
      cautions text[] NOT NULL DEFAULT '{}',
      tags text[] NOT NULL DEFAULT '{}',
      rights_status text NOT NULL DEFAULT 'licensed',
      licensing_fee_text text,
      imprint text,
      isbn text,
      sample_pdf_urls text[] NOT NULL DEFAULT '{}',
      image_urls text[] NOT NULL DEFAULT '{}',
      search_text text NOT NULL DEFAULT '',
      imported_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS concord_plays_search_idx
      ON concord_plays USING gin (to_tsvector('english', search_text));

    CREATE INDEX IF NOT EXISTS concord_plays_genres_idx
      ON concord_plays USING gin (genres);

    CREATE INDEX IF NOT EXISTS concord_plays_duration_idx
      ON concord_plays (duration_minutes);

    CREATE INDEX IF NOT EXISTS concord_plays_title_idx
      ON concord_plays (title);
  `);
}

async function upsertRecord(pool, record) {
  const columns = [
    'source',
    'source_id',
    'source_url',
    'scraped_at',
    'title',
    'slug',
    'summary_text',
    'summary_html',
    'full_description_html',
    'authors',
    'play_type',
    'genres',
    'subgenres',
    'duration_text',
    'duration_minutes',
    'casting_text',
    'min_cast_size',
    'max_cast_size',
    'female_roles',
    'male_roles',
    'neutral_roles',
    'setting_html',
    'themes',
    'target_audience',
    'performance_groups',
    'features',
    'cautions',
    'tags',
    'rights_status',
    'licensing_fee_text',
    'imprint',
    'isbn',
    'sample_pdf_urls',
    'image_urls',
    'search_text',
  ];

  const values = columns.map((column) => record[column]);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const updates = columns
    .filter((column) => column !== 'source_id')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');

  await pool.query(
    `INSERT INTO concord_plays (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON CONFLICT (source_id) DO UPDATE SET
       ${updates},
       updated_at = now()`,
    values,
  );
}

function normalizeRecord(record) {
  const normalized = {
    source: cleanString(record.source) || 'concord_theatricals',
    source_id: String(record.source_id),
    source_url: cleanString(record.source_url),
    scraped_at: cleanString(record.scraped_at) || null,
    title: cleanString(record.title),
    slug: cleanString(record.slug),
    summary_text: cleanString(record.summary_text),
    summary_html: cleanString(record.summary_html),
    full_description_html: cleanString(record.full_description_html),
    authors: JSON.stringify(normalizeAuthors(record.authors)),
    play_type: cleanString(record.play_type),
    genres: normalizeStringArray(record.genres),
    subgenres: normalizeStringArray(record.subgenres),
    duration_text: cleanString(record.duration_text),
    duration_minutes: cleanInteger(record.duration_minutes),
    casting_text: cleanString(record.casting_text),
    min_cast_size: cleanInteger(record.min_cast_size),
    max_cast_size: cleanInteger(record.max_cast_size),
    female_roles: cleanInteger(record.female_roles),
    male_roles: cleanInteger(record.male_roles),
    neutral_roles: cleanInteger(record.neutral_roles),
    setting_html: cleanString(record.setting_html),
    themes: normalizeStringArray(record.themes),
    target_audience: cleanString(record.target_audience),
    performance_groups: normalizeStringArray(record.performance_groups),
    features: normalizeStringArray(record.features),
    cautions: normalizeStringArray(record.cautions),
    tags: normalizeStringArray(record.tags),
    rights_status: cleanString(record.rights_status) || 'licensed',
    licensing_fee_text: cleanString(record.licensing_fee_text),
    imprint: cleanString(record.imprint),
    isbn: cleanString(record.isbn),
    sample_pdf_urls: normalizeStringArray(record.sample_pdf_urls),
    image_urls: normalizeStringArray(record.image_urls),
  };

  return {
    ...normalized,
    search_text: buildSearchText(record, normalized),
  };
}

function buildSearchText(record, normalized) {
  return [
    normalized.title,
    normalizeAuthors(record.authors)
      .map((author) => author.name)
      .join(' '),
    normalized.summary_text,
    htmlToText(normalized.summary_html),
    htmlToText(normalized.full_description_html),
    normalized.play_type,
    normalized.genres.join(' '),
    normalized.subgenres.join(' '),
    normalized.casting_text,
    htmlToText(normalized.setting_html),
    normalized.themes.join(' '),
    normalized.target_audience,
    normalized.performance_groups.join(' '),
    normalized.features.join(' '),
    normalized.cautions.join(' '),
    normalized.tags.join(' '),
    normalized.imprint,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAuthors(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((author) => ({
      id: author?.id ?? author?.Id,
      name: cleanString(author?.name ?? [author?.FirstName, author?.LastName].filter(Boolean).join(' ')),
      slug: cleanString(author?.slug ?? author?.SeName),
      source_url: cleanString(author?.source_url),
    }))
    .filter((author) => author.name);
}

function normalizeStringArray(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : String(value).split(',');
  return Array.from(new Set(items.map(cleanString).filter(Boolean)));
}

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function cleanInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function htmlToText(value) {
  return cleanString(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
