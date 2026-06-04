import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { cleanText, query } from '@/lib/yk';

const DEFAULT_STORAGE_DIR = '/var/lib/pingo-drive-files';
const DOCUMENT_DIRNAME = 'scripts';
const LEGACY_DOCUMENT_DIRNAME = 'local-pdfs';
const MAX_PDF_BYTES = 80 * 1024 * 1024;

export type LocalPdfDocument = {
  id: string;
  source: 'local' | 'drive';
  title: string;
  filename: string;
  bytes: number;
  createdAt: string;
  updatedAt: string;
  downloadHref: string;
  previewHref: string;
};

type DriveCachedPdfRow = QueryResultRow & {
  file_id: string;
  drive_name: string;
  local_filename: string;
  local_path: string;
  download_mime_type: string;
  bytes: number;
  downloaded_at: string;
  updated_at: string;
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

export const getScriptsDirectory = () => path.join(process.env.PINGO_DRIVE_STORAGE_DIR || DEFAULT_STORAGE_DIR, DOCUMENT_DIRNAME);
export const getLocalPdfDirectory = getScriptsDirectory;

export async function listLocalPdfDocuments(): Promise<LocalPdfDocument[]> {
  await migrateDocumentsToScriptsDirectory();
  const driveDocuments = await listDrivePdfDocuments();
  const driveFilenames = new Set(driveDocuments.map((document) => document.filename));
  const localDocuments = await listUploadedPdfDocuments(driveFilenames);
  return [...localDocuments, ...driveDocuments]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, 'tr'));
}

async function listUploadedPdfDocuments(excludedFilenames = new Set<string>()): Promise<LocalPdfDocument[]> {
  await ensureDocumentDir();
  const names = await fs.readdir(getLocalPdfDirectory()).catch(() => []);
  const documents = await Promise.all(
    names
      .filter((name) => isPdfFilename(name))
      .filter((name) => !excludedFilenames.has(name))
      .map(async (filename) => documentFromFilename(filename).catch(() => null)),
  );
  return documents
    .filter((document): document is LocalPdfDocument => Boolean(document));
}

async function listDrivePdfDocuments(): Promise<LocalPdfDocument[]> {
  const result = await query<DriveCachedPdfRow>(
    `select file_id,
            drive_name,
            local_filename,
            local_path,
            download_mime_type,
            bytes,
            downloaded_at::text,
            updated_at::text
       from pingo_drive_files
      where download_mime_type = 'application/pdf'
         or local_filename ~* '\\.pdf$'
      order by updated_at desc`,
  ).catch(() => ({ rows: [] as DriveCachedPdfRow[] }));
  const documents = await Promise.all(result.rows.map((row) => driveDocumentFromRow(row).catch(() => null)));
  return documents.filter((document): document is LocalPdfDocument => Boolean(document));
}

export async function getLocalPdfDocument(id: string) {
  await migrateDocumentsToScriptsDirectory();
  const ref = parseDocumentId(id);
  if (ref.source === 'local') return documentFromFilename(ref.value);
  return getDrivePdfDocument(ref.value);
}

export async function readLocalPdf(id: string) {
  await migrateDocumentsToScriptsDirectory();
  const ref = parseDocumentId(id);
  const document = await getLocalPdfDocument(id);
  const data = await fs.readFile(ref.source === 'local' ? localPathForId(ref.value) : await drivePathForId(ref.value));
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
  await migrateDocumentsToScriptsDirectory();
  const ref = parseDocumentId(id);
  if (ref.source === 'local') {
    const current = await documentFromFilename(ref.value);
    const nextId = buildRenamedFilename(ref.value, title);
    if (nextId !== current.filename) {
      await fs.rename(localPathForId(current.filename), localPathForId(nextId));
    }
    return documentFromFilename(nextId);
  }
  const row = await getDrivePdfRow(ref.value);
  const nextId = buildRenamedFilename(row.local_filename, title);
  const nextPath = localPathForId(nextId);
  if (nextPath !== row.local_path) {
    await fs.rename(row.local_path, nextPath);
  }
  await query(
    `update pingo_drive_files
        set drive_name = $1,
            local_filename = $2,
            local_path = $3,
            updated_at = now()
      where file_id = $4`,
    [titleFromFilename(nextId), nextId, nextPath, ref.value],
  );
  return getDrivePdfDocument(ref.value);
}

export async function deleteLocalPdfDocument(id: string) {
  const ref = parseDocumentId(id);
  await migrateDocumentsToScriptsDirectory();
  if (ref.source === 'local') {
    await fs.unlink(localPathForId(ref.value));
    return;
  }
  const row = await getDrivePdfRow(ref.value);
  await fs.unlink(row.local_path).catch(() => undefined);
  await query(`delete from pingo_drive_files where file_id = $1`, [ref.value]);
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
      candidates: documents.slice(0, 5).map((document) => ({ id: document.id, name: `${document.title} (${document.source})` })),
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
  const safeId = normalizeDocumentId(id);
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
  return normalizeDocumentId(id);
}

async function documentFromFilename(filename: string): Promise<LocalPdfDocument> {
  const filenameSafe = assertSafeDocumentFilename(filename);
  const stats = await fs.stat(localPathForId(filenameSafe));
  return {
    id: `local:${filenameSafe}`,
    source: 'local',
    title: titleFromFilename(filenameSafe),
    filename: filenameSafe,
    bytes: stats.size,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
    downloadHref: `/api/documents/${encodeURIComponent(`local:${filenameSafe}`)}/download`,
    previewHref: `/api/documents/${encodeURIComponent(`local:${filenameSafe}`)}/view`,
  };
}

async function driveDocumentFromRow(row: DriveCachedPdfRow): Promise<LocalPdfDocument> {
  await fs.access(row.local_path);
  return {
    id: `drive:${row.file_id}`,
    source: 'drive',
    title: row.drive_name.replace(/\.pdf$/i, '') || row.local_filename,
    filename: row.local_filename,
    bytes: Number(row.bytes) || 0,
    createdAt: row.downloaded_at,
    updatedAt: row.updated_at,
    downloadHref: `/api/documents/${encodeURIComponent(`drive:${row.file_id}`)}/download`,
    previewHref: `/api/documents/${encodeURIComponent(`drive:${row.file_id}`)}/view`,
  };
}

async function getDrivePdfDocument(fileId: string) {
  const row = await getDrivePdfRow(fileId);
  return driveDocumentFromRow(row);
}

async function drivePathForId(fileId: string) {
  return (await getDrivePdfRow(fileId)).local_path;
}

async function getDrivePdfRow(fileId: string) {
  const result = await query<DriveCachedPdfRow>(
    `select file_id,
            drive_name,
            local_filename,
            local_path,
            download_mime_type,
            bytes,
            downloaded_at::text,
            updated_at::text
       from pingo_drive_files
      where file_id = $1
        and (download_mime_type = 'application/pdf' or local_filename ~* '\\.pdf$')
      limit 1`,
    [assertSafeDriveFileId(fileId)],
  );
  const row = result.rows[0];
  if (!row) throw new Error('PDF not found.');
  return row;
}

async function migrateDocumentsToScriptsDirectory() {
  await ensureDocumentDir();
  await Promise.all([migrateLegacyLocalPdfs(), migrateDrivePdfsToScripts()]);
}

async function migrateLegacyLocalPdfs() {
  const legacyDir = path.join(process.env.PINGO_DRIVE_STORAGE_DIR || DEFAULT_STORAGE_DIR, LEGACY_DOCUMENT_DIRNAME);
  const filenames = await fs.readdir(legacyDir).catch(() => []);
  for (const filename of filenames.filter(isPdfFilename)) {
    const from = path.join(legacyDir, filename);
    const to = localPathForId(filename);
    if (from === to) continue;
    await fs.rename(from, to).catch(async (error) => {
      if (error?.code !== 'EEXIST') throw error;
      await fs.unlink(from).catch(() => undefined);
    });
  }
}

async function migrateDrivePdfsToScripts() {
  const result = await query<DriveCachedPdfRow>(
    `select file_id,
            drive_name,
            local_filename,
            local_path,
            download_mime_type,
            bytes,
            downloaded_at::text,
            updated_at::text
       from pingo_drive_files
      where download_mime_type = 'application/pdf'
         or local_filename ~* '\\.pdf$'`,
  ).catch(() => ({ rows: [] as DriveCachedPdfRow[] }));

  for (const row of result.rows) {
    const currentPath = row.local_path;
    const preferredFilename = uniqueFilename(row.local_filename || buildDocumentFilename(row.file_id, row.drive_name, 'pdf'));
    const preferredPath = localPathForId(preferredFilename);
    if (currentPath === preferredPath) continue;

    const exists = await fs.access(currentPath).then(() => true).catch(() => false);
    if (!exists) {
      if (await fileExists(preferredPath)) {
        await updateDrivePdfLocation(row.file_id, preferredFilename, preferredPath);
      }
      continue;
    }

    const desiredFilename = await nextAvailableDocumentFilename(preferredFilename);
    const desiredPath = localPathForId(desiredFilename);
    await fs.rename(currentPath, desiredPath);
    const stats = await fs.stat(desiredPath).catch(() => null);
    await updateDrivePdfLocation(row.file_id, desiredFilename, desiredPath, stats?.size ?? null);
  }
}

async function updateDrivePdfLocation(fileId: string, filename: string, filePath: string, bytes: number | null = null) {
  await query(
    `update pingo_drive_files
        set local_filename = $1,
            local_path = $2,
            bytes = coalesce($3, bytes),
            updated_at = now()
      where file_id = $4`,
    [filename, filePath, bytes, fileId],
  );
}

async function assertPdf(data: Buffer) {
  if (data.byteLength > MAX_PDF_BYTES) throw new Error('PDF is too large.');
  if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Only PDF files are supported.');
}

async function ensureDocumentDir() {
  await fs.mkdir(getScriptsDirectory(), { recursive: true });
}

function localPathForId(id: string) {
  return path.join(getScriptsDirectory(), assertSafeDocumentFilename(id));
}

async function nextAvailableDocumentFilename(filename: string) {
  const safeFilename = uniqueFilename(filename);
  if (!(await fileExists(localPathForId(safeFilename)))) return safeFilename;

  const stem = safeFilename.replace(/\.pdf$/i, '').slice(0, 168);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = uniqueFilename(`${stem}-${index}.pdf`);
    if (!(await fileExists(localPathForId(candidate)))) return candidate;
  }
  return uniqueFilename(`${stem}-${randomBytes(4).toString('hex')}.pdf`);
}

async function fileExists(filePath: string) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function assertSafeDocumentFilename(id: string) {
  const value = cleanText(id, 180);
  if (!isPdfFilename(value) || value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error('Invalid PDF id.');
  }
  return value;
}

function uniqueFilename(filename: string) {
  return assertSafeDocumentFilename(filename.replace(/-+/g, '-'));
}

function parseDocumentId(id: string): { source: 'local' | 'drive'; value: string } {
  const normalized = normalizeDocumentId(id);
  const [source, ...rest] = normalized.split(':');
  return { source: source as 'local' | 'drive', value: rest.join(':') };
}

function normalizeDocumentId(id: string) {
  const value = cleanText(safeUrlDecode(id), 260);
  const [source, ...rest] = value.split(':');
  const raw = rest.join(':');
  if (source === 'local') return `local:${assertSafeDocumentFilename(raw)}`;
  if (source === 'drive') return `drive:${assertSafeDriveFileId(raw)}`;
  if (isPdfFilename(value)) return `local:${assertSafeDocumentFilename(value)}`;
  throw new Error('Invalid PDF id.');
}

function safeUrlDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function assertSafeDriveFileId(id: string) {
  const value = cleanText(id, 180);
  if (!/^[a-zA-Z0-9_-]{8,180}$/.test(value)) throw new Error('Invalid Drive PDF id.');
  return value;
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

export function buildDocumentFilename(seed: string, name: string, extension = 'pdf') {
  const base = sanitizePdfTitle(name);
  const digest = createHmac('sha256', 'document-filename').update(seed).digest('hex').slice(0, 16);
  return uniqueFilename(`${digest}-${base}.${extension || 'pdf'}`);
}

function buildRenamedFilename(currentFilename: string, title: string) {
  const prefix = currentFilename.split('-', 1)[0] || randomBytes(5).toString('hex');
  return uniqueFilename(`${prefix}-${sanitizePdfTitle(title)}.pdf`);
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
