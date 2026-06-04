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
  minCast?: string;
  maxCast?: string;
  femaleRoles?: string;
  femaleRolesMax?: string;
  maleRoles?: string;
  maleRolesMax?: string;
  neutralRoles?: string;
  neutralRolesMax?: string;
  reference?: string;
  page?: number;
  pageSize?: number;
  includeFacets?: boolean;
  playedReferences?: Array<{
    source?: string;
    source_id?: string;
    play_slug?: string;
    play_title?: string;
  }>;
};

export type TextBankAssistantSearchOptions = Omit<SearchOptions, 'page' | 'playedReferences'> & {
  playedReferences?: SearchOptions['playedReferences'];
};

type ConcordRow = Omit<ConcordPlay, 'authors' | 'scraped_at'> & {
  authors: ConcordAuthor[] | string | null;
  scraped_at: Date | string | null;
};

type ConcordSearchRow = ConcordRow & {
  result_count?: number | string;
};

type TextBankFacets = Pick<
  ConcordSearchResult,
  | 'genres'
  | 'playTypes'
  | 'subgenres'
  | 'themes'
  | 'targetAudiences'
  | 'performanceGroups'
  | 'features'
  | 'cautions'
  | 'sources'
>;

type TextBankWhereClause = {
  whereSql: string;
  params: unknown[];
  rankExpression: string;
  orderSql: string;
};

type TextBankBuildOptions = SearchOptions & {
  exactOnly?: boolean;
};

const globalForPg = globalThis as typeof globalThis & {
  concordPool?: pg.Pool;
  concordFacetCache?: {
    expiresAt: number;
    value: TextBankFacets;
  };
};

const FACET_CACHE_TTL_MS = 10 * 60 * 1000;

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
  minCast = '',
  maxCast = '',
  femaleRoles = '',
  femaleRolesMax = '',
  maleRoles = '',
  maleRolesMax = '',
  neutralRoles = '',
  neutralRolesMax = '',
  reference = '',
  page = 1,
  pageSize = 25,
  includeFacets = true,
  playedReferences = [],
}: SearchOptions): Promise<ConcordSearchResult> {
  const pool = getPool();
  if (!pool) return emptySearchResult(page, pageSize, false);

  const safePage = clampInteger(page, 1, 10_000);
  const safePageSize = clampInteger(pageSize, 1, 100);
  const offset = (safePage - 1) * safePageSize;
  const { whereSql, params, rankExpression, orderSql } = buildTextBankWhereClause({
    query,
    source,
    playType,
    genre,
    subgenre,
    theme,
    targetAudience,
    performanceGroup,
    feature,
    caution,
    duration,
    totalCast,
    femaleRoles,
    femaleRolesMax,
    maleRoles,
    maleRolesMax,
    neutralRoles,
    neutralRolesMax,
    minCast,
    maxCast,
    reference,
    playedReferences,
  });

  try {
    const queryParams = [...params, safePageSize, offset];
    const limitParam = `$${queryParams.length - 1}`;
    const offsetParam = `$${queryParams.length}`;

    const itemsPromise = pool.query<ConcordSearchRow>(
      `SELECT
        count(*) OVER() AS result_count,
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
      queryParams,
    );

    const [items, facets] = await Promise.all([
      itemsPromise,
      includeFacets ? getTextBankFacets(pool) : Promise.resolve(emptyTextBankFacets()),
    ]);

    let total = Number(items.rows[0]?.result_count ?? 0);
    if (total === 0 && offset > 0) {
      const count = await pool.query<{ count: string }>(
        `SELECT count(*)::int AS count FROM concord_plays ${whereSql}`,
        params,
      );
      total = Number(count.rows[0]?.count ?? 0);
    }

    const result: ConcordSearchResult = {
      items: items.rows.map(normalizeConcordRow),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      ...facets,
      databaseReady: true,
    };

    result.items = result.items.map((item) => markPlayed(item, playedReferences));
    return result;
  } catch (error) {
    if (isUnavailableDatabaseError(error)) return emptySearchResult(safePage, safePageSize, false);
    throw error;
  }
}

export async function searchTextBankForAssistant({
  pageSize = 6,
  playedReferences = [],
  ...options
}: TextBankAssistantSearchOptions): Promise<ConcordPlay[]> {
  const pool = getPool();
  if (!pool) return [];

  const safePageSize = clampInteger(pageSize, 1, 6);
  const { whereSql, params, rankExpression, orderSql } = buildTextBankWhereClause({
    ...options,
    playedReferences,
  });

  try {
    params.push(safePageSize);
    const limitParam = `$${params.length}`;
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
      LIMIT ${limitParam}`,
      params,
    );

    return items.rows.map(normalizeConcordRow).map((item) => markPlayed(item, playedReferences));
  } catch (error) {
    if (isUnavailableDatabaseError(error)) return [];
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

async function getTextBankFacets(pool: pg.Pool): Promise<TextBankFacets> {
  const cached = globalForPg.concordFacetCache;
  if (cached && cached.expiresAt > Date.now()) return cached.value;

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

  const value = {
    genres,
    playTypes,
    subgenres,
    themes,
    targetAudiences,
    performanceGroups,
    features,
    cautions,
    sources,
  };

  globalForPg.concordFacetCache = {
    value,
    expiresAt: Date.now() + FACET_CACHE_TTL_MS,
  };

  return value;
}

function emptyTextBankFacets(): TextBankFacets {
  return {
    genres: [],
    playTypes: [],
    subgenres: [],
    themes: [],
    targetAudiences: [],
    performanceGroups: [],
    features: [],
    cautions: [],
    sources: [],
  };
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

function buildTextBankWhereClause({
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
  femaleRolesMax = '',
  maleRoles = '',
  maleRolesMax = '',
  neutralRoles = '',
  neutralRolesMax = '',
  minCast = '',
  maxCast = '',
  reference = '',
  playedReferences = [],
  exactOnly = false,
}: TextBankBuildOptions): TextBankWhereClause {
  const params: unknown[] = [];
  const where: string[] = [displayableTextBankSql()];
  const cleanedQuery = query.trim();
  let rankExpression = '0::real AS rank';

  if (cleanedQuery) {
    params.push(cleanedQuery);
    const searchParam = `$${params.length}`;
    if (exactOnly) {
      where.push(exactTextBankMatchSql(searchParam));
      rankExpression = exactTextBankRankSql(searchParam);
    } else {
      const vector = "to_tsvector('english', search_text)";
      const tsQuery = `websearch_to_tsquery('english', ${searchParam})`;
      where.push(`${vector} @@ ${tsQuery}`);
      rankExpression = `(
        CASE
          WHEN lower(title) = lower(${searchParam}) THEN 500
          WHEN lower(title) LIKE lower(${searchParam}) || '%' THEN 420
          WHEN lower(title) LIKE '%' || lower(${searchParam}) || '%' THEN 360
          WHEN source_id = ${searchParam} THEN 220
          ELSE 0
        END + ts_rank_cd(${vector}, ${tsQuery})
      )::real AS rank`;
    }
  }

  if (genre) addArrayFilter(where, params, 'genres', genre);
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
  addCastWindowFilter(where, 'min_cast_size', 'max_cast_size', minCast, maxCast);
  addNumberWindowFilter(where, 'female_roles', femaleRoles, femaleRolesMax);
  addNumberWindowFilter(where, 'male_roles', maleRoles, maleRolesMax);
  addNumberWindowFilter(where, 'neutral_roles', neutralRoles, neutralRolesMax);

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

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    params,
    rankExpression,
    orderSql: cleanedQuery ? 'rank DESC, lower(title) ASC' : 'title ASC',
  };
}

function exactTextBankMatchSql(searchParam: string): string {
  return `(
    lower(title) = lower(${searchParam})
    OR lower(title) LIKE lower(${searchParam}) || '%'
    OR lower(title) LIKE '%' || lower(${searchParam}) || '%'
    OR source_id = ${searchParam}
    OR ${authorContainsSql(searchParam)}
  )`;
}

function exactTextBankRankSql(searchParam: string): string {
  return `CASE
    WHEN lower(title) = lower(${searchParam}) THEN 500
    WHEN lower(title) LIKE lower(${searchParam}) || '%' THEN 420
    WHEN lower(title) LIKE '%' || lower(${searchParam}) || '%' THEN 360
    WHEN ${authorContainsSql(searchParam)} THEN 260
    WHEN source_id = ${searchParam} THEN 220
    ELSE 20
  END::real AS rank`;
}

function authorContainsSql(searchParam: string): string {
  return `EXISTS (
    SELECT 1
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(authors::jsonb) = 'array' THEN authors::jsonb ELSE '[]'::jsonb END) AS author
    WHERE lower(author->>'name') LIKE '%' || lower(${searchParam}) || '%'
  )`;
}

function emptySearchResult(page: number, pageSize: number, databaseReady: boolean): ConcordSearchResult {
  return {
    items: [],
    total: 0,
    page,
    pageSize,
    totalPages: 1,
    ...emptyTextBankFacets(),
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

function addNumberWindowFilter(where: string[], column: string, minimumValue: string, maximumValue: string): void {
  const minimum = Number(minimumValue);
  const maximum = Number(maximumValue);
  const conditions: string[] = [];

  if (Number.isInteger(minimum) && minimum > 0) {
    conditions.push(`${column} >= ${minimum}`);
  }

  if (Number.isInteger(maximum) && maximum > 0) {
    conditions.push(`${column} <= ${maximum}`);
  }

  if (conditions.length > 0) {
    where.push(`${column} IS NOT NULL AND ${conditions.join(' AND ')}`);
  }
}

function addCastWindowFilter(
  where: string[],
  minColumn: string,
  maxColumn: string,
  minimumValue: string,
  maximumValue: string,
): void {
  const minimum = Number(minimumValue);
  const maximum = Number(maximumValue);
  const conditions: string[] = [];

  if (Number.isInteger(minimum) && minimum > 0) {
    conditions.push(`${maxColumn} IS NOT NULL AND ${maxColumn} >= ${minimum}`);
  }

  if (Number.isInteger(maximum) && maximum > 0) {
    conditions.push(`${minColumn} IS NOT NULL AND ${minColumn} <= ${maximum}`);
  }

  if (conditions.length > 0) {
    where.push(`(${conditions.join(' AND ')})`);
  }
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
