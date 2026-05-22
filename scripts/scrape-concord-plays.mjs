#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://www.concordtheatricals.com';
const SEARCH_URL = `${BASE_URL}/api/v1/search`;
const PLAY_ATTRIBUTES = '24-2,25-2,26-2,27-2,28-2,29-2';
const CHECKPOINT_PAGINATION_MODE = 'pageNumberZeroBased-v1';
const CHECKPOINT_RECORD_SCOPE = 'plays-and-musicals-v1';
const INCLUDED_TITLE_TYPES = new Set(['Play', 'Musical']);

const options = parseArgs(process.argv.slice(2));

if (options.fresh && existsSync(options.out)) {
  await rm(options.out, { recursive: true, force: true });
}

await mkdir(options.out, { recursive: true });

const paths = {
  raw: path.join(options.out, 'raw-products.jsonl'),
  normalizedJsonl: path.join(options.out, 'concord-plays.jsonl'),
  normalizedJson: path.join(options.out, 'concord-plays.json'),
  checkpoint: path.join(options.out, 'checkpoint.json'),
};

const checkpoint = await readCheckpoint(paths.checkpoint);
const completedPages = new Set(completedPagesForCurrentPagination(checkpoint));
const completedIds = new Set((checkpoint.completedIds ?? []).map(String));
const skippedIds = new Set(skippedIdsForCurrentScope(checkpoint));

if (checkpoint.paginationMode && checkpoint.paginationMode !== CHECKPOINT_PAGINATION_MODE) {
  console.log('checkpoint pagination mode changed; pages after 1 will be checked again');
} else if (
  !checkpoint.paginationMode &&
  (checkpoint.completedPages ?? []).some((completedPage) => Number(completedPage) > 1)
) {
  console.log('checkpoint was created before the pagination fix; pages after 1 will be checked again');
}

if (checkpoint.recordScope && checkpoint.recordScope !== CHECKPOINT_RECORD_SCOPE) {
  console.log('checkpoint record scope changed; skipped ids and completed pages will be checked again');
} else if (
  !checkpoint.recordScope &&
  ((checkpoint.skippedIds ?? []).length || (checkpoint.completedPages ?? []).length)
) {
  console.log('checkpoint was created before musical support; skipped ids and completed pages will be checked again');
}

let page = 1;
let fetchedPages = 0;
let fetchedDetails = 0;

while (fetchedPages < options.maxPages && fetchedDetails < options.maxDetails) {
  if (completedPages.has(page)) {
    page += 1;
    continue;
  }

  const searchPayload = await fetchSearchPage(page, options.pageSize);
  fetchedPages += 1;

  const products = Array.isArray(searchPayload.Products) ? searchPayload.Products : [];
  const ids = Array.from(new Set(products.map((product) => product?.Id).filter(Boolean).map(String)));

  console.log(`page ${page}: ${ids.length} product ids`);

  for (const id of ids) {
    if (fetchedDetails >= options.maxDetails) break;
    if (completedIds.has(id) || skippedIds.has(id)) continue;

    const detail = await fetchProductDetail(id);
    fetchedDetails += 1;
    await appendJsonLine(paths.raw, detail);

    if (isIncludedTitleType(detail)) {
      const normalized = normalizeProduct(detail);
      await appendJsonLine(paths.normalizedJsonl, normalized);
      completedIds.add(id);
      console.log(`  saved title ${id}: ${normalized.title}`);
    } else {
      skippedIds.add(id);
      console.log(`  skipped unsupported title ${id}: ${detail?.PlayOrMusicalType ?? 'unknown'}`);
    }

    await writeCheckpoint(paths.checkpoint, { completedPages, completedIds, skippedIds });
  }

  if (fetchedDetails < options.maxDetails) {
    completedPages.add(page);
    await writeCheckpoint(paths.checkpoint, { completedPages, completedIds, skippedIds });
  }

  if (products.length < options.pageSize) break;
  page += 1;
}

await writeFinalJson(paths.normalizedJsonl, paths.normalizedJson);
console.log(`done: ${paths.normalizedJson}`);

function parseArgs(args) {
  const parsed = {
    out: path.resolve('scraped/concord'),
    pageSize: 1000,
    delayMs: 500,
    maxPages: Number.POSITIVE_INFINITY,
    maxDetails: Number.POSITIVE_INFINITY,
    fresh: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      index += 1;
      if (index >= args.length) throw new Error(`Missing value for ${arg}`);
      return args[index];
    };

    if (arg === '--out') parsed.out = path.resolve(next());
    else if (arg === '--page-size') parsed.pageSize = positiveInteger(next(), arg);
    else if (arg === '--delay-ms') parsed.delayMs = positiveInteger(next(), arg);
    else if (arg === '--max-pages') parsed.maxPages = positiveInteger(next(), arg);
    else if (arg === '--max-details') parsed.maxDetails = positiveInteger(next(), arg);
    else if (arg === '--fresh') parsed.fresh = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function positiveInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return number;
}

function printHelp() {
  console.log(`Usage: node scripts/scrape-concord-plays.mjs [options]

Options:
  --out <dir>           Output directory (default: scraped/concord)
  --page-size <n>       Search page size (default: 1000)
  --delay-ms <n>        Delay between API requests (default: 500)
  --max-pages <n>       Stop after fetching n search pages
  --max-details <n>     Stop after fetching n product details
  --fresh               Delete the output directory before scraping
`);
}

async function fetchSearchPage(pageNumber, pageSize) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('orderBy', 'DisplayOrder');
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('pageNumber', String(pageNumber - 1));
  url.searchParams.set('attributeIds', PLAY_ATTRIBUTES);
  return fetchJson(url);
}

async function fetchProductDetail(id) {
  return fetchJson(`${BASE_URL}/api/v1/products/${id}?includeAuthorTitles=false`);
}

async function fetchJson(url) {
  await sleep(options.delayMs);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'suoyunculari-concord-json-scraper/1.0',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : options.delayMs * 2 ** (attempt + 1);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`GET ${url}: ${response.status} ${response.statusText} ${body.slice(0, 200)}`);
      }

      return response.json();
    } catch (error) {
      if (attempt === 5) throw error;
      await sleep(options.delayMs * 2 ** (attempt + 1));
    }
  }

  throw new Error(`GET ${url}: rate limit retry budget exhausted`);
}

function normalizeProduct(detail) {
  const display = detail.TitleAttributeDisplayModel ?? {};
  const sourceId = String(detail.Id);
  const slug = detail.SeName || slugify(detail.Name || sourceId);
  const summaryHtml = detail.ShortDescription || '';
  const fullDescriptionHtml =
    detail.FullDescription || display.DescriptionFullDescription || summaryHtml || '';
  const castingText = display.CastingDetails || detail.TitleCasting || '';
  const castCounts = parseCastCounts(castingText);
  const genres = splitList(display.DescriptionGenre || genreFromTitle(detail.TitleTypeOfPlayAndGenre));
  const subgenres = splitList(display.DescriptionSubGenre);
  const themes = splitList(display.DescriptionThemes).length
    ? splitList(display.DescriptionThemes)
    : splitList(detail.Tags?.join(', '));

  return {
    source: 'concord_theatricals',
    source_id: sourceId,
    source_url: `${BASE_URL}/p/${sourceId}/${slug}`,
    scraped_at: new Date().toISOString(),
    title: detail.Name || '',
    slug,
    summary_text: htmlToText(summaryHtml),
    summary_html: summaryHtml,
    full_description_html: fullDescriptionHtml,
    authors: normalizeAuthors(detail.TitleAuthors ?? detail.Authors),
    play_type: display.DescriptionType || detail.PlayOrMusicalType || '',
    genres,
    subgenres,
    duration_text: (display.DescriptionDuration || '').trim(),
    duration_minutes: parseDurationMinutes(display.DescriptionDuration),
    casting_text: castingText,
    min_cast_size: castCounts.min,
    max_cast_size: castCounts.max,
    female_roles: castCounts.female,
    male_roles: castCounts.male,
    neutral_roles: castCounts.neutral,
    setting_html: display.DescriptionSettingsOfPlay || '',
    themes,
    target_audience: display.DescriptionTargetAudience || '',
    performance_groups: normalizePerformanceGroups(display),
    features: uniqueList([
      ...splitList(display.DescriptionFeaturesOfPlay),
      ...splitList(display.DescriptionUnitSet),
      ...splitList(display.DescriptionHeavyCostumes),
      ...splitList(display.DescriptionTimePeriod),
      ...splitList(display.DescriptionCuttingAloud),
    ]),
    cautions: splitList(display.DescriptionCautions),
    tags: splitList(detail.Tags?.join(', ')),
    rights_status: 'licensed',
    licensing_fee_text: htmlToText(detail.LicensingFeeDisplay || display.DescriptionLicensingFee || ''),
    imprint: detail.PublicImprint || detail.Imprint || '',
    isbn: detail.ISBN || '',
    sample_pdf_urls: normalizePdfUrls(detail.ProductPdfModels),
    image_urls: normalizeImageUrls(detail.ProductImages ?? detail.ProductImageModels),
  };
}

function isIncludedTitleType(detail) {
  return INCLUDED_TITLE_TYPES.has(detail?.PlayOrMusicalType);
}

function genreFromTitle(value) {
  if (!value) return '';
  const parts = String(value).split(',').map((part) => part.trim());
  return parts.slice(1).join(', ');
}

function normalizeAuthors(authors) {
  if (!Array.isArray(authors)) return [];

  return authors
    .map((author) => {
      const name = [author.FirstName, author.LastName].filter(Boolean).join(' ') || author.Name || '';
      const slug = author.SeName || slugify(name);
      return {
        id: author.Id,
        name,
        slug,
        source_url: author.Id && slug ? `${BASE_URL}/a/${author.Id}/${slug}` : undefined,
      };
    })
    .filter((author) => author.name);
}

function normalizePerformanceGroups(display) {
  if (Array.isArray(display.PerformanceGroups)) {
    return display.PerformanceGroups.map((group) => group?.Name).filter(Boolean);
  }

  return splitList(display.DescriptionPerformanceGroup);
}

function normalizePdfUrls(pdfs) {
  if (!Array.isArray(pdfs)) return [];
  return uniqueList(
    pdfs
      .filter((pdf) => /sample/i.test(`${pdf.Name ?? ''} ${pdf.Description ?? ''}`))
      .map((pdf) => pdf.Link)
      .filter(Boolean),
  );
}

function normalizeImageUrls(images) {
  if (!Array.isArray(images)) return [];
  return uniqueList(images.map((image) => image.ImageUrl || image.Url).filter(Boolean));
}

function parseDurationMinutes(value) {
  const text = String(value ?? '').toLowerCase();
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)/);
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60);

  const minuteMatch = text.match(/(\d+)\s*(?:minute|min)/);
  if (minuteMatch) return Number(minuteMatch[1]);

  return undefined;
}

function parseCastCounts(value) {
  const text = String(value ?? '').toLowerCase();
  const result = { male: undefined, female: undefined, neutral: undefined, min: undefined, max: undefined };
  const totals = { min: 0, max: 0 };
  let found = false;

  addRoleCount(text, /(\d+)(?:\s*-\s*(\d+))?\s*(?:m|male|men|man|boys?)\b/g, 'male');
  addRoleCount(text, /(\d+)(?:\s*-\s*(\d+))?\s*(?:f|female|women|woman|girls?)\b/g, 'female');
  addRoleCount(text, /(\d+)(?:\s*-\s*(\d+))?\s*(?:any|either|neutral|n)\b/g, 'neutral');

  if (found) {
    result.min = totals.min;
    result.max = totals.max;
  }

  return result;

  function addRoleCount(source, regex, key) {
    for (const match of source.matchAll(regex)) {
      const min = Number(match[1]);
      const max = Number(match[2] ?? match[1]);
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
      result[key] = (result[key] ?? 0) + max;
      totals.min += min;
      totals.max += max;
      found = true;
    }
  }
}

function splitList(value) {
  if (Array.isArray(value)) return uniqueList(value.map(String).map((item) => item.trim()).filter(Boolean));
  if (!value) return [];

  return uniqueList(
    String(value)
      .split(/[,;|]/)
      .map((item) => htmlToText(item).trim())
      .filter(Boolean),
  );
}

function uniqueList(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function htmlToText(value) {
  return decodeEntities(String(value ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function readCheckpoint(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return {
      completedPages: [],
      completedIds: [],
      skippedIds: [],
    };
  }
}

function completedPagesForCurrentPagination(checkpoint) {
  const completedPages = (checkpoint.completedPages ?? [])
    .map(Number)
    .filter((completedPage) => Number.isInteger(completedPage) && completedPage > 0);

  if (checkpoint.recordScope !== CHECKPOINT_RECORD_SCOPE) {
    return [];
  }

  if (checkpoint.paginationMode === CHECKPOINT_PAGINATION_MODE) {
    return completedPages;
  }

  return completedPages.filter((completedPage) => completedPage === 1);
}

function skippedIdsForCurrentScope(checkpoint) {
  if (checkpoint.recordScope !== CHECKPOINT_RECORD_SCOPE) {
    return [];
  }

  return (checkpoint.skippedIds ?? []).map(String);
}

async function writeCheckpoint(file, state) {
  await writeFile(
    file,
    JSON.stringify(
      {
        paginationMode: CHECKPOINT_PAGINATION_MODE,
        recordScope: CHECKPOINT_RECORD_SCOPE,
        completedPages: Array.from(state.completedPages).sort((a, b) => a - b),
        completedIds: Array.from(state.completedIds).sort(),
        skippedIds: Array.from(state.skippedIds).sort(),
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

async function appendJsonLine(file, value) {
  await appendFile(file, `${JSON.stringify(value)}\n`);
}

async function writeFinalJson(jsonlFile, jsonFile) {
  let text = '';
  try {
    text = await readFile(jsonlFile, 'utf8');
  } catch {
    await writeFile(jsonFile, '[]\n');
    return;
  }

  const rows = text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const byId = new Map(rows.map((row) => [row.source_id, row]));
  const sorted = Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title));
  await writeFile(jsonFile, `${JSON.stringify(sorted, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
