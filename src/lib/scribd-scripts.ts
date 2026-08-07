import { randomUUID } from 'node:crypto';
import { createLocalPdfToken, savePermanentScriptPdf } from '@/lib/local-documents';
import { downloadScribdPdf } from '@/lib/scribd-downloader';
import { cleanText } from '@/lib/yk';

const SCRIBD_BASE_URL = 'https://www.scribd.com';
const DEFAULT_PUBLIC_BASE_URL = 'https://assets.suoyunculari.com';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_WEBHOOK_PDF_BYTES = 100 * 1024 * 1024;

type ScribdSearchConfig = {
  maxResults: number;
};

type ScribdSearchOptions = {
  verbatim: boolean;
  page: number;
};

type ScribdSearchDocument = {
  id?: number | string;
  title?: string;
  type?: string;
  reader_url?: string;
  pageCount?: number | string | null;
  author?: { name?: string | null } | null;
  authors?: Array<{ name?: string | null }>;
  releasedAt?: string | null;
  ratingCount?: number | string | null;
  views?: string | number | null;
};

export type ScribdScriptResult = {
  index: number;
  id: string;
  title: string;
  url: string;
  pageCount: number | null;
  author: string;
  releasedAt: string;
  views: string;
  ratingCount: number | null;
};

export type ScribdScriptSearchResponse =
  | {
      kind: 'search';
      found: true;
      query: string;
      searchUrl: string;
      verbatim: boolean;
      page: number;
      totalPages: number | null;
      resultRangeStart: number | null;
      resultRangeEnd: number | null;
      totalResults: number | null;
      results: ScribdScriptResult[];
    }
  | {
      kind: 'search';
      found: false;
      query: string;
      searchUrl: string;
      verbatim?: boolean;
      page?: number;
      reason: 'missing_query' | 'not_found' | 'client_challenge' | 'invalid_response' | 'request_failed';
      error?: string;
    };

export type ScribdScriptDownloadResponse =
  | {
      kind: 'download';
      downloaded: true;
      source: {
        id: string;
        title: string;
        url: string;
        pageCount: number | null;
      };
      download: {
        url: string;
        expiresAt: string;
        cached: boolean;
        filename: string;
        mimeType: 'application/pdf';
        bytes: number;
        pageCount: number;
      };
    }
  | {
      kind: 'download';
      downloaded: false;
      reason: 'missing_selection' | 'invalid_url' | 'client_challenge' | 'download_failed';
      title?: string;
      url?: string;
      error?: string;
    };

export async function searchScribdScripts(
  args: Record<string, unknown>,
  rawConfig: Record<string, unknown> | undefined,
): Promise<ScribdScriptSearchResponse> {
  const query = cleanText(args.query ?? args.title ?? args.play, 220);
  const config = normalizeScribdSearchConfig(rawConfig);
  const options = normalizeScribdSearchOptions(args);
  const searchUrl = buildSearchPageUrl(query, options);
  if (!query) {
    return { kind: 'search', found: false, query, searchUrl, verbatim: options.verbatim, page: options.page, reason: 'missing_query' };
  }

  const webhookResult = await searchScribdScriptsViaWebhook(query, config.maxResults, options).catch((error) => ({
    kind: 'search' as const,
    found: false as const,
    query,
    searchUrl,
    verbatim: options.verbatim,
    page: options.page,
    reason: 'request_failed' as const,
    error: safeError(error),
  }));
  if (webhookResult) return webhookResult;

  const apiUrl = buildSearchApiUrl(query, options);
  let response: Response;
  let text = '';
  try {
    response = await request(apiUrl, searchUrl);
    text = await response.text();
  } catch (error) {
    return { kind: 'search', found: false, query, searchUrl, reason: 'request_failed', error: safeError(error) };
  }

  if (isScribdClientChallenge(text)) {
    return {
      kind: 'search',
      found: false,
      query,
      searchUrl,
      verbatim: options.verbatim,
      page: options.page,
      reason: 'client_challenge',
      error: 'Scribd returned a client challenge for the public search request.',
    };
  }

  if (!response.ok) {
    return { kind: 'search', found: false, query, searchUrl, verbatim: options.verbatim, page: options.page, reason: 'request_failed', error: `Scribd HTTP ${response.status}` };
  }

  const payload = parseJson<Record<string, unknown>>(text);
  if (!payload) {
    return { kind: 'search', found: false, query, searchUrl, verbatim: options.verbatim, page: options.page, reason: 'invalid_response', error: 'Scribd returned non-JSON search data.' };
  }

  const documents = extractDocuments(payload)
    .map(normalizeSearchDocument)
    .filter((item): item is Omit<ScribdScriptResult, 'index'> => Boolean(item))
    .slice(0, config.maxResults)
    .map((result, index) => ({ ...result, index: index + 1 }));

  if (!documents.length) {
    return { kind: 'search', found: false, query, searchUrl, verbatim: options.verbatim, page: options.page, reason: 'not_found' };
  }

  return {
    kind: 'search',
    found: true,
    query,
    searchUrl,
    verbatim: options.verbatim,
    page: toNumber(payload.current_page) ?? options.page,
    totalPages: toNumber(payload.page_count),
    resultRangeStart: toNumber(payload.resultRangeStart),
    resultRangeEnd: toNumber(payload.resultRangeEnd),
    totalResults: toNumber(getNested(payload, ['results', 'documents', 'content', 'count'])),
    results: documents,
  };
}

export async function downloadScribdScript(input: {
  url: string;
  title?: string;
  pageCount?: number | null;
}): Promise<ScribdScriptDownloadResponse> {
  const url = normalizeScribdDocumentUrl(input.url);
  if (!url) return { kind: 'download', downloaded: false, reason: 'invalid_url', url: cleanText(input.url, 500) };

  try {
    const result = await downloadScribdScriptViaWebhook({ url, title: input.title, pageCount: input.pageCount })
      .then((webhookResult) => webhookResult ?? downloadScribdPdf({ url, includeText: true }));
    const documentId = extractDocumentId(url) || url;
    const title = cleanText(input.title, 180) || result.filename.replace(/\.pdf$/i, '') || 'Scribd document';
    const document = await savePermanentScriptPdf({
      seed: `scribd:${documentId}`,
      filename: result.filename || `${title}.pdf`,
      data: result.pdf,
    });
    const token = createLocalPdfToken(document.id);
    return {
      kind: 'download',
      downloaded: true,
      source: {
        id: documentId,
        title,
        url,
        pageCount: input.pageCount ?? result.pageCount,
      },
      download: {
        url: `${getPublicDownloadBaseUrl()}/documents/${encodeURIComponent(token.value)}`,
        expiresAt: token.expiresAt,
        cached: false,
        filename: document.filename,
        mimeType: 'application/pdf',
        bytes: document.bytes,
        pageCount: result.pageCount,
      },
    };
  } catch (error) {
    const message = safeError(error);
    return {
      kind: 'download',
      downloaded: false,
      reason: message.toLowerCase().includes('client challenge') ? 'client_challenge' : 'download_failed',
      title: cleanText(input.title, 180) || undefined,
      url,
      error: message,
    };
  }
}

async function searchScribdScriptsViaWebhook(query: string, maxResults: number, options: ScribdSearchOptions): Promise<ScribdScriptSearchResponse | null> {
  const webhookUrl = cleanText(process.env.PINGO_SCRIBD_SEARCH_WEBHOOK_URL || process.env.PINGO_SCRIBD_WEBHOOK_URL, 600);
  if (!webhookUrl) return null;
  const payload = await postWebhook(webhookUrl, { action: 'search', query, maxResults, verbatim: options.verbatim, page: options.page });
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const results = rawResults
    .map(normalizeWebhookSearchResult)
    .filter((item): item is Omit<ScribdScriptResult, 'index'> => Boolean(item))
    .slice(0, maxResults)
    .map((result, index) => ({ ...result, index: index + 1 }));
  const searchUrl = buildSearchPageUrl(query, options);
  if (!results.length) {
    return { kind: 'search', found: false, query, searchUrl, verbatim: options.verbatim, page: options.page, reason: 'not_found' };
  }
  return {
    kind: 'search',
    found: true,
    query,
    searchUrl,
    verbatim: options.verbatim,
    page: toNumber(payload.page ?? payload.current_page) ?? options.page,
    totalPages: toNumber(payload.totalPages ?? payload.page_count),
    resultRangeStart: toNumber(payload.resultRangeStart ?? payload.result_range_start),
    resultRangeEnd: toNumber(payload.resultRangeEnd ?? payload.result_range_end),
    totalResults: toNumber(payload.totalResults ?? payload.total_results_count),
    results,
  };
}

async function downloadScribdScriptViaWebhook(input: { url: string; title?: string; pageCount?: number | null }) {
  const webhookUrl = cleanText(process.env.PINGO_SCRIBD_DOWNLOADER_WEBHOOK_URL || process.env.PINGO_SCRIBD_WEBHOOK_URL, 600);
  if (!webhookUrl) return null;
  const payload = await postWebhook(webhookUrl, {
    action: 'download',
    url: input.url,
    title: cleanText(input.title, 180),
    pageCount: input.pageCount,
    includeText: true,
  });
  const pdf = decodeWebhookPdf(payload);
  return {
    filename: cleanText(payload.filename, 180) || `${cleanText(input.title, 120) || 'scribd-document'}.pdf`,
    pdf,
    pageCount: toNumber(payload.pageCount) ?? input.pageCount ?? 0,
  };
}

async function postWebhook(webhookUrl: string, body: Record<string, unknown>) {
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new Error('Invalid Scribd webhook URL.');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('Scribd webhook URL must use HTTPS.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.PINGO_SCRIBD_WEBHOOK_SECRET ? { 'X-Pingo-Webhook-Secret': process.env.PINGO_SCRIBD_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !payload) {
      throw new Error(`Scribd webhook failed: ${cleanText(payload?.error ?? payload?.message, 300) || response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeWebhookPdf(payload: Record<string, unknown>) {
  const encoded = String(payload.pdfBase64 ?? payload.pdf_base64 ?? '').replace(/\s+/g, '');
  if (!encoded) throw new Error('Scribd webhook did not return pdfBase64.');
  const pdf = Buffer.from(encoded, 'base64');
  if (pdf.byteLength > MAX_WEBHOOK_PDF_BYTES) throw new Error('Scribd webhook PDF is too large.');
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Scribd webhook returned invalid PDF data.');
  return pdf;
}

export function normalizeScribdDocumentUrl(value: unknown) {
  const raw = cleanText(value, 600);
  if (!raw) return '';
  try {
    const url = new URL(raw, SCRIBD_BASE_URL);
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'scribd.com' && url.hostname !== 'www.scribd.com') return '';
    const match = url.pathname.match(/^\/document\/\d+(?:\/[^/?#]+)?/);
    if (!match) return '';
    return `${SCRIBD_BASE_URL}${match[0]}`;
  } catch {
    return '';
  }
}

function normalizeScribdSearchConfig(config: Record<string, unknown> | undefined): ScribdSearchConfig {
  return {
    maxResults: clampNumber(config?.maxResults, 6, 1, 12),
  };
}

function normalizeScribdSearchOptions(args: Record<string, unknown>): ScribdSearchOptions {
  return {
    verbatim: coerceBoolean(args.verbatim, true),
    page: clampNumber(args.page, 1, 1, 1000),
  };
}

function buildSearchApiUrl(query: string, options: ScribdSearchOptions) {
  const url = new URL('/search/query', SCRIBD_BASE_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('verbatim', String(options.verbatim));
  url.searchParams.set('page', String(options.page));
  url.searchParams.set('page_view_id', randomUUID());
  return url.toString();
}

function buildSearchPageUrl(query: string, options: ScribdSearchOptions = { verbatim: true, page: 1 }) {
  const url = new URL('/search', SCRIBD_BASE_URL);
  if (query) {
    url.searchParams.set('query', query);
    url.searchParams.set('verbatim', String(options.verbatim));
    if (options.page > 1) url.searchParams.set('page', String(options.page));
  }
  return url.toString();
}

async function request(url: string, referer: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: referer,
        'User-Agent': USER_AGENT,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractDocuments(payload: Record<string, unknown>): ScribdSearchDocument[] {
  const value = getNested(payload, ['results', 'documents', 'content', 'documents']);
  if (Array.isArray(value)) return value.filter(isRecord) as ScribdSearchDocument[];
  if (isRecord(value)) return Object.values(value).filter(isRecord) as ScribdSearchDocument[];
  return [];
}

function normalizeSearchDocument(document: ScribdSearchDocument): Omit<ScribdScriptResult, 'index'> | null {
  const id = cleanText(document.id, 80);
  const title = cleanText(document.title, 220);
  const url = normalizeScribdDocumentUrl(document.reader_url);
  if (!id || !title || !url || document.type !== 'document') return null;
  const pageCount = toNumber(document.pageCount);
  const ratingCount = toNumber(document.ratingCount);
  const author = cleanText(document.author?.name, 140) || cleanText(document.authors?.[0]?.name, 140);
  return {
    id,
    title,
    url,
    pageCount,
    author,
    releasedAt: cleanText(document.releasedAt, 40),
    views: cleanText(document.views, 40),
    ratingCount,
  };
}

function normalizeWebhookSearchResult(document: Record<string, unknown>): Omit<ScribdScriptResult, 'index'> | null {
  const title = cleanText(document.title, 220);
  const url = normalizeScribdDocumentUrl(document.url ?? document.reader_url ?? document.href);
  const id = cleanText(document.id, 80) || extractDocumentId(url);
  if (!id || !title || !url) return null;
  return {
    id,
    title,
    url,
    pageCount: toNumber(document.pageCount ?? document.page_count),
    author: cleanText(document.author, 140),
    releasedAt: cleanText(document.releasedAt ?? document.released_at, 40),
    views: cleanText(document.views, 40),
    ratingCount: toNumber(document.ratingCount ?? document.rating_count),
  };
}

function extractDocumentId(url: string) {
  return new URL(url).pathname.match(/^\/document\/(\d+)/)?.[1] || '';
}

function getNested(root: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function coerceBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  const cleaned = cleanText(value, 20).toLowerCase();
  if (['true', '1', 'yes', 'evet'].includes(cleaned)) return true;
  if (['false', '0', 'no', 'hayir', 'hayır'].includes(cleaned)) return false;
  return fallback;
}

function isScribdClientChallenge(html: string) {
  return /<title>\s*Client Challenge\s*<\/title>/i.test(html) || html.includes('/_fs-ch-') || html.includes('Please enable JavaScript to proceed');
}

function getPublicDownloadBaseUrl() {
  return (process.env.PINGO_DRIVE_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
