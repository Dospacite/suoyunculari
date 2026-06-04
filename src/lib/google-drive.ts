import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { APIContext } from 'astro';
import type { QueryResultRow } from 'pg';
import { buildDocumentFilename, getScriptsDirectory } from '@/lib/local-documents';
import { cleanText, hashToken, query } from '@/lib/yk';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly openid email profile';
const DEFAULT_PUBLIC_BASE_URL = 'https://assets.suoyunculari.com';
const MAX_FOLDER_SCAN = 500;
const MAX_FILE_SCAN = 700;

type DriveAuthRow = QueryResultRow & {
  id: number;
  account_email: string | null;
  scope: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  connected_at: string;
  updated_at: string;
};

type DriveOAuthStateRow = QueryResultRow & {
  state_hash: string;
  user_id: string;
  expires_at: string;
};

type DriveCachedFileRow = QueryResultRow & {
  file_id: string;
  drive_name: string;
  drive_mime_type: string;
  local_filename: string;
  local_path: string;
  download_mime_type: string;
  bytes: number;
  md5_checksum: string | null;
  downloaded_at: string;
  updated_at: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserinfoResponse = {
  email?: string;
};

type DriveListResponse = {
  nextPageToken?: string;
  files?: DriveFile[];
  error?: { message?: string };
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  md5Checksum?: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
};

type SearchConfig = {
  allowedFolderIds: string[];
  includeSubfolders: boolean;
  maxResults: number;
};

export type DriveStatus = {
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
  redirectUri: string;
  publicBaseUrl: string;
};

export type DriveScriptSearchResult =
  | {
      found: true;
      title: string;
      file: {
        id: string;
        name: string;
        mimeType: string;
        md5Checksum?: string;
        webViewLink?: string;
      };
      download: {
        url: string;
        expiresAt: string;
        cached: boolean;
        filename: string;
        mimeType: string;
        bytes: number;
      };
    }
  | {
      found: false;
      title: string;
      reason: 'not_configured' | 'not_connected' | 'not_found' | 'missing_title';
      searchedFolderCount?: number;
      candidates?: Array<{ name: string; id: string }>;
    };

export async function getGoogleDriveStatus(requestUrl?: URL): Promise<DriveStatus> {
  const auth = await getDriveAuth();
  const oauth = getOAuthConfig(requestUrl);
  return {
    configured: Boolean(oauth.clientId && oauth.clientSecret),
    connected: Boolean(auth?.refresh_token),
    accountEmail: auth?.account_email ?? null,
    connectedAt: auth?.connected_at ?? null,
    updatedAt: auth?.updated_at ?? null,
    redirectUri: oauth.redirectUri,
    publicBaseUrl: getPublicDownloadBaseUrl(),
  };
}

export async function createGoogleDriveAuthorizationUrl(context: APIContext) {
  const user = context.locals.user;
  if (!user) throw new Error('Unauthorized');
  const oauth = getOAuthConfig(context.url);
  if (!oauth.clientId || !oauth.clientSecret) throw new Error('Google Drive OAuth client is not configured');
  const state = randomBytes(32).toString('base64url');
  await query(
    `insert into pingo_drive_oauth_states (state_hash, user_id, expires_at)
     values ($1, $2, now() + interval '10 minutes')`,
    [hashToken(state), user.id],
  );
  const url = new URL(GOOGLE_OAUTH_AUTH_URL);
  url.searchParams.set('client_id', oauth.clientId);
  url.searchParams.set('redirect_uri', oauth.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', DRIVE_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function completeGoogleDriveAuthorization(context: APIContext) {
  const user = context.locals.user;
  if (!user) throw new Error('Unauthorized');
  const code = context.url.searchParams.get('code') || '';
  const state = context.url.searchParams.get('state') || '';
  if (!code || !state) throw new Error('Google Drive authorization was cancelled or incomplete');
  const stateHash = hashToken(state);
  const stateResult = await query<DriveOAuthStateRow>(
    `delete from pingo_drive_oauth_states
      where state_hash = $1
        and user_id = $2
        and expires_at > now()
      returning state_hash, user_id, expires_at::text`,
    [stateHash, user.id],
  );
  if (!stateResult.rowCount) throw new Error('Google Drive authorization state is invalid or expired');

  const oauth = getOAuthConfig(context.url);
  const token = await postGoogleToken({
    code,
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    redirect_uri: oauth.redirectUri,
    grant_type: 'authorization_code',
  });
  if (!token.refresh_token) {
    const existing = await getDriveAuth();
    if (!existing?.refresh_token) {
      throw new Error('Google did not return a refresh token. Reconnect with consent or remove the app grant in Google Account settings and try again.');
    }
  }
  const accountEmail = await fetchGoogleUserEmail(token.access_token);
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  await query(
    `insert into pingo_drive_auth (id, account_email, scope, access_token, refresh_token, expires_at, connected_by)
     values (1, $1, $2, $3, $4, $5, $6)
     on conflict (id)
     do update set account_email = excluded.account_email,
                   scope = excluded.scope,
                   access_token = excluded.access_token,
                   refresh_token = coalesce(excluded.refresh_token, pingo_drive_auth.refresh_token),
                   expires_at = excluded.expires_at,
                   connected_by = excluded.connected_by,
                   updated_at = now()`,
    [accountEmail, token.scope ?? null, token.access_token ?? null, token.refresh_token ?? null, expiresAt, user.id],
  );
}

export async function disconnectGoogleDrive() {
  await query(`delete from pingo_drive_auth where id = 1`);
}

export async function searchGoogleDriveScript(
  args: Record<string, unknown>,
  rawConfig: Record<string, unknown> | undefined,
  onFound?: (file: { id: string; name: string }) => Promise<void>,
): Promise<DriveScriptSearchResult> {
  const title = cleanText(args.title ?? args.query ?? args.play, 220);
  if (!title) return { found: false, title, reason: 'missing_title' };

  const config = normalizeDriveSearchConfig(rawConfig);
  if (!config.allowedFolderIds.length) return { found: false, title, reason: 'not_configured' };
  const auth = await getDriveAuth();
  if (!auth?.refresh_token) return { found: false, title, reason: 'not_connected' };

  const accessToken = await getGoogleDriveAccessToken();
  const folderIds = config.includeSubfolders
    ? await collectDriveFolderIds(accessToken, config.allowedFolderIds)
    : config.allowedFolderIds;
  const files = await searchDriveFiles(accessToken, title, folderIds, config.maxResults);
  const ranked = files
    .map((file) => ({ file, score: scoreDriveFile(title, file) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name));
  const match = ranked[0]?.file;
  if (!match) {
    return {
      found: false,
      title,
      reason: 'not_found',
      searchedFolderCount: folderIds.length,
      candidates: files.slice(0, 5).map((file) => ({ id: file.id, name: file.name })),
    };
  }

  await onFound?.({ id: match.id, name: match.name });
  const cached = await ensureDriveFileDownloaded(accessToken, match);
  const token = await createDriveDownloadToken(match.id);
  const downloadUrl = `${getPublicDownloadBaseUrl()}/drive/${encodeURIComponent(token.value)}`;
  return {
    found: true,
    title,
    file: {
      id: match.id,
      name: match.name,
      mimeType: match.mimeType,
      md5Checksum: match.md5Checksum,
      webViewLink: match.webViewLink,
    },
    download: {
      url: downloadUrl,
      expiresAt: token.expiresAt,
      cached: cached.wasCached,
      filename: cached.file.local_filename,
      mimeType: cached.file.download_mime_type,
      bytes: cached.file.bytes,
    },
  };
}

export async function getDriveDownloadByToken(token: string) {
  const result = await query<DriveCachedFileRow>(
    `select f.file_id,
            f.drive_name,
            f.drive_mime_type,
            f.local_filename,
            f.local_path,
            f.download_mime_type,
            f.bytes,
            f.md5_checksum,
            f.downloaded_at::text,
            f.updated_at::text
       from pingo_drive_download_tokens t
       join pingo_drive_files f on f.file_id = t.file_id
      where t.token_hash = $1
        and t.expires_at > now()
      limit 1`,
    [hashToken(token)],
  );
  const file = result.rows[0];
  if (!file) return null;
  const data = await fs.readFile(file.local_path).catch(() => null);
  if (!data) return null;
  return { file, data };
}

function getOAuthConfig(requestUrl?: URL) {
  const origin = requestUrl ? `${requestUrl.protocol}//${requestUrl.host}` : '';
  return {
    clientId: process.env.PINGO_GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.PINGO_GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri:
      process.env.PINGO_GOOGLE_DRIVE_REDIRECT_URI ||
      process.env.GOOGLE_DRIVE_REDIRECT_URI ||
      (origin ? `${origin}/api/pingo/drive/oauth/callback` : ''),
  };
}

function getPublicDownloadBaseUrl() {
  return (process.env.PINGO_DRIVE_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

async function getDriveAuth() {
  const result = await query<DriveAuthRow>(
    `select id,
            account_email,
            scope,
            access_token,
            refresh_token,
            expires_at::text,
            connected_at::text,
            updated_at::text
       from pingo_drive_auth
      where id = 1`,
  );
  return result.rows[0] ?? null;
}

async function getGoogleDriveAccessToken() {
  const auth = await getDriveAuth();
  if (!auth?.refresh_token) throw new Error('Google Drive is not connected');
  if (auth.access_token && auth.expires_at && new Date(auth.expires_at).getTime() > Date.now() + 60_000) {
    return auth.access_token;
  }
  const oauth = getOAuthConfig();
  const token = await postGoogleToken({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: auth.refresh_token,
    grant_type: 'refresh_token',
  });
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  await query(
    `update pingo_drive_auth
        set access_token = $1,
            scope = coalesce($2, scope),
            expires_at = $3,
            updated_at = now()
      where id = 1`,
    [token.access_token ?? null, token.scope ?? null, expiresAt],
  );
  if (!token.access_token) throw new Error('Google Drive token refresh did not return an access token');
  return token.access_token;
}

async function postGoogleToken(params: Record<string, string>) {
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const payload = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!response.ok || !payload || payload.error) {
    throw new Error(`Google OAuth token request failed: ${payload?.error_description || payload?.error || response.status}`);
  }
  return payload;
}

async function fetchGoogleUserEmail(accessToken?: string) {
  if (!accessToken) return null;
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as GoogleUserinfoResponse | null;
  return cleanText(payload?.email, 240) || null;
}

function normalizeDriveSearchConfig(config: Record<string, unknown> | undefined): SearchConfig {
  const allowedFolderIds = normalizeStringList(config?.allowedFolderIds, 40, 180);
  return {
    allowedFolderIds,
    includeSubfolders: config?.includeSubfolders !== false,
    maxResults: clampNumber(config?.maxResults, 8, 1, 20),
  };
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(raw.map((item) => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

async function collectDriveFolderIds(accessToken: string, rootIds: string[]) {
  const seen = new Set(rootIds);
  let frontier = [...rootIds];
  while (frontier.length && seen.size < MAX_FOLDER_SCAN) {
    const current = frontier.splice(0, 15);
    const folders = await listDriveFiles(accessToken, {
      q: `trashed = false and mimeType = '${DRIVE_FOLDER_MIME}' and (${parentClause(current)})`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 100,
    });
    frontier = folders
      .map((folder) => folder.id)
      .filter((id) => {
        if (seen.has(id) || seen.size >= MAX_FOLDER_SCAN) return false;
        seen.add(id);
        return true;
      })
      .concat(frontier);
  }
  return [...seen];
}

async function searchDriveFiles(accessToken: string, title: string, folderIds: string[], maxResults: number) {
  const tokens = tokenizeTitle(title).slice(0, 4);
  const files = new Map<string, DriveFile>();
  for (const folderChunk of chunk(folderIds, 10)) {
    if (!folderChunk.length) continue;
    const termClause = tokens.length
      ? ` and (${tokens.map((token) => `name contains '${escapeDriveQueryValue(token)}'`).join(' or ')} or fullText contains '${escapeDriveQueryValue(title)}')`
      : '';
    const queried = await listDriveFiles(accessToken, {
      q: `trashed = false and mimeType != '${DRIVE_FOLDER_MIME}' and (${parentClause(folderChunk)})${termClause}`,
      fields: 'nextPageToken, files(id, name, mimeType, md5Checksum, size, modifiedTime, webViewLink)',
      pageSize: Math.max(maxResults * 5, 20),
    });
    for (const file of queried) files.set(file.id, file);
    if (files.size >= maxResults * 6) break;
  }

  if (files.size === 0) {
    for (const folderChunk of chunk(folderIds, 10)) {
      const queried = await listDriveFiles(accessToken, {
        q: `trashed = false and mimeType != '${DRIVE_FOLDER_MIME}' and (${parentClause(folderChunk)})`,
        fields: 'nextPageToken, files(id, name, mimeType, md5Checksum, size, modifiedTime, webViewLink)',
        pageSize: 100,
        maxPages: Math.ceil(MAX_FILE_SCAN / 100),
      });
      for (const file of queried) files.set(file.id, file);
      if (files.size >= MAX_FILE_SCAN) break;
    }
  }

  return [...files.values()].slice(0, Math.max(MAX_FILE_SCAN, maxResults * 10));
}

async function listDriveFiles(
  accessToken: string,
  input: { q: string; fields: string; pageSize: number; maxPages?: number },
) {
  const files: DriveFile[] = [];
  let pageToken = '';
  let page = 0;
  do {
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set('q', input.q);
    url.searchParams.set('fields', input.fields);
    url.searchParams.set('pageSize', String(input.pageSize));
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = (await response.json().catch(() => null)) as DriveListResponse | null;
    if (!response.ok || !payload) throw new Error(`Google Drive list failed: ${payload?.error?.message || response.status}`);
    files.push(...(payload.files ?? []));
    pageToken = payload.nextPageToken || '';
    page += 1;
  } while (pageToken && page < (input.maxPages ?? 5));
  return files.filter((file) => file.id && file.name && file.mimeType);
}

async function ensureDriveFileDownloaded(accessToken: string, file: DriveFile) {
  const cached = await getCachedDriveFile(file.id);
  if (cached && (!file.md5Checksum || cached.md5_checksum === file.md5Checksum) && (await fileExists(cached.local_path))) {
    return { file: await ensureCachedDriveFileInScripts(cached), wasCached: true };
  }

  const download = await downloadDriveFile(accessToken, file);
  await fs.mkdir(getScriptsDirectory(), { recursive: true });
  const localFilename = buildDocumentFilename(file.id, file.name, download.extension);
  const localPath = path.join(getScriptsDirectory(), localFilename);
  await fs.writeFile(localPath, download.data);
  const result = await query<DriveCachedFileRow>(
    `insert into pingo_drive_files
      (file_id, drive_name, drive_mime_type, local_filename, local_path, download_mime_type, bytes, md5_checksum)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (file_id)
     do update set drive_name = excluded.drive_name,
                   drive_mime_type = excluded.drive_mime_type,
                   local_filename = excluded.local_filename,
                   local_path = excluded.local_path,
                   download_mime_type = excluded.download_mime_type,
                   bytes = excluded.bytes,
                   md5_checksum = excluded.md5_checksum,
                   downloaded_at = now(),
                   updated_at = now()
     returning file_id,
               drive_name,
               drive_mime_type,
               local_filename,
               local_path,
               download_mime_type,
               bytes,
               md5_checksum,
               downloaded_at::text,
               updated_at::text`,
    [file.id, file.name, file.mimeType, localFilename, localPath, download.mimeType, download.data.byteLength, file.md5Checksum ?? null],
  );
  return { file: result.rows[0], wasCached: false };
}

async function downloadDriveFile(accessToken: string, file: DriveFile) {
  const exportMime = googleWorkspaceExportMime(file.mimeType);
  const url = exportMime
    ? `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(exportMime.mimeType)}`
    : `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Drive download failed for ${file.name}: ${response.status}`);
  const mimeType = exportMime?.mimeType || response.headers.get('content-type')?.split(';')[0] || file.mimeType || 'application/octet-stream';
  const extension = exportMime?.extension || extensionFromName(file.name) || extensionFromMime(mimeType);
  return { data: Buffer.from(await response.arrayBuffer()), mimeType, extension };
}

async function getCachedDriveFile(fileId: string) {
  const result = await query<DriveCachedFileRow>(
    `select file_id,
            drive_name,
            drive_mime_type,
            local_filename,
            local_path,
            download_mime_type,
            bytes,
            md5_checksum,
            downloaded_at::text,
            updated_at::text
       from pingo_drive_files
      where file_id = $1`,
    [fileId],
  );
  return result.rows[0] ?? null;
}

async function ensureCachedDriveFileInScripts(file: DriveCachedFileRow) {
  await fs.mkdir(getScriptsDirectory(), { recursive: true });
  const preferredFilename = buildDocumentFilename(file.file_id, file.drive_name, extensionFromName(file.local_filename) || extensionFromMime(file.download_mime_type));
  const preferredPath = path.join(getScriptsDirectory(), preferredFilename);
  if (file.local_path === preferredPath) return file;

  if (!(await fileExists(file.local_path))) {
    if (await fileExists(preferredPath)) {
      return updateCachedDriveFileLocation(file, preferredFilename, preferredPath);
    }
    return file;
  }

  const nextFilename = await nextAvailableScriptFilename(preferredFilename);
  const nextPath = path.join(getScriptsDirectory(), nextFilename);
  await fs.rename(file.local_path, nextPath);
  return updateCachedDriveFileLocation(file, nextFilename, nextPath);
}

async function updateCachedDriveFileLocation(file: DriveCachedFileRow, nextFilename: string, nextPath: string) {
  const stats = await fs.stat(nextPath).catch(() => null);
  const result = await query<DriveCachedFileRow>(
    `update pingo_drive_files
        set local_filename = $1,
            local_path = $2,
            bytes = coalesce($3, bytes),
            updated_at = now()
      where file_id = $4
      returning file_id,
                drive_name,
                drive_mime_type,
                local_filename,
                local_path,
                download_mime_type,
                bytes,
                md5_checksum,
                downloaded_at::text,
                updated_at::text`,
    [nextFilename, nextPath, stats?.size ?? null, file.file_id],
  );
  return result.rows[0] ?? { ...file, local_filename: nextFilename, local_path: nextPath, bytes: stats?.size ?? file.bytes };
}

async function nextAvailableScriptFilename(filename: string) {
  if (!(await fileExists(path.join(getScriptsDirectory(), filename)))) return filename;

  const extension = path.extname(filename) || '.pdf';
  const stem = filename.slice(0, -extension.length).slice(0, 168);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem}-${index}${extension}`;
    if (!(await fileExists(path.join(getScriptsDirectory(), candidate)))) return candidate;
  }
  return `${stem}-${randomBytes(4).toString('hex')}${extension}`;
}

async function createDriveDownloadToken(fileId: string) {
  const value = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await query(
    `insert into pingo_drive_download_tokens (token_hash, file_id, expires_at)
     values ($1, $2, $3)`,
    [hashToken(value), fileId, expiresAt],
  );
  await query(`delete from pingo_drive_download_tokens where expires_at <= now()`);
  return { value, expiresAt };
}

function parentClause(folderIds: string[]) {
  return folderIds.map((id) => `'${escapeDriveQueryValue(id)}' in parents`).join(' or ');
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function scoreDriveFile(title: string, file: DriveFile) {
  const target = normalizeForMatch(title);
  const name = normalizeForMatch(removeExtension(file.name));
  const tokens = tokenizeTitle(title).map(normalizeForMatch).filter(Boolean);
  let score = 0;
  if (name === target) score += 100;
  if (name.includes(target)) score += 65;
  if (target.includes(name) && name.length > 4) score += 35;
  for (const token of tokens) {
    if (name.split(' ').includes(token)) score += 12;
    else if (name.includes(token)) score += 5;
  }
  if (isLikelyScriptFile(file)) score += 10;
  return score >= Math.max(16, Math.min(30, tokens.length * 10)) ? score : 0;
}

function tokenizeTitle(title: string) {
  return normalizeForMatch(title)
    .split(' ')
    .filter((token) => token.length > 1)
    .slice(0, 8);
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

function isLikelyScriptFile(file: DriveFile) {
  const extension = extensionFromName(file.name);
  return ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(extension) || file.mimeType.startsWith('application/vnd.google-apps.');
}

function googleWorkspaceExportMime(mimeType: string) {
  if (mimeType === 'application/vnd.google-apps.document') return { mimeType: 'application/pdf', extension: 'pdf' };
  if (mimeType === 'application/vnd.google-apps.presentation') return { mimeType: 'application/pdf', extension: 'pdf' };
  return null;
}

function extensionFromMime(mimeType: string) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/plain') return 'txt';
  if (mimeType.includes('wordprocessingml.document')) return 'docx';
  if (mimeType === 'application/msword') return 'doc';
  if (mimeType === 'application/rtf') return 'rtf';
  if (mimeType.includes('opendocument.text')) return 'odt';
  return 'bin';
}

function extensionFromName(name: string) {
  const extension = path.extname(name).replace(/^\./, '').toLowerCase();
  return extension.replace(/[^a-z0-9]/g, '').slice(0, 12);
}

function removeExtension(name: string) {
  return name.replace(/\.[a-z0-9]{1,12}$/i, '');
}

async function fileExists(filePath: string) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
