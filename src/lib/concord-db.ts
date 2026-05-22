import pg from 'pg';
import type { ConcordAuthor, ConcordPlay, ConcordSearchResult } from './concord';

const { Pool } = pg;

type SearchOptions = {
  query?: string;
  genre?: string;
  duration?: string;
  page?: number;
  pageSize?: number;
};

type ConcordRow = Omit<ConcordPlay, 'authors' | 'scraped_at'> & {
  authors: ConcordAuthor[] | string | null;
  scraped_at: Date | string | null;
};

const globalForPg = globalThis as typeof globalThis & {
  concordPool?: pg.Pool;
};

export async function searchConcordPlays({
  query = '',
  genre = '',
  duration = '',
  page = 1,
  pageSize = 25,
}: SearchOptions): Promise<ConcordSearchResult> {
  const pool = getPool();
  if (!pool) return emptySearchResult(page, pageSize, false);

  const safePage = clampInteger(page, 1, 10_000);
  const safePageSize = clampInteger(pageSize, 1, 100);
  const offset = (safePage - 1) * safePageSize;
  const params: unknown[] = [];
  const where: string[] = [];
  const cleanedQuery = query.trim();
  let rankExpression = '0::real AS rank';

  if (cleanedQuery) {
    params.push(cleanedQuery);
    const searchParam = `$${params.length}`;
    const vector = "to_tsvector('english', search_text)";
    const tsQuery = `websearch_to_tsquery('english', ${searchParam})`;
    where.push(`${vector} @@ ${tsQuery}`);
    rankExpression = `ts_rank_cd(${vector}, ${tsQuery}) AS rank`;
  }

  if (genre) {
    params.push(genre);
    where.push(
      `EXISTS (SELECT 1 FROM unnest(genres) AS genre_name WHERE lower(genre_name) = lower($${params.length}))`,
    );
  }

  if (duration === 'short') {
    where.push('duration_minutes IS NOT NULL AND duration_minutes <= 90');
  } else if (duration === 'medium') {
    where.push('duration_minutes BETWEEN 91 AND 120');
  } else if (duration === 'long') {
    where.push('duration_minutes > 120');
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = cleanedQuery ? 'rank DESC, title ASC' : 'title ASC';

  try {
    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM concord_plays ${whereSql}`,
      params,
    );

    const total = Number(count.rows[0]?.count ?? 0);

    params.push(safePageSize, offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    const items = await pool.query<ConcordRow>(
      `SELECT
        source,
        source_id,
        source_url,
        scraped_at,
        title,
        slug,
        summary_text,
        summary_html,
        full_description_html,
        authors,
        play_type,
        genres,
        subgenres,
        duration_text,
        duration_minutes,
        casting_text,
        min_cast_size,
        max_cast_size,
        female_roles,
        male_roles,
        neutral_roles,
        setting_html,
        themes,
        target_audience,
        performance_groups,
        features,
        cautions,
        tags,
        rights_status,
        licensing_fee_text,
        imprint,
        isbn,
        sample_pdf_urls,
        image_urls,
        ${rankExpression}
      FROM concord_plays
      ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${limitParam}
      OFFSET ${offsetParam}`,
      params,
    );

    const genres = await getConcordGenres(pool);

    return {
      items: items.rows.map(normalizeConcordRow),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      genres,
      databaseReady: true,
    };
  } catch (error) {
    if (isUnavailableDatabaseError(error)) return emptySearchResult(safePage, safePageSize, false);
    throw error;
  }
}

function getPool(): pg.Pool | undefined {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return undefined;

  if (!globalForPg.concordPool) {
    globalForPg.concordPool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }

  return globalForPg.concordPool;
}

async function getConcordGenres(pool: pg.Pool): Promise<string[]> {
  const payload = await pool.query<{ genre: string }>(
    `SELECT DISTINCT genre
     FROM concord_plays, unnest(genres) AS genre
     WHERE genre <> ''
     ORDER BY genre`,
  );

  return payload.rows.map((row) => row.genre);
}

function normalizeConcordRow(row: ConcordRow): ConcordPlay {
  return {
    ...row,
    scraped_at:
      row.scraped_at instanceof Date
        ? row.scraped_at.toISOString()
        : row.scraped_at || undefined,
    authors: normalizeAuthors(row.authors),
    genres: row.genres ?? [],
    subgenres: row.subgenres ?? [],
    themes: row.themes ?? [],
    performance_groups: row.performance_groups ?? [],
    features: row.features ?? [],
    cautions: row.cautions ?? [],
    tags: row.tags ?? [],
    sample_pdf_urls: row.sample_pdf_urls ?? [],
    image_urls: row.image_urls ?? [],
  };
}

function normalizeAuthors(value: ConcordRow['authors']): ConcordAuthor[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function emptySearchResult(page: number, pageSize: number, databaseReady: boolean): ConcordSearchResult {
  return {
    items: [],
    total: 0,
    page,
    pageSize,
    totalPages: 1,
    genres: [],
    databaseReady,
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function isUnavailableDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  return code === '42P01' || code === '3D000' || code === 'ECONNREFUSED' || code === 'ENOTFOUND';
}
