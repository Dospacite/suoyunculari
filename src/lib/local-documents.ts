import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cleanText } from '@/lib/yk';

const DEFAULT_STORAGE_DIR = '/var/lib/pingo-drive-files';
const DOCUMENT_DIRNAME = 'local-pdfs';
const MAX_PDF_BYTES = 80 * 1024 * 1024;

export type LocalPdfDocument = {
  id: string;
  title: string;
  filename: string;
  bytes: number;
  createdAt: string;
  updatedAt: string;
  downloadHref: string;
  previewHref: string;
};

export type LocalPdfSearchResult =
  | {
      found: true;
      title: string;
      file: {
        id: string;
        name: string;
        mimeType: 'application/pdf';
      };
      download: {
        url: string;
        expiresAt: string;
        cached: true;
        filename: string;
        mimeType: 'application/pdf';
        bytes: number;
      };
    }
  | {
      found: false;
      title: string;
      reason: 'missing_title' | 'not_found';
      candidates?: Array<{ name: string; id: string }>;
    };

export const getLocalPdfDirectory = () => path.join(process.env.PINGO_DRIVE_STORAGE_DIR || DEFAULT_STORAGE_DIR, DOCUMENT_DIRNAME);

export async function listLocalPdfDocuments(): Promise<LocalPdfDocument[]> {
  await ensureDocumentDir();
  const names = await fs.readdir(getLocalPdfDirectory()).catch(() => []);
  const documents = await Promise.all(
    names
      .filter((name) => isPdfFilename(name))
      .map(async (filename) => documentFromFilename(filename).catch(() => null)),
  );
  return documents
    .filter((document): document is LocalPdfDocument => Boolean(document))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, 'tr'));
}

export async function getLocalPdfDocument(id: string) {
  return documentFromFilename(assertSafeDocumentId(id));
}

export async function readLocalPdf(id: string) {
  const document = await getLocalPdfDocument(id);
  const data = await fs.readFile(localPathForId(document.id));
  return { document, data };
}

export async function saveLocalPdfDocument(input: { filename: string; data: Buffer }) {
  await ensureDocumentDir();
  await assertPdf(input.data);
  const base = sanitizePdfTitle(input.filename);
  const digest = randomBytes(5).toString('hex');
  const filename = uniqueFilename(`${digest}-${base}.pdf`);
  const filePath = localPathForId(filename);
  await fs.writeFile(filePath, input.data, { flag: 'wx' });
  return documentFromFilename(filename);
}

export async function uploadLocalPdfDocument(file: File) {
  if (file.type && file.type !== 'application/pdf') throw new Error('Only PDF files are supported.');
  if (!isPdfFilename(file.name)) throw new Error('Only PDF files are supported.');
  if (file.size > MAX_PDF_BYTES) throw new Error('PDF is too large.');
  return saveLocalPdfDocument({
    filename: file.name,
    data: Buffer.from(await file.arrayBuffer()),
  });
}

export async function renameLocalPdfDocument(id: string, title: string) {
  await ensureDocumentDir();
  const current = await getLocalPdfDocument(id);
  const nextTitle = sanitizePdfTitle(title);
  const prefix = current.id.split('-', 1)[0] || randomBytes(5).toString('hex');
  const nextId = uniqueFilename(`${prefix}-${nextTitle}.pdf`);
  if (nextId !== current.id) {
    await fs.rename(localPathForId(current.id), localPathForId(nextId));
  }
  return documentFromFilename(nextId);
}

export async function deleteLocalPdfDocument(id: string) {
  await fs.unlink(localPathForId(assertSafeDocumentId(id)));
}

export async function searchLocalPdfDocument(args: Record<string, unknown>): Promise<LocalPdfSearchResult> {
  const title = cleanText(args.title ?? args.query ?? args.play, 220);
  if (!title) return { found: false, title, reason: 'missing_title' };
  const documents = await listLocalPdfDocuments();
  const ranked = documents
    .map((document) => ({ document, score: scoreDocument(title, document) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title, 'tr'));
  const match = ranked[0]?.document;
  if (!match) {
    return {
      found: false,
      title,
      reason: 'not_found',
      candidates: documents.slice(0, 5).map((document) => ({ id: document.id, name: document.title })),
    };
  }
  const token = createLocalPdfToken(match.id);
  return {
    found: true,
    title,
    file: {
      id: match.id,
      name: match.title,
      mimeType: 'application/pdf',
    },
    download: {
      url: `${getPublicDownloadBaseUrl()}/documents/${encodeURIComponent(token.value)}`,
      expiresAt: token.expiresAt,
      cached: true,
      filename: match.filename,
      mimeType: 'application/pdf',
      bytes: match.bytes,
    },
  };
}

export function createLocalPdfToken(id: string, ttlMs = 24 * 60 * 60 * 1000) {
  const safeId = assertSafeDocumentId(id);
  const expiresAtMs = Date.now() + ttlMs;
  const payload = `${safeId}.${expiresAtMs}`;
  const signature = sign(payload);
  return {
    value: Buffer.from(`${payload}.${signature}`, 'utf8').toString('base64url'),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function verifyLocalPdfToken(token: string) {
  let decoded = '';
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const parts = decoded.split('.');
  if (parts.length < 3) return null;
  const signature = parts.pop() || '';
  const expiresAt = Number(parts.pop());
  const id = parts.join('.');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const payload = `${id}.${expiresAt}`;
  const expected = sign(payload);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  return assertSafeDocumentId(id);
}

async function documentFromFilename(filename: string): Promise<LocalPdfDocument> {
  const id = assertSafeDocumentId(filename);
  const stats = await fs.stat(localPathForId(id));
  return {
    id,
    title: titleFromFilename(id),
    filename: id,
    bytes: stats.size,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
    downloadHref: `/api/documents/${encodeURIComponent(id)}/download`,
    previewHref: `/api/documents/${encodeURIComponent(id)}/view`,
  };
}

async function assertPdf(data: Buffer) {
  if (data.byteLength > MAX_PDF_BYTES) throw new Error('PDF is too large.');
  if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Only PDF files are supported.');
}

async function ensureDocumentDir() {
  await fs.mkdir(getLocalPdfDirectory(), { recursive: true });
}

function localPathForId(id: string) {
  return path.join(getLocalPdfDirectory(), assertSafeDocumentId(id));
}

function assertSafeDocumentId(id: string) {
  const value = cleanText(id, 180);
  if (!isPdfFilename(value) || value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error('Invalid PDF id.');
  }
  return value;
}

function uniqueFilename(filename: string) {
  return assertSafeDocumentId(filename.replace(/-+/g, '-'));
}

function sanitizePdfTitle(value: string) {
  return (cleanText(value, 140) || 'document')
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110) || 'document';
}

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/^[a-f0-9]{10}-/i, '')
    .replace(/[-_]+/g, ' ')
    .trim() || filename;
}

function isPdfFilename(filename: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,178}\.pdf$/i.test(filename);
}

function getPublicDownloadBaseUrl() {
  return (process.env.PINGO_DRIVE_PUBLIC_BASE_URL || 'https://assets.suoyunculari.com').replace(/\/+$/, '');
}

function tokenSecret() {
  return process.env.YK_SESSION_SECRET || process.env.PINGO_WEBHOOK_SECRET || 'local-pdf-development-secret';
}

function sign(payload: string) {
  return createHmac('sha256', tokenSecret()).update(payload).digest('base64url');
}

function scoreDocument(query: string, document: LocalPdfDocument) {
  const target = normalizeForMatch(query);
  const name = normalizeForMatch(document.title);
  const tokens = target.split(' ').filter((token) => token.length > 1);
  let score = 0;
  if (name === target) score += 100;
  if (name.includes(target)) score += 65;
  for (const token of tokens) {
    if (name.split(' ').includes(token)) score += 14;
    else if (name.includes(token)) score += 5;
  }
  return score >= Math.max(12, Math.min(26, tokens.length * 8)) ? score : 0;
}

function normalizeForMatch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
