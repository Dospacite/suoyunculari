#!/usr/bin/env node

import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.dramaonlinelibrary.com';
const SEARCH_URL = `${BASE_URL}/app/search`;
const DETAIL_URL = `${BASE_URL}/app/gethtmlcontent`;
const SEARCH_QUERY = 'any=1&stype=pfinder';
const PAGE_SIZE = 10;

const options = parseArgs(process.argv.slice(2));

if (options.fresh && existsSync(options.out)) {
  await rm(options.out, { recursive: true, force: true });
}

await mkdir(options.out, { recursive: true });

const paths = {
  rawSearchResults: path.join(options.out, 'raw-search-results.jsonl'),
  rawDetails: path.join(options.out, 'raw-details.jsonl'),
  normalizedJsonl: path.join(options.out, 'drama-online-plays.jsonl'),
  normalizedJson: path.join(options.out, 'drama-online-plays.json'),
  checkpoint: path.join(options.out, 'checkpoint.json'),
};

const checkpoint = await readCheckpoint(paths.checkpoint);
const completedPages = new Set(checkpoint.completedPages ?? []);
const completedIds = new Set((checkpoint.completedIds ?? []).map(String));
const skippedIds = new Set((checkpoint.skippedIds ?? []).map(String));

let page = 0;
let fetchedPages = 0;
let fetchedDetails = 0;

while (fetchedPages < options.maxPages && fetchedDetails < options.maxDetails) {
  if (completedPages.has(page)) {
    page += 1;
    continue;
  }

  const searchHtml = await fetchSearchPage(page);
  fetchedPages += 1;

  const searchPage = parseSearchPage(searchHtml, page);
  await appendJsonLine(paths.rawSearchResults, {
    page,
    totalResults: searchPage.totalResults,
    totalPages: searchPage.totalPages,
    records: searchPage.records,
  });

  console.log(`page ${page + 1}: ${searchPage.records.length} play records`);

  for (const searchRecord of searchPage.records) {
    if (fetchedDetails >= options.maxDetails) break;

    const id = searchRecord.source_id;
    if (!id) {
      skippedIds.add(`${page}:missing-source-id:${searchRecord.title ?? ''}`);
      continue;
    }

    if (completedIds.has(id) || skippedIds.has(id)) continue;

    const detailHtml = await fetchPlayDetail(searchRecord);
    fetchedDetails += 1;

    const rawDetail = {
      source_id: id,
      source_url: searchRecord.source_url,
      search_record: searchRecord,
      detail_html: detailHtml,
    };
    await appendJsonLine(paths.rawDetails, rawDetail);

    const normalized = normalizePlay(searchRecord, detailHtml);
    await appendJsonLine(paths.normalizedJsonl, normalized);

    completedIds.add(id);
    await writeCheckpoint(paths.checkpoint, { completedPages, completedIds, skippedIds });
    console.log(`  saved play ${id}: ${normalized.title}`);
  }

  if (fetchedDetails < options.maxDetails) {
    completedPages.add(page);
    await writeCheckpoint(paths.checkpoint, { completedPages, completedIds, skippedIds });
  }

  if (searchPage.totalPages && page + 1 >= searchPage.totalPages) break;
  if (!searchPage.totalPages && searchPage.records.length < PAGE_SIZE) break;

  page += 1;
}

await writeFinalJson(paths.normalizedJsonl, paths.normalizedJson);
console.log(`done: ${paths.normalizedJson}`);

function parseArgs(args) {
  const parsed = {
    out: path.resolve('scraped/drama-online'),
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
    else if (arg === '--delay-ms') parsed.delayMs = nonNegativeInteger(next(), arg);
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

function nonNegativeInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return number;
}

function printHelp() {
  console.log(`Usage: node scripts/scrape-drama-online-plays.mjs [options]

Options:
  --out <dir>           Output directory (default: scraped/drama-online)
  --delay-ms <n>        Delay between HTTP requests (default: 500)
  --max-pages <n>       Stop after fetching n search pages
  --max-details <n>     Stop after fetching n play detail pages
  --fresh               Delete the output directory before scraping
`);
}

async function fetchSearchPage(pageNumber) {
  const pageQuery = pageNumber > 0 ? `${SEARCH_QUERY}&page=${pageNumber}` : SEARCH_QUERY;
  const body = new URLSearchParams({
    advURL: pageQuery,
    langCK: 'en',
    accountid: '0',
    territory: 'TR',
    advancePlaySearch: 'pfinder',
    urlModify: pageQuery,
    signupDisabled: 'false',
    relativeURL: 'advanced-play-search',
    fmYear: '',
    toYear: '',
    taxonomyValue: '',
    refineResultsTxt: 'Refine Results',
    clearAllLnk: 'Clear All',
    hideAllLnk: 'Hide All Filters',
    dateFileterHide: 'hide',
    dateRange: 'Date Range',
    fromTxt: 'From',
    toTxt: 'To',
    goTxt: 'Go',
    moreTxt: 'More...',
    accessTxt: 'Access',
    showOnlyTxt: 'Only Show content which I have full access to',
    resultsText: 'Search Results',
    taxurl: '',
    pageImageSize: '20',
    pageSize: String(PAGE_SIZE),
    pageNumber: String(pageNumber),
    searchid: '$searchid',
    searchSavedTxt: 'Unsave this search',
    saveThisSearch: 'Save this Search',
    searchType: "$cookietool.get('type')",
    sortType: '',
    fieldType: '',
    sortByLbl: 'Sort By',
    relevanceTxt: 'Relevance',
    titleAscTxt: 'Title Ascending',
    titleDescTxt: 'Title Descending',
    dateAscTxt: 'Date Ascending',
    dateDescTxt: 'Date Descending',
    resultPerPage: 'Results Per Page',
    ofTxt: 'of',
    pagesTxt: 'pages',
    pageTxt: 'page',
    subscriptionRequiredText: 'Subscription Required',
    saveSearchOverlayTxt:
      'This item is only available to the members of institutions that have purchased access. If you belong to such an institution please',
    companionUrl: '',
    FullPageName: `/search-results?${pageQuery}`,
    logIn: 'Log In',
    hideDetailsTxt: 'Hide all content details',
    starIcon: 'icon-search_star',
    starIconOutline: 'icon-search_star_outline',
    matchTxt: 'match',
    matchesTxt: 'matches',
    encodedQuery: '1',
    noResultFound: 'No Result(s) Found.',
    noResultSecond:
      'Please check your spelling, or try using the Advanced Search, Explore or Browse links above to find what you are looking for.',
    noResultThird:
      'If you have any filters applied to your search, you can remove them below to expand the parameters of your search and discover more content.',
    fullURL: `/doall/search-results?${pageQuery}`,
    sw: '',
  });

  return fetchText(SEARCH_URL, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `${BASE_URL}/search-results?${pageQuery}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });
}

async function fetchPlayDetail(searchRecord) {
  const body = new URLSearchParams({
    tocId: searchRecord.toc_id,
    contentType: 'playtext',
    docId: searchRecord.doc_id,
    cachepagetype: 'plyovrw',
    privacyPolicy: '',
    debug: '',
    sourceXML: normalizeSourceXmlPath(searchRecord.source_xml),
    sourceXSL: 'content-types/playtext/playtext-overview.xsl',
    lang: 'en',
    hideDetail: '',
    pgno: '',
    partid: '',
    docIdS: searchRecord.toc_id,
    docIdF: searchRecord.toc_id,
  });

  return fetchText(DETAIL_URL, {
    method: 'POST',
    headers: {
      Accept: 'text/html, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: searchRecord.source_url,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });
}

async function fetchText(url, init) {
  await sleep(options.delayMs);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          'User-Agent': 'suoyunculari-drama-online-html-scraper/1.0',
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(45000),
      });

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : options.delayMs * 2 ** (attempt + 1);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${init.method ?? 'GET'} ${url}: ${response.status} ${response.statusText} ${body.slice(0, 200)}`);
      }

      return response.text();
    } catch (error) {
      if (attempt === 5) throw error;
      await sleep(options.delayMs * 2 ** (attempt + 1));
    }
  }

  throw new Error(`${init.method ?? 'GET'} ${url}: retry budget exhausted`);
}

function parseSearchPage(html, pageNumber) {
  const $ = cheerio.load(html);
  const pagination = $('[data-page][data-total][data-size]').last();
  const totalPages = numberOrUndefined(pagination.attr('data-total'));
  const pageSize = numberOrUndefined(pagination.attr('data-size')) ?? PAGE_SIZE;
  const totalResults = parseTotalResults($('#page-info').text()) ?? (totalPages ? totalPages * pageSize : undefined);

  const records = $('.search_res_acc')
    .toArray()
    .map((element, index) => parseSearchRecord($, $(element), pageNumber, index))
    .filter(Boolean);

  return { records, totalPages, totalResults };
}

function parseSearchRecord($, card, pageNumber, index) {
  const titleLink = card.find('a.search-result-link.search-title').first();
  const href = attr(titleLink, 'href');
  if (!href) return undefined;

  const sourceUrl = absoluteUrl(href);
  const parsedUrl = new URL(sourceUrl);
  const docId = parsedUrl.searchParams.get('docid') || '';
  const tocId = parsedUrl.searchParams.get('tocid') || '';
  if (!docId || !tocId) return undefined;

  const title =
    cleanText(titleLink.find('#title').first().text()) ||
    cleanText(titleLink.find('.Title-Truc').first().text()) ||
    cleanText(titleLink.text());
  const authors = parseSearchAuthors($, card);
  const summaryLink = card.find('a#summary[href*="playtext-overview"]').first();
  const summaryUrl = attr(summaryLink, 'href') ? absoluteUrl(attr(summaryLink, 'href')) : sourceUrl;
  const imageUrl = attr(card.find('img.search_img').first(), 'data-src') || attr(card.find('img.search_img').first(), 'src');
  const castingText = cleanText(card.find('.search-acts').first().text());

  return {
    page: pageNumber,
    index,
    source_id: tocId,
    doc_id: docId,
    toc_id: tocId,
    source_url: sourceUrl,
    summary_url: summaryUrl,
    title,
    slug: slugify(title || tocId),
    authors,
    content_type: cleanText(card.find('.art_title').first().attr('aria-label') || card.find('.art_title').first().text()),
    source_xml: attr(card.find('.search-xml-source').first(), 'value'),
    imprint: attr(card.find('.search-imprint').first(), 'value'),
    publication_year: attr(card.find('.search-publication-year').first(), 'value'),
    subtitle: attr(card.find('.search-sub-title').first(), 'value'),
    casting_text: castingText,
    match_count: numberOrUndefined(cleanText(card.find('.match_found.hidden-xs').first().text())),
    summary_text: extractSearchSummaryText(card),
    image_urls: imageUrl ? [absoluteUrl(imageUrl)] : [],
  };
}

function parseSearchAuthors($, card) {
  const marked = parseContributorMarkers(card.find('.playtext-authors').first().text());
  const writtenBy = marked.filter((author) => /written by/i.test(author.role));
  const source = writtenBy.length > 0 ? writtenBy : marked;

  if (source.length > 0) {
    return normalizeAuthorObjects(source.map((author) => author.name));
  }

  return normalizeAuthorObjects(
    card
      .find('.multi-author .search-author a')
      .toArray()
      .map((element) => cleanText($(element).text())),
  );
}

function extractSearchSummaryText(card) {
  const body = card.find('.panel-body.loc8 .col-xs-12.col-sm-9, .panel-body.loc8 .col-md-10').first();
  const clone = body.clone();
  clone.find('h3, a, img').remove();
  return cleanText(clone.text());
}

function normalizePlay(searchRecord, detailHtml) {
  const $ = cheerio.load(detailHtml, { xmlMode: false });
  const facets = parseFacets($);
  const detailAuthors = parseDetailAuthors($);
  const authors = detailAuthors.length > 0 ? detailAuthors : searchRecord.authors;
  const title = cleanText($('#playtext-title-h').first().text()) || searchRecord.title;
  const slug = slugify(title || searchRecord.toc_id);
  const summaryHtml = cleanHtml($('#about-the-play').first().html()) || textToHtml(searchRecord.summary_text);
  const castingText = cleanText($('#actvalues').first().text()) || searchRecord.casting_text;
  const castCounts = parseCastCounts(castingText);
  const volume = parseVolumeMetadata($);
  const contributors = parseContributorMarkers($('#authors-playtext').text());
  const contributorFeatures = contributors
    .filter((contributor) => !/written by/i.test(contributor.role))
    .map((contributor) => `${contributor.role}: ${contributor.name}`);
  const productionEnquiryHtml = cleanHtml($('#collapseThree .panel-body').first().html());
  const rightsStatus = /subscription required|rights|licen[cs]e|copyright/i.test($.root().text())
    ? 'licensed'
    : 'licensed';

  return {
    source: 'drama_online_library',
    source_id: searchRecord.toc_id,
    source_url: searchRecord.source_url,
    scraped_at: new Date().toISOString(),
    title,
    slug,
    summary_text: htmlToText(summaryHtml),
    summary_html: summaryHtml,
    full_description_html: summaryHtml,
    authors,
    play_type: 'Playtext',
    genres: facets.genresAndForms ?? [],
    subgenres: [],
    duration_text: '',
    duration_minutes: undefined,
    casting_text: castingText,
    min_cast_size: castCounts.min,
    max_cast_size: castCounts.max,
    female_roles: castCounts.female,
    male_roles: castCounts.male,
    neutral_roles: castCounts.neutral,
    setting_html: textToHtml((facets.setting ?? []).join(', ')),
    themes: facets.themes ?? [],
    target_audience: '',
    performance_groups: [],
    features: uniqueList([
      ...contributorFeatures,
      ...listWithPrefix('Period first performed', facets.periodFirstPerformed),
      ...listWithPrefix('Play', facets.plays),
      ...listWithPrefix('Content set', volume.content_sets),
      searchRecord.subtitle,
      volume.edition ? `Edition: ${volume.edition}` : '',
      volume.publication_year ? `Publication year: ${volume.publication_year}` : '',
      volume.doi ? `DOI: ${volume.doi}` : '',
    ]),
    cautions: [],
    tags: uniqueList([
      searchRecord.content_type,
      volume.volume_title ? `Volume: ${volume.volume_title}` : '',
      volume.publisher ? `Publisher: ${volume.publisher}` : '',
    ]),
    rights_status: rightsStatus,
    licensing_fee_text: htmlToText(productionEnquiryHtml),
    imprint: volume.publisher || searchRecord.imprint || '',
    isbn: volume.online_isbn || volume.isbns[0] || '',
    sample_pdf_urls: [],
    image_urls: uniqueList([
      ...searchRecord.image_urls,
      ...$('img#coverImageUrl, #coverImageUrl img')
        .toArray()
        .map((element) => attr($(element), 'src') || attr($(element), 'data-src'))
        .filter(Boolean)
        .map(absoluteUrl),
    ]),
  };
}

function parseFacets($) {
  return {
    contentType: linkTexts($, $('#vol-contentType').first()),
    genresAndForms: linkTexts($, $('#vol-genresAndForms').first()),
    periodFirstPerformed: linkTexts($, $('#vol-periodFirstPerformed').first()),
    plays: linkTexts($, $('#vol-plays').first()),
    playwrights: linkTexts($, $('#vol-playwrights').first()),
    setting: linkTexts($, $('#vol-setting').first()),
    themes: linkTexts($, $('#vol-themes').first()),
  };
}

function parseDetailAuthors($) {
  const marked = parseContributorMarkers($('#authors-playtext').text());
  const writtenBy = marked.filter((author) => /written by/i.test(author.role));
  if (writtenBy.length > 0) return normalizeAuthorObjects(writtenBy.map((author) => author.name));

  return normalizeAuthorObjects(
    $('#writtenby a')
      .toArray()
      .map((element) => cleanText($(element).text())),
  );
}

function parseVolumeMetadata($) {
  const rows = {};

  $('.category_table li').each((_, element) => {
    const row = $(element);
    const label = cleanText(row.find('.cat_tab1').first().text()).replace(/:$/, '').toLowerCase();
    const valueNode = row.find('.cat_tab2').first();
    if (!label || valueNode.length === 0) return;

    rows[label] = {
      text: cleanText(valueNode.text()),
      links: linkTexts($, valueNode),
    };
  });

  const isbns = parseIsbns(rows.isbn?.text ?? '');

  return {
    doi: cleanText($('#doi-squid').attr('value') || $('.doi-content span').first().text()),
    volume_title: rows.title?.text ?? '',
    isbns,
    online_isbn: cleanText($('#isbn-squid').attr('value')) || isbns[0] || '',
    publication_year:
      cleanText($('#publicationYear').attr('value') || $('#pub-year').first().text()) ||
      cleanText($('#pubdate-squid').attr('value')),
    publisher:
      cleanText($('#imprintvalue').attr('value') || $('input#pubname-squid').attr('value')) ||
      rows.publisher?.text ||
      '',
    edition: rows.edition?.text ?? '',
    content_sets: rows['content set']?.links ?? [],
  };
}

function linkTexts($, selection) {
  return uniqueList(
    selection
      .find('a')
      .toArray()
      .map((element) => cleanText($(element).text())),
  );
}

function parseContributorMarkers(value) {
  const text = cleanText(value);
  if (!text) return [];

  const parts = text.split(/~playauthor~/).map((part) => part.trim()).filter(Boolean);

  return parts.flatMap((part) => {
    const [role = '', names = ''] = part.split('~').map((item) => cleanText(item));
    return names
      .split(/\s*,\s*|\s+and\s+/i)
      .map((name) => cleanText(name))
      .filter(Boolean)
      .map((name) => ({ role: role || 'Contributor', name }));
  });
}

function normalizeAuthorObjects(names) {
  return uniqueList(names.map(cleanText))
    .map((name) => ({
      name,
      slug: slugify(name),
      source_url: `${BASE_URL}/search-results?au=${encodeURIComponent(name)}`,
    }))
    .filter((author) => author.name);
}

function parseTotalResults(value) {
  const match = cleanText(value).match(/\bof\s+([\d,]+)\s+results/i);
  return match ? Number(match[1].replace(/,/g, '')) : undefined;
}

function parseIsbns(value) {
  return uniqueList(String(value ?? '').match(/\b97[89]\d{10}\b/g) ?? []);
}

function parseCastCounts(value) {
  const text = String(value ?? '').toLowerCase();
  const total = numberFromLabel(text, /\btotal\s*\((\d+)\)/i);
  const female = numberFromLabel(text, /\bfemale\s*\((\d+)\)/i);
  const male = numberFromLabel(text, /\bmale\s*\((\d+)\)/i);
  const neutral = numberFromLabel(text, /\b(?:unassigned|neutral)\s*\((\d+)\)/i);

  return {
    male,
    female,
    neutral,
    min: total,
    max: total,
  };
}

function numberFromLabel(text, regex) {
  const match = text.match(regex);
  return match ? Number(match[1]) : undefined;
}

function listWithPrefix(prefix, values) {
  return (values ?? []).map((value) => `${prefix}: ${value}`);
}

function normalizeSourceXmlPath(value) {
  const sourceXml = cleanText(value);
  if (!sourceXml) return '';
  if (sourceXml.includes('/')) return sourceXml;
  return `doall/174/content-types/playtext/subjects/${sourceXml}`;
}

function absoluteUrl(value) {
  if (!value) return '';
  return new URL(value, BASE_URL).toString();
}

function attr(selection, name) {
  return cleanText(selection.attr(name));
}

function cleanText(value) {
  return decodeEntities(String(value ?? '').replace(/\s+/g, ' ')).trim();
}

function cleanHtml(value) {
  return String(value ?? '').trim();
}

function textToHtml(value) {
  const text = cleanText(value);
  return text ? `<p>${escapeHtml(text)}</p>` : '';
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function numberOrUndefined(value) {
  const number = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : undefined;
}

function uniqueList(items) {
  return Array.from(new Set(items.filter(Boolean)));
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

async function writeCheckpoint(file, state) {
  await writeFile(
    file,
    JSON.stringify(
      {
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
