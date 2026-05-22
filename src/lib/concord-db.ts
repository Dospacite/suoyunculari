import pg from 'pg';
import type { ConcordAuthor, ConcordPlay, ConcordSearchResult } from './concord';

const { Pool } = pg;

type SearchOptions = {
  query?: string;
  source?: string;
  playType?: string;
  genre?: string;
  subgenre?: string;
  theme?: string;
  targetAudience?: string;
  performanceGroup?: string;
  feature?: string;
  caution?: string;
  duration?: string;
  totalCast?: string;
  femaleRoles?: string;
  maleRoles?: string;
  neutralRoles?: string;
  reference?: string;
  page?: number;
  pageSize?: number;
  playedReferences?: Array<{
    source?: string;
    source_id?: string;
    play_slug?: string;
    play_title?: string;
  }>;
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
  source = '',
  playType = '',
  genre = '',
  subgenre = '',
  theme = '',
  targetAudience = '',
  performanceGroup = '',
  feature = '',
  caution = '',
  duration = '',
  totalCast = '',
  femaleRoles = '',
  maleRoles = '',
  neutralRoles = '',
  reference = '',
  page = 1,
  pageSize = 25,
  playedReferences = [],
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

  where.push(displayableTextBankSql());

  if (cleanedQuery) {
    params.push(cleanedQuery);
    const searchParam = `$${params.length}`;
    const vector = "to_tsvector('english', search_text)";
    const tsQuery = `websearch_to_tsquery('english', ${searchParam})`;
    where.push(`${vector} @@ ${tsQuery}`);
    rankExpression = `ts_rank_cd(${vector}, ${tsQuery}) AS rank`;
  }

  if (genre) {
    addArrayFilter(where, params, 'genres', genre);
  }

  if (source) {
    params.push(source);
    where.push(`source = $${params.length}`);
  }

  if (playType) addScalarFilter(where, params, 'play_type', playType);
  if (subgenre) addArrayFilter(where, params, 'subgenres', subgenre);
  if (theme) addArrayFilter(where, params, 'themes', theme);
  if (targetAudience) addTextListFilter(where, params, 'target_audience', targetAudience);
  if (performanceGroup) addArrayFilter(where, params, 'performance_groups', performanceGroup);
  if (feature) addArrayFilter(where, params, 'features', feature);
  if (caution) addArrayFilter(where, params, 'cautions', caution);

  if (duration === 'short') {
    where.push('duration_minutes IS NOT NULL AND duration_minutes <= 90');
  } else if (duration === 'medium') {
    where.push('duration_minutes BETWEEN 91 AND 120');
  } else if (duration === 'long') {
    where.push('duration_minutes > 120');
  }

  addRangeFilter(where, 'min_cast_size', 'max_cast_size', totalCast);
  addMinimumFilter(where, 'female_roles', femaleRoles);
  addMinimumFilter(where, 'male_roles', maleRoles);
  addMinimumFilter(where, 'neutral_roles', neutralRoles);

  const playedKeys = new Set(
    playedReferences
      .filter((item) => item.source && item.source_id)
      .map((item) => referenceKey(item.source, item.source_id)),
  );

  if (reference === 'played' || reference === 'unplayed') {
    const referencesForSql = [...playedKeys].map(splitReferenceKey);
    if (referencesForSql.length === 0) {
      where.push(reference === 'played' ? 'false' : 'true');
    } else {
      const conditions = referencesForSql.map((item) => {
        params.push(item.source, item.sourceId);
        return `(source = $${params.length - 1} AND source_id = $${params.length})`;
      });
      where.push(reference === 'played' ? `(${conditions.join(' OR ')})` : `NOT (${conditions.join(' OR ')})`);
    }
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

    const [
      genres,
      playTypes,
      subgenres,
      themes,
      targetAudiences,
      performanceGroups,
      features,
      cautions,
      sources,
    ] = await Promise.all([
      getConcordGenres(pool),
      getDistinctScalar(pool, 'play_type'),
      getDistinctArrayValues(pool, 'subgenres'),
      getDistinctArrayValues(pool, 'themes'),
      getDistinctTargetAudiences(pool),
      getDistinctArrayValues(pool, 'performance_groups'),
      getDistinctArrayValues(pool, 'features'),
      getDistinctArrayValues(pool, 'cautions'),
      getConcordSources(pool),
    ]);

    const result: ConcordSearchResult = {
      items: items.rows.map(normalizeConcordRow),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      genres,
      playTypes,
      subgenres,
      themes,
      targetAudiences,
      performanceGroups,
      features,
      cautions,
      sources,
      databaseReady: true,
    };

    result.items = result.items.map((item) => markPlayed(item, playedReferences));
    return result;
  } catch (error) {
    if (isUnavailableDatabaseError(error)) return emptySearchResult(safePage, safePageSize, false);
    throw error;
  }
}

export async function getConcordPlayBySourceId(
  source: string,
  sourceId: string,
): Promise<ConcordPlay | undefined> {
  const pool = getPool();
  if (!pool) return undefined;

  try {
    const item = await pool.query<ConcordRow>(
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
        image_urls
      FROM concord_plays
      WHERE source = $1 AND source_id = $2
      LIMIT 1`,
      [source, sourceId],
    );

    return item.rows[0] ? normalizeConcordRow(item.rows[0]) : undefined;
  } catch (error) {
    if (isUnavailableDatabaseError(error)) return undefined;
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
       AND ${displayableTextBankSql()}
       AND source = 'concord_theatricals'
     ORDER BY genre`,
  );

  return payload.rows.map((row) => row.genre);
}

async function getDistinctArrayValues(pool: pg.Pool, column: string): Promise<string[]> {
  const payload = await pool.query<{ value: string }>(
    `SELECT DISTINCT value
     FROM concord_plays, unnest(${column}) AS value
     WHERE value <> ''
       AND ${displayableTextBankSql()}
       AND source = 'concord_theatricals'
     ORDER BY value`,
  );

  return payload.rows.map((row) => row.value);
}

async function getDistinctScalar(pool: pg.Pool, column: string): Promise<string[]> {
  const payload = await pool.query<{ value: string }>(
    `SELECT DISTINCT ${column} AS value
     FROM concord_plays
     WHERE ${column} <> ''
       AND ${displayableTextBankSql()}
       AND source = 'concord_theatricals'
     ORDER BY ${column}`,
  );

  return payload.rows.map((row) => row.value);
}

async function getDistinctTargetAudiences(pool: pg.Pool): Promise<string[]> {
  const payload = await pool.query<{ value: string }>(
    `SELECT DISTINCT trim(value) AS value
     FROM concord_plays, regexp_split_to_table(target_audience, ',') AS value
     WHERE trim(value) <> ''
       AND ${displayableTextBankSql()}
       AND source = 'concord_theatricals'
     ORDER BY trim(value)`,
  );

  return payload.rows.map((row) => row.value);
}

async function getConcordSources(pool: pg.Pool): Promise<string[]> {
  const payload = await pool.query<{ source: string }>(
    `SELECT DISTINCT source
     FROM concord_plays
     WHERE source <> ''
     ORDER BY source`,
  );

  return payload.rows.map((row) => row.source);
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

function markPlayed(
  item: ConcordPlay,
  playedReferences: NonNullable<SearchOptions['playedReferences']>,
): ConcordPlay {
  const reference = playedReferences.find(
    (playedReference) =>
      playedReference.source === item.source && playedReference.source_id === item.source_id,
  );

  if (!reference) return item;

  return {
    ...item,
    played: true,
    played_play_slug: reference.play_slug,
    played_play_title: reference.play_title,
  };
}

function referenceKey(source?: string, sourceId?: string): string {
  return `${source ?? ''}\u0000${sourceId ?? ''}`;
}

function splitReferenceKey(key: string): { source: string; sourceId: string } {
  const [source, sourceId] = key.split('\u0000');
  return { source, sourceId };
}

function emptySearchResult(page: number, pageSize: number, databaseReady: boolean): ConcordSearchResult {
  return {
    items: [],
    total: 0,
    page,
    pageSize,
    totalPages: 1,
    genres: [],
    playTypes: [],
    subgenres: [],
    themes: [],
    targetAudiences: [],
    performanceGroups: [],
    features: [],
    cautions: [],
    sources: [],
    databaseReady,
  };
}

function addScalarFilter(where: string[], params: unknown[], column: string, value: string): void {
  params.push(value);
  where.push(`lower(${column}) = lower($${params.length})`);
}

function addArrayFilter(where: string[], params: unknown[], column: string, value: string): void {
  params.push(value);
  where.push(`EXISTS (SELECT 1 FROM unnest(${column}) AS item WHERE lower(item) = lower($${params.length}))`);
}

function addTextListFilter(where: string[], params: unknown[], column: string, value: string): void {
  params.push(value);
  where.push(`EXISTS (
    SELECT 1
    FROM regexp_split_to_table(${column}, ',') AS item
    WHERE lower(trim(item)) = lower($${params.length})
  )`);
}

function addRangeFilter(where: string[], minColumn: string, maxColumn: string, value: string): void {
  if (value === 'small') {
    where.push(`${minColumn} IS NOT NULL AND ${maxColumn} IS NOT NULL AND ${minColumn} <= 6 AND ${maxColumn} <= 6`);
  } else if (value === 'medium') {
    where.push(`${minColumn} IS NOT NULL AND ${maxColumn} IS NOT NULL AND ${minColumn} <= 12 AND ${maxColumn} >= 7`);
  } else if (value === 'large') {
    where.push(`${maxColumn} IS NOT NULL AND ${maxColumn} >= 13`);
  }
}

function addMinimumFilter(where: string[], column: string, value: string): void {
  const minimum = Number(value);
  if (!Number.isInteger(minimum) || minimum < 1) return;
  where.push(`${column} IS NOT NULL AND ${column} >= ${minimum}`);
}

function displayableTextBankSql(): string {
  return `(source <> 'concord_theatricals' OR play_type = ANY (ARRAY[
    '10 Minute Play',
    'Full-Length Musical',
    'Full-Length Play',
    'Musical',
    'Musical Revue / Cabaret',
    'Play',
    'Short Musical',
    'Short Play'
  ]))`;
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
