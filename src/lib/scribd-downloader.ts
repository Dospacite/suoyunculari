import os from 'node:os';
import sharp from 'sharp';
import { load } from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const TEXT_LAYER_SCALE = 0.2;
const MAX_PAGE_FETCHES = 6;
const MAX_IMAGE_FETCHES = 8;
const CPU_COUNT = Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
const RENDER_CONCURRENCY = Math.max(1, Math.min(Number(process.env.SCRIBD_RENDER_CONCURRENCY || 0) || Math.ceil(CPU_COUNT / 2), 4));
const SHARP_CONCURRENCY = Math.max(1, Math.min(Number(process.env.SCRIBD_SHARP_CONCURRENCY || 0) || Math.ceil(CPU_COUNT / RENDER_CONCURRENCY), 4));
const REQUEST_TIMEOUT_MS = 60_000;

sharp.cache(false);
sharp.concurrency(SHARP_CONCURRENCY);

type FontInfo = {
  family: string;
  weight: string;
  style: string;
};

type PageAsset = {
  pageNum: number;
  contentUrl: string;
  origWidth: number;
  origHeight: number;
  fragment?: string;
};

type ImageLayer = {
  url: string;
  left: number;
  top: number;
  width: number | null;
  height: number | null;
  clip: [number, number, number, number] | null;
};

type TextRun = {
  text: string;
  left: number;
  top: number;
  fontSize: number;
  fontClass: string;
  color: [number, number, number];
};

type RenderedPage = {
  image: Buffer;
  width: number;
  height: number;
  textRuns: TextRun[];
};

export type ScribdDownloadOptions = {
  url: string;
  includeText: boolean;
  onProgress?: (progress: ScribdDownloadProgress) => void;
  signal?: AbortSignal;
};

export type ScribdDownloadResult = {
  filename: string;
  pdf: Buffer;
  pageCount: number;
};

export type ScribdDownloadProgress = {
  stage: string;
  done: number;
  total: number;
  percent: number;
};

export class ScribdDownloadError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'ScribdDownloadError';
  }
}

const isAllowedInitialUrl = (url: URL) => (
  url.protocol === 'https:' &&
  (url.hostname === 'scribd.com' || url.hostname === 'www.scribd.com')
);

const isAllowedAssetUrl = (url: URL) => (
  url.protocol === 'https:' &&
  ['html.scribdassets.com', 'html.scribd.com'].includes(url.hostname)
);

const assertAllowedSourceUrl = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ScribdDownloadError('Enter a valid Scribd document URL.');
  }
  if (!isAllowedInitialUrl(url)) {
    throw new ScribdDownloadError('Only https://www.scribd.com document URLs are supported.');
  }
  return url.href;
};

const normalizeAssetUrl = (rawUrl: string) => {
  let url = decodeEntities(rawUrl).trim().replace(/^['"]|['"]$/g, '');
  if (url.startsWith('http://html.scribd.com/')) {
    url = url.replace('http://html.scribd.com/', 'https://html.scribdassets.com/');
  } else if (url.startsWith('//')) {
    url = `https:${url}`;
  }
  return url;
};

const assertAllowedAssetUrl = (rawUrl: string) => {
  const normalized = normalizeAssetUrl(rawUrl);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new ScribdDownloadError(`Invalid asset URL: ${rawUrl}`);
  }
  if (!isAllowedAssetUrl(url)) {
    throw new ScribdDownloadError(`Blocked non-Scribd asset URL: ${url.hostname}`);
  }
  return url.href;
};

const decodeEntities = (value: string) => load('<span></span>')('span').html(value).text();

const parseStyle = (style: string | undefined) => {
  const result = new Map<string, string>();
  for (const part of (style ?? '').split(';')) {
    const index = part.indexOf(':');
    if (index === -1) continue;
    result.set(part.slice(0, index).trim().toLowerCase(), part.slice(index + 1).trim());
  }
  return result;
};

const parsePx = (value: string | null | undefined) => {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const parseClip = (value: string | null | undefined): [number, number, number, number] | null => {
  const match = String(value ?? '').match(/rect\(([^)]*)\)/);
  if (!match) return null;
  const nums = match[1].trim().split(/[,\s]+/).filter(Boolean).map(parsePx);
  if (nums.length !== 4 || nums.some((num) => num === null)) return null;
  return nums as [number, number, number, number];
};

const parseColor = (value: string | null | undefined): [number, number, number] => {
  const raw = String(value ?? '#000').trim().toLowerCase();
  if (raw.startsWith('#')) {
    let hex = raw.slice(1);
    if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
    if (/^[0-9a-f]{6}$/.test(hex)) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
  }
  const rgb = raw.match(/rgba?\(([^)]*)\)/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').slice(0, 3).map((part) => Math.max(0, Math.min(255, parseInt(part, 10) || 0)));
    return [r, g, b];
  }
  return [0, 0, 0];
};

const safeSlug = (value: string) => (
  value
    .normalize('NFKD')
    .replace(/[^\w .-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120) || 'scribd-document'
);

const withTimeoutSignal = (signal?: AbortSignal) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Request timed out.')), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    },
  };
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('Download cancelled.');
  }
};

const requestText = async (url: string, referer?: string, signal?: AbortSignal) => {
  const timeout = withTimeoutSignal(signal);
  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': referer ?? '',
        'User-Agent': USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new ScribdDownloadError(`HTTP ${response.status} fetching ${url}`, 502);
    }
    return response.text();
  } finally {
    timeout.cleanup();
  }
};

const requestBuffer = async (url: string, referer: string, signal?: AbortSignal) => {
  const timeout = withTimeoutSignal(signal);
  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': referer,
        'User-Agent': USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new ScribdDownloadError(`HTTP ${response.status} fetching ${url}`, 502);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    timeout.cleanup();
  }
};

const runPool = async <T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>, signal?: AbortSignal) => {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      throwIfAborted(signal);
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  }));
};

const extractState = (pageHtml: string) => {
  const match = pageHtml.match(/<script\b[^>]*type=["']application\/json["'][^>]*data-hypernova-key=["']doc_page["'][^>]*>(.*?)<\/script>/is);
  if (!match) return {};
  try {
    return JSON.parse(match[1].trim().replace(/^<!--/, '').replace(/-->$/, '').trim());
  } catch {
    return {};
  }
};

const parsePages = (pageHtml: string) => {
  const pages: PageAsset[] = [];
  for (const match of pageHtml.matchAll(/docManager\.addPage\(\s*\{(.*?)\}\s*\);/gs)) {
    const block = match[1];
    const pageNum = Number(block.match(/pageNum:\s*(\d+)/s)?.[1]);
    const origWidth = Number(block.match(/origWidth:\s*(\d+)/s)?.[1]);
    const origHeight = Number(block.match(/origHeight:\s*(\d+)/s)?.[1]);
    const contentUrl = block.match(/contentUrl:\s*"([^"]+)"/s)?.[1];
    if (pageNum && origWidth && origHeight && contentUrl) {
      pages.push({ pageNum, origWidth, origHeight, contentUrl: assertAllowedAssetUrl(contentUrl) });
    }
  }
  pages.sort((a, b) => a.pageNum - b.pageNum);
  if (!pages.length) {
    throw new ScribdDownloadError('No public page JSONP assets were found in the Scribd HTML.', 404);
  }
  return pages;
};

const parseFonts = (pageHtml: string) => {
  const fonts = new Map<string, FontInfo>();
  const pattern = /docManager\.addFont\(\s*\d+\s*,\s*"[^"]*"\s*,\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/gs;
  for (const match of pageHtml.matchAll(pattern)) {
    fonts.set(match[1], {
      family: match[2] || 'Arial, Helvetica, sans-serif',
      weight: match[3] || 'normal',
      style: match[4] || 'normal',
    });
  }
  return fonts;
};

const decodeJsonp = (text: string, pageNum: number) => {
  const match = text.match(new RegExp(`window\\.page${pageNum}_callback\\((.*)\\);\\s*$`, 's')) || text.match(/window\.page\d+_callback\((.*)\);\s*$/s);
  if (!match) throw new ScribdDownloadError(`Could not decode JSONP for page ${pageNum}.`, 502);
  const payload = JSON.parse(match[1]);
  if (!Array.isArray(payload) || !payload.length) {
    throw new ScribdDownloadError(`Unexpected JSONP payload for page ${pageNum}.`, 502);
  }
  return String(payload[0]);
};

const parseLayers = (fragment: string) => {
  const $ = load(`<main>${fragment}</main>`);
  const images: ImageLayer[] = [];
  const textRuns: TextRun[] = [];

  $('img').each((_idx, node) => {
    const img = $(node);
    const rawUrl = img.attr('orig') || img.attr('src');
    if (!rawUrl) return;
    const url = assertAllowedAssetUrl(rawUrl);
    const style = parseStyle(img.attr('style'));
    images.push({
      url,
      left: parsePx(style.get('left')) ?? 0,
      top: parsePx(style.get('top')) ?? 0,
      width: parsePx(style.get('width')),
      height: parsePx(style.get('height')),
      clip: parseClip(style.get('clip')),
    });
  });

  $('span.a').each((_idx, node) => {
    const span = $(node);
    const style = parseStyle(span.attr('style'));
    let fontSize = 80;
    let fontClass = '';
    let parent = span.parent();
    while (parent.length) {
      const parentStyle = parseStyle(parent.attr('style'));
      fontSize = parsePx(parentStyle.get('font-size')) ?? fontSize;
      const ffClass = (parent.attr('class') ?? '').split(/\s+/).find((name) => /^ff\d+$/.test(name));
      fontClass = ffClass || fontClass;
      parent = parent.parent();
    }
    const text = span.text().replace(/\u00a0/g, ' ');
    if (!text.trim()) return;
    textRuns.push({
      text,
      left: (parsePx(style.get('left')) ?? 0) * TEXT_LAYER_SCALE,
      top: (parsePx(style.get('top')) ?? 0) * TEXT_LAYER_SCALE,
      fontSize: fontSize * TEXT_LAYER_SCALE,
      fontClass,
      color: parseColor(style.get('color')),
    });
  });

  return { images, textRuns };
};

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const textOverlaySvg = (page: PageAsset, textRuns: TextRun[], fonts: Map<string, FontInfo>) => {
  const text = textRuns.map((run) => {
    const font = fonts.get(run.fontClass);
    const family = font?.family || 'Arial, Helvetica, sans-serif';
    const [r, g, b] = run.color;
    return `<text x="${Math.round(run.left)}" y="${Math.round(run.top)}" fill="rgb(${r},${g},${b})" font-family="${escapeXml(family)}" font-size="${Math.max(1, Math.round(run.fontSize))}" font-style="${font?.style || 'normal'}" font-weight="${font?.weight || 'normal'}">${escapeXml(run.text)}</text>`;
  }).join('');
  return Buffer.from(`<svg width="${page.origWidth}" height="${page.origHeight}" xmlns="http://www.w3.org/2000/svg">${text}</svg>`);
};

const prepareImageLayer = async (layer: ImageLayer, source: Buffer) => {
  let image = sharp(source, { animated: false }).ensureAlpha();
  if (layer.width && layer.height) {
    image = image.resize(Math.max(1, Math.round(layer.width)), Math.max(1, Math.round(layer.height)), { fit: 'fill' });
  }
  if (layer.clip) {
    const [top, right, bottom, left] = layer.clip.map((value) => Math.max(0, Math.round(value))) as [number, number, number, number];
    const metadata = await image.metadata();
    const cropLeft = Math.min(left, Math.max(0, (metadata.width ?? 1) - 1));
    const cropTop = Math.min(top, Math.max(0, (metadata.height ?? 1) - 1));
    const cropRight = Math.min(Math.max(right, cropLeft + 1), metadata.width ?? cropLeft + 1);
    const cropBottom = Math.min(Math.max(bottom, cropTop + 1), metadata.height ?? cropTop + 1);
    image = image.extract({
      left: cropLeft,
      top: cropTop,
      width: Math.max(1, cropRight - cropLeft),
      height: Math.max(1, cropBottom - cropTop),
    });
    return {
      input: await image.png().toBuffer(),
      left: Math.round(layer.left + cropLeft),
      top: Math.round(layer.top + cropTop),
    };
  }
  return {
    input: await image.png().toBuffer(),
    left: Math.round(layer.left),
    top: Math.round(layer.top),
  };
};

const getCachedImage = (url: string, referer: string, imageCache: Map<string, Promise<Buffer>>, signal?: AbortSignal) => {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const promise = requestBuffer(url, referer, signal).catch((error) => {
    imageCache.delete(url);
    throw error;
  });
  imageCache.set(url, promise);
  return promise;
};

const renderPage = async (page: PageAsset, fonts: Map<string, FontInfo>, includeText: boolean, referer: string, imageCache: Map<string, Promise<Buffer>>, signal?: AbortSignal): Promise<RenderedPage> => {
  const { images, textRuns } = parseLayers(page.fragment ?? '');
  const loaded = new Array<Buffer>(images.length);
  await runPool(images, MAX_IMAGE_FETCHES, async (layer, index) => {
    loaded[index] = await getCachedImage(layer.url, referer, imageCache, signal);
  }, signal);

  const composites = [];
  for (let index = 0; index < images.length; index += 1) {
    throwIfAborted(signal);
    composites.push(await prepareImageLayer(images[index], loaded[index]));
  }
  if (includeText && textRuns.length) {
    composites.push({ input: textOverlaySvg(page, textRuns, fonts), left: 0, top: 0 });
  }

  throwIfAborted(signal);
  const image = await sharp({
    create: {
      width: page.origWidth,
      height: page.origHeight,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite(composites)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return { image, width: page.origWidth, height: page.origHeight, textRuns };
};

const pdfString = (value: string) => {
  const bytes = Buffer.from(value.replace(/\0/g, ''), 'latin1');
  const escaped: number[] = [40];
  for (const byte of bytes) {
    if (byte === 40 || byte === 41 || byte === 92) {
      escaped.push(92, byte);
    } else if (byte < 32 || byte > 126) {
      escaped.push(...Buffer.from(`\\${byte.toString(8).padStart(3, '0')}`, 'ascii'));
    } else {
      escaped.push(byte);
    }
  }
  escaped.push(41);
  return Buffer.from(escaped);
};

const buildPdf = (pages: RenderedPage[], includeText: boolean) => {
  const objects: Buffer[] = [];
  const add = (object: Buffer | string) => {
    objects.push(Buffer.isBuffer(object) ? object : Buffer.from(object, 'binary'));
    return objects.length;
  };

  const fontRef = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageRefs: number[] = [];
  const pageObjectIndexes: number[] = [];

  for (const page of pages) {
    const imageRef = add(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.image.length} >>\nstream\n`, 'ascii'),
      page.image,
      Buffer.from('\nendstream', 'ascii'),
    ]));

    const contentParts = [Buffer.from(`q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im1 Do\nQ\n`, 'ascii')];
    if (includeText) {
      contentParts.push(Buffer.from('BT\n3 Tr\n', 'ascii'));
      let lastSize: number | null = null;
      for (const run of page.textRuns) {
        const text = run.text.trim();
        if (!text) continue;
        const fontSize = Math.max(1, Math.round(run.fontSize));
        if (fontSize !== lastSize) {
          contentParts.push(Buffer.from(`/F1 ${fontSize} Tf\n`, 'ascii'));
          lastSize = fontSize;
        }
        contentParts.push(Buffer.from(`1 0 0 1 ${run.left.toFixed(3)} ${(page.height - run.top - fontSize).toFixed(3)} Tm\n`, 'ascii'));
        contentParts.push(pdfString(text));
        contentParts.push(Buffer.from(' Tj\n', 'ascii'));
      }
      contentParts.push(Buffer.from('ET\n', 'ascii'));
    }

    const content = Buffer.concat(contentParts);
    const contentRef = add(Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'ascii'),
      content,
      Buffer.from('endstream', 'ascii'),
    ]));
    const pageRef = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im1 ${imageRef} 0 R >> /Font << /F1 ${fontRef} 0 R >> >> /Contents ${contentRef} 0 R >>`);
    pageRefs.push(pageRef);
    pageObjectIndexes.push(pageRef - 1);
  }

  const pagesRef = add(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  const catalogRef = add(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  const fixedObjects = [...objects];
  for (const index of pageObjectIndexes) {
    fixedObjects[index] = Buffer.from(fixedObjects[index].toString('ascii').replace('/Parent 0 0 R', `/Parent ${pagesRef} 0 R`), 'ascii');
  }
  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary')];
  const offsets = [0];
  let position = chunks[0].length;

  fixedObjects.forEach((object, index) => {
    offsets.push(position);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'ascii'),
      object,
      Buffer.from('\nendobj\n', 'ascii'),
    ]);
    chunks.push(chunk);
    position += chunk.length;
  });

  const xref = position;
  chunks.push(Buffer.from(`xref\n0 ${fixedObjects.length + 1}\n0000000000 65535 f \n`, 'ascii'));
  offsets.slice(1).forEach((offset) => chunks.push(Buffer.from(`${String(offset).padStart(10, '0')} 00000 n \n`, 'ascii')));
  chunks.push(Buffer.from(`trailer\n<< /Size ${fixedObjects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'ascii'));
  return Buffer.concat(chunks);
};

export const downloadScribdPdf = async ({ url, includeText, onProgress, signal }: ScribdDownloadOptions): Promise<ScribdDownloadResult> => {
  const progress = (stage: string, done: number, total: number) => {
    onProgress?.({
      stage,
      done,
      total,
      percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
    });
  };

  throwIfAborted(signal);
  const sourceUrl = assertAllowedSourceUrl(url);
  progress('Reading document', 0, 100);
  const pageHtml = await requestText(sourceUrl, undefined, signal);
  const state = extractState(pageHtml) as { wordDocument?: { title?: string; extracted_title?: string } };
  const title = state.wordDocument?.title || state.wordDocument?.extracted_title || 'Scribd document';
  const pages = parsePages(pageHtml);
  const fonts = parseFonts(pageHtml);
  const totalSteps = Math.max(1, pages.length * 2 + 2);
  progress(`Found ${pages.length} page(s)`, 1, totalSteps);

  let fetchedPages = 0;
  await runPool(pages, MAX_PAGE_FETCHES, async (page) => {
    page.fragment = decodeJsonp(await requestText(page.contentUrl, sourceUrl, signal), page.pageNum);
    fetchedPages += 1;
    progress(`Fetching pages ${fetchedPages}/${pages.length}`, 1 + fetchedPages, totalSteps);
  }, signal);

  const renderedPages = new Array<RenderedPage>(pages.length);
  const imageCache = new Map<string, Promise<Buffer>>();
  try {
    let renderedCount = 0;
    await runPool(pages, RENDER_CONCURRENCY, async (page, index) => {
      throwIfAborted(signal);
      renderedPages[index] = await renderPage(page, fonts, includeText, sourceUrl, imageCache, signal);
      renderedCount += 1;
      progress(`Rendering pages ${renderedCount}/${pages.length}`, 1 + pages.length + renderedCount, totalSteps);
    }, signal);
    throwIfAborted(signal);
    progress('Writing PDF', totalSteps - 1, totalSteps);
    const pdf = buildPdf(renderedPages, includeText);
    progress('Complete', totalSteps, totalSteps);
    return {
      filename: `${safeSlug(title)}.pdf`,
      pdf,
      pageCount: pages.length,
    };
  } finally {
    imageCache.clear();
    renderedPages.length = 0;
    pages.length = 0;
  }
};
