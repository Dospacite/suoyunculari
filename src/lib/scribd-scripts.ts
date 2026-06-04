import { randomUUID } from 'node:crypto';
import { createLocalPdfToken, savePermanentScriptPdf } from '@/lib/local-documents';
import { downloadScribdPdf } from '@/lib/scribd-downloader';
import { cleanText } from '@/lib/yk';

const SCRIBD_BASE_URL = 'https://www.scribd.com';
const DEFAULT_PUBLIC_BASE_URL = 'https://assets.suoyunculari.com';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 30_000;

type ScribdSearchConfig = {
  maxResults: number;
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
      totalResults: number | null;
      results: ScribdScriptResult[];
    }
  | {
      kind: 'search';
      found: false;
      query: string;
      searchUrl: string;
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
  const searchUrl = buildSearchPageUrl(query);
  if (!query) {
    return { kind: 'search', found: false, query, searchUrl, reason: 'missing_query' };
  }

  const apiUrl = buildSearchApiUrl(query);
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
      reason: 'client_challenge',
      error: 'Scribd returned a client challenge for the public search request.',
    };
  }

  if (!response.ok) {
    return { kind: 'search', found: false, query, searchUrl, reason: 'request_failed', error: `Scribd HTTP ${response.status}` };
  }

  const payload = parseJson<Record<string, unknown>>(text);
  if (!payload) {
    return { kind: 'search', found: false, query, searchUrl, reason: 'invalid_response', error: 'Scribd returned non-JSON search data.' };
  }

  const documents = extractDocuments(payload)
    .map(normalizeSearchDocument)
    .filter((item): item is Omit<ScribdScriptResult, 'index'> => Boolean(item))
    .slice(0, config.maxResults)
    .map((result, index) => ({ ...result, index: index + 1 }));

  if (!documents.length) {
    return { kind: 'search', found: false, query, searchUrl, reason: 'not_found' };
  }

  return {
    kind: 'search',
    found: true,
    query,
    searchUrl,
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
    const result = await downloadScribdPdf({ url, includeText: true });
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

function buildSearchApiUrl(query: string) {
  const url = new URL('/search/query', SCRIBD_BASE_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('verbatim', 'true');
  url.searchParams.set('page_view_id', randomUUID());
  return url.toString();
}

function buildSearchPageUrl(query: string) {
  const url = new URL('/search', SCRIBD_BASE_URL);
  if (query) {
    url.searchParams.set('query', query);
    url.searchParams.set('verbatim', 'true');
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

function isScribdClientChallenge(html: string) {
  return /<title>\s*Client Challenge\s*<\/title>/i.test(html) || html.includes('/_fs-ch-') || html.includes('Please enable JavaScript to proceed');
}

function getPublicDownloadBaseUrl() {
  return (process.env.PINGO_DRIVE_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
