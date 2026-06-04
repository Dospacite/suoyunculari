import * as cheerio from 'cheerio';

export type RoomAvailabilitySearchInput = {
  building?: string | string[];
  startDate?: string;
  endDate?: string;
  days?: string | string[];
  startTime?: string;
  endTime?: string;
  category?: string | string[];
  minimumCapacity?: number | string;
  attributes?: string | string[];
  limit?: number | string;
};

export type RoomScheduleInput = {
  building?: string;
  roomCode?: string;
  startDate?: string;
  endDate?: string;
  includeDetails?: boolean | string;
  limit?: number | string;
};

type RoomAvailabilityResult = {
  building: string;
  room: string;
  description: string;
  category: string;
  capacity: number | null;
  energyEfficiency: string;
  attributeUrl: string;
  virtualTourUrl: string;
};

type RoomScheduleResult = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  days: string;
  detailId: string;
  detailUrl: string;
  suForm: string;
  detail?: RoomBookingDetail | null;
  detailError?: string;
};

type RoomBookingDetail = {
  name: string;
  eventNo: string;
  eventName: string;
  fields: Record<string, string>;
  room: Record<string, string>;
  source: string;
};

const BASE_URL = 'https://suis.sabanciuniv.edu/prod';
const REQUEST_TIMEOUT_MS = 12_000;

const BUILDINGS = new Map([
  ['ALL', 'ALL'],
  ['ALT', 'ALT'],
  ['COA', 'COA'],
  ['FASS', 'FASS'],
  ['FENS', 'FENS'],
  ['FMAN', 'FMAN'],
  ['SBS', 'FMAN'],
  ['KCC', 'KCC'],
  ['SC', 'SC'],
  ['SL', 'SL'],
  ['SUNUM', 'SUNUM'],
  ['SUSAM', 'SUSAM'],
  ['UC', 'UC'],
]);

const BUILDING_ALIASES = new Map([
  ['altunizade', 'ALT'],
  ['campus open area', 'COA'],
  ['fass', 'FASS'],
  ['fac.of arts and social sci.', 'FASS'],
  ['arts and social', 'FASS'],
  ['fens', 'FENS'],
  ['engineering', 'FENS'],
  ['natural sciences', 'FENS'],
  ['sbs', 'FMAN'],
  ['business', 'FMAN'],
  ['karakoy', 'KCC'],
  ['karaköy', 'KCC'],
  ['kcc', 'KCC'],
  ['sports', 'SC'],
  ['sport center', 'SC'],
  ['school of languages', 'SL'],
  ['language', 'SL'],
  ['nanotechnology', 'SUNUM'],
  ['sunum', 'SUNUM'],
  ['susam', 'SUSAM'],
  ['art and research', 'SUSAM'],
  ['university center', 'UC'],
  ['uc', 'UC'],
]);

const CATEGORIES = new Map([
  ['ALL', 'ALL'],
  ['NONE', 'NULL'],
  ['NULL', 'NULL'],
  ['CLAS', 'CLAS'],
  ['CLASSROOM', 'CLAS'],
  ['AUD', 'AUD'],
  ['AUDITORIUM', 'AUD'],
  ['HALL', 'HALL'],
  ['TEAL', 'TEAL'],
  ['TEAL CLASSROOM', 'TEAL'],
  ['STUD', 'STUD'],
  ['STUDIO', 'STUD'],
  ['STUDIO ROOM', 'STUD'],
  ['STA', 'STA'],
  ['STAND', 'STA'],
  ['LAB', 'LAB'],
  ['LABORATORY', 'LAB'],
  ['OUT', 'OUT'],
  ['OUTSIDE', 'OUT'],
]);

const DAY_VALUES = new Map([
  ['MON', 'Mon'],
  ['MONDAY', 'Mon'],
  ['PAZARTESI', 'Mon'],
  ['PAZARTESİ', 'Mon'],
  ['TUE', 'Tue'],
  ['TUESDAY', 'Tue'],
  ['SALI', 'Tue'],
  ['WED', 'Wed'],
  ['WEDNESDAY', 'Wed'],
  ['CARSAMBA', 'Wed'],
  ['ÇARSAMBA', 'Wed'],
  ['ÇARŞAMBA', 'Wed'],
  ['THU', 'Thu'],
  ['THURSDAY', 'Thu'],
  ['PERSEMBE', 'Thu'],
  ['PERŞEMBE', 'Thu'],
  ['FRI', 'Fri'],
  ['FRIDAY', 'Fri'],
  ['CUMA', 'Fri'],
  ['SAT', 'Sat'],
  ['SATURDAY', 'Sat'],
  ['CUMARTESI', 'Sat'],
  ['CUMARTESİ', 'Sat'],
  ['SUN', 'Sun'],
  ['SUNDAY', 'Sun'],
  ['PAZAR', 'Sun'],
]);

const ATTRIBUTE_ALIASES = new Map([
  ['projector', 'PRO'],
  ['projector sys', 'PRO'],
  ['pc', 'PC'],
  ['computer', 'PC'],
  ['sound', 'SS'],
  ['sound system', 'SS'],
  ['whiteboard', 'WB'],
  ['greenboard', 'GB'],
  ['window', 'WIN'],
  ['without window', 'WWIN'],
  ['table socket', 'SOCK'],
  ['socket', 'SOCK'],
  ['round table', 'CT'],
  ['u shaped', 'U'],
  ['amphi', 'ANFI'],
  ['amphi shaped', 'ANFI'],
  ['online', 'ONL'],
  ['hybrid', 'ONL'],
  ['microphone', 'WMIC'],
  ['wireless mic', 'WMIC'],
  ['wireless hand mic', 'WHM'],
  ['wireless headset mic', 'WHS'],
  ['wireless lavalier mic', 'WMIC'],
]);

export async function searchSabanciRoomAvailability(input: RoomAvailabilitySearchInput) {
  const normalized = normalizeAvailabilityInput(input);
  const body = new URLSearchParams({
    s_date: normalized.startDate,
    e_date: normalized.endDate,
    buildings: normalized.buildings.join(','),
    avail_room_checked: 'Y',
    Day: ['no_value', ...normalized.days].join(','),
    s_hour: normalized.startHour,
    s_minute_1: normalized.startMinute,
    e_hour: normalized.endHour,
    e_minute_1: normalized.endMinute,
    cat_code: normalized.categories.join(','),
    capacity: normalized.capacity,
    attributes: ['no_value', ...normalized.attributes].join(','),
  });
  const html = await postRoomEndpoint('sabanci_rooms.p_get_available', body);
  const rooms = parseAvailabilityHtml(html).slice(0, normalized.limit);
  return {
    query: {
      mode: 'availability',
      building: normalized.buildings,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      days: normalized.days,
      startTime: `${normalized.startHour}:${normalized.startMinute}`,
      endTime: `${normalized.endHour}:${normalized.endMinute}`,
      category: normalized.categories,
      minimumCapacity: normalized.capacity || null,
      attributes: normalized.attributes,
    },
    count: rooms.length,
    rooms,
    source: `${BASE_URL}/SABANCI_ROOMS.main_request`,
  };
}

export async function getSabanciRoomSchedule(input: RoomScheduleInput) {
  const normalized = normalizeScheduleInput(input);
  const url = new URL(`${BASE_URL}/sabanci_rooms.p_response_2_2_new`);
  url.searchParams.set('s_date', normalized.startDate);
  url.searchParams.set('e_date', normalized.endDate);
  url.searchParams.set('b_code', normalized.building);
  url.searchParams.set('r_code', normalized.roomCode);
  const scheduleUrl = formatSabanciUrl(url);
  const html = await fetchText(url, { method: 'GET' });
  const parsed = parseScheduleHtml(html);
  const schedule = parsed.schedule.slice(0, normalized.limit);
  const scheduleWithDetails = normalized.includeDetails ? await getSabanciRoomScheduleDetails(schedule) : schedule;
  return {
    query: {
      mode: 'schedule',
      building: normalized.building,
      roomCode: normalized.roomCode,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      includeDetails: normalized.includeDetails,
    },
    room: parsed.room,
    count: parsed.schedule.length,
    detailsFetched: normalized.includeDetails ? scheduleWithDetails.filter((row) => row.detail).length : 0,
    schedule: scheduleWithDetails,
    scheduleUrl,
    source: scheduleUrl,
    linkGuidance:
      'For a general room schedule link, use scheduleUrl. Do not construct sabanci_rooms.r_crn1 detail links. A detailUrl is valid only when copied exactly from a returned schedule row and it includes an r_crn value; if multiple rows share the same time slot, prefer scheduleUrl unless answering about one specific reservation.',
  };
}

export async function getSabanciRoomScheduleDetails(schedule: RoomScheduleResult[]) {
  const cache = new Map<string, Promise<RoomBookingDetail>>();
  return mapLimit(schedule, 4, async (row) => {
    if (!row.detailUrl) return row;
    try {
      let detail = cache.get(row.detailUrl);
      if (!detail) {
        detail = fetchSabanciRoomBookingDetail(row.detailUrl);
        cache.set(row.detailUrl, detail);
      }
      return { ...row, detail: await detail };
    } catch (error) {
      return { ...row, detail: null, detailError: error instanceof Error ? error.message : String(error) };
    }
  });
}

function normalizeAvailabilityInput(input: RoomAvailabilitySearchInput) {
  const today = formatSabanciDate(new Date());
  const startDate = normalizeDate(input.startDate) || today;
  const endDate = normalizeDate(input.endDate) || startDate;
  const start = normalizeTime(input.startTime) || { hour: '08', minute: '40' };
  const end = normalizeTime(input.endTime) || { hour: '17', minute: '30' };
  const buildings = normalizeMulti(input.building, normalizeBuilding).filter(Boolean);
  const categories = normalizeMulti(input.category, normalizeCategory).filter(Boolean);
  const days = normalizeMulti(input.days, normalizeDay).filter(Boolean);
  const attributes = normalizeMulti(input.attributes, normalizeAttribute).filter(Boolean);
  return {
    startDate,
    endDate,
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
    buildings: buildings.length ? unique(buildings) : ['ALL'],
    categories: categories.length ? unique(categories) : ['ALL'],
    days: days.length ? unique(days) : daysBetween(startDate, endDate),
    attributes: unique(attributes),
    capacity: normalizeIntegerText(input.minimumCapacity, 1, 9999),
    limit: normalizeLimit(input.limit, 12, 40),
  };
}

function normalizeScheduleInput(input: RoomScheduleInput) {
  const today = formatSabanciDate(new Date());
  const building = normalizeBuilding(input.building) || normalizeBuilding(input.roomCode);
  const roomCode = normalizeRoomCode(input.roomCode);
  if (!building || building === 'ALL') throw new Error('Schedule lookup requires a single building code, such as FASS or FENS.');
  if (!roomCode) throw new Error('Schedule lookup requires a room code, such as 1075 or G062.');
  return {
    building,
    roomCode,
    startDate: normalizeDate(input.startDate) || today,
    endDate: normalizeDate(input.endDate) || normalizeDate(input.startDate) || today,
    includeDetails: normalizeBoolean(input.includeDetails),
    limit: normalizeLimit(input.limit, 80, 200),
  };
}

async function fetchSabanciRoomBookingDetail(detailUrl: string): Promise<RoomBookingDetail> {
  const url = new URL(detailUrl);
  const html = await fetchText(url, { method: 'GET' });
  return parseBookingDetailHtml(html, url.toString());
}

async function postRoomEndpoint(path: string, body: URLSearchParams) {
  return fetchText(new URL(`${BASE_URL}/${path}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `${BASE_URL}/SABANCI_ROOMS.main_request`,
    },
    body: body.toString(),
  });
}

async function fetchText(url: URL, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'SUOyunculari Pingo room availability helper',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`Sabanci room request failed with ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseAvailabilityHtml(html: string): RoomAvailabilityResult[] {
  const $ = cheerio.load(html);
  const rows: RoomAvailabilityResult[] = [];
  $('table.table tr').each((_, row) => {
    const cells = $(row)
      .find('td')
      .map((__, cell) => cleanCellText($(cell).text()))
      .get();
    if (cells.length < 7) return;
    const links = $(row).find('a');
    rows.push({
      building: cells[0],
      room: cells[1],
      description: cells[2],
      category: cells[3],
      capacity: parseInteger(cells[4]),
      energyEfficiency: cells[5],
      attributeUrl: absolutize($(links.get(0)).attr('href')),
      virtualTourUrl: absolutize($(links.get(1)).attr('href')),
    });
  });
  return rows;
}

function parseScheduleHtml(html: string): { room: Record<string, string>; schedule: RoomScheduleResult[] } {
  const $ = cheerio.load(html);
  const room: Record<string, string> = {};
  const firstRows = $('table.table-bordered').first().find('> tbody > tr');
  firstRows.slice(0, 2).each((_, row) => {
    const headers = $(row).find('th').map((__, cell) => cleanCellText($(cell).text())).get();
    const values = $(row).find('td').map((__, cell) => cleanCellText($(cell).text())).get();
    headers.forEach((header, index) => {
      if (header && values[index]) room[toCamelCase(header)] = values[index];
    });
  });

  const schedule: RoomScheduleResult[] = [];
  $('table.table-bordered table.table-bordered tr').each((_, row) => {
    const cells = $(row)
      .find('td')
      .map((__, cell) => cleanCellText($(cell).text()))
      .get();
    if (cells.length < 6 || /^start date$/i.test(cells[0])) return;
    const detailHref = $(row).find('a').first().attr('href');
    const detailUrl = absolutize(detailHref);
    schedule.push({
      startDate: cells[0],
      endDate: cells[1],
      startTime: cells[2],
      endTime: cells[3],
      days: cells[4],
      detailId: extractDetailId(detailUrl),
      detailUrl,
      suForm: cells[6] || '',
    });
  });
  return { room, schedule };
}

function parseBookingDetailHtml(html: string, source: string): RoomBookingDetail {
  const $ = cheerio.load(html);
  const room: Record<string, string> = {};
  const firstRows = $('table.table-bordered').first().find('> tbody > tr, > tr');
  firstRows.slice(0, 2).each((_, row) => {
    const headers = $(row).find('th').map((__, cell) => cleanCellText($(cell).text())).get();
    const values = $(row).find('td').map((__, cell) => cleanCellText($(cell).text())).get();
    headers.forEach((header, index) => {
      if (header && values[index]) room[toCamelCase(header)] = values[index];
    });
  });

  const fields: Record<string, string> = {};
  $('table.table-bordered table.table-bordered tr').each((_, row) => {
    const cells = $(row)
      .find('td')
      .map((__, cell) => cleanCellText($(cell).text()))
      .get();
    if (cells.length < 2) return;
    const label = cells[0];
    const value = cells.slice(1).join(' ');
    if (label && value) fields[toCamelCase(label)] = value;
  });

  const eventNoName = fields.eventNoName || '';
  const eventMatch = eventNoName.match(/^([^/]+)\s*\/\s*(.+)$/);
  return {
    name: fields.name || '',
    eventNo: eventMatch ? eventMatch[1].trim() : '',
    eventName: eventMatch ? eventMatch[2].trim() : eventNoName,
    fields,
    room,
    source,
  };
}

function normalizeMulti(value: unknown, normalizer: (item: string) => string): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n]/) : [];
  return raw.map((item) => normalizer(String(item))).filter(Boolean);
}

function normalizeBuilding(value: unknown): string {
  const raw = cleanCellText(String(value ?? ''));
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (BUILDINGS.has(upper)) return BUILDINGS.get(upper) || '';
  const alias = BUILDING_ALIASES.get(raw.toLocaleLowerCase('tr-TR'));
  if (alias) return alias;
  const codeMatch = upper.match(/\b(ALL|ALT|COA|FASS|FENS|FMAN|SBS|KCC|SC|SL|SUNUM|SUSAM|UC)\b/);
  return codeMatch ? BUILDINGS.get(codeMatch[1]) || '' : '';
}

function normalizeCategory(value: unknown): string {
  const raw = cleanCellText(String(value ?? ''));
  if (!raw) return '';
  return CATEGORIES.get(raw.toUpperCase()) || CATEGORIES.get(raw.toLocaleUpperCase('tr-TR')) || '';
}

function normalizeDay(value: unknown): string {
  const raw = cleanCellText(String(value ?? ''));
  if (!raw) return '';
  return DAY_VALUES.get(raw.toLocaleUpperCase('tr-TR')) || DAY_VALUES.get(raw.toUpperCase()) || '';
}

function normalizeAttribute(value: unknown): string {
  const raw = cleanCellText(String(value ?? ''));
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (/^[A-Z]{1,5}$/.test(upper)) return upper;
  return ATTRIBUTE_ALIASES.get(raw.toLocaleLowerCase('tr-TR')) || '';
}

function normalizeRoomCode(value: unknown) {
  const raw = cleanCellText(String(value ?? '')).toUpperCase();
  const match = raw.match(/\b(?:[A-Z]{2,6}\s+)?([G]?\d{3,4})\b/);
  return match?.[1] || '';
}

function normalizeDate(value: unknown) {
  const raw = cleanCellText(String(value ?? ''));
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1].slice(2)}`;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!slash) return '';
  const year = slash[3].length === 4 ? slash[3].slice(2) : slash[3];
  return `${slash[1].padStart(2, '0')}/${slash[2].padStart(2, '0')}/${year}`;
}

function normalizeTime(value: unknown) {
  const raw = cleanCellText(String(value ?? ''));
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour: String(hour).padStart(2, '0'), minute: String(minute).padStart(2, '0') };
}

function formatSabanciDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.day}/${byType.month}/${byType.year}`;
}

function daysBetween(startDate: string, endDate: string) {
  const start = parseSabanciDate(startDate);
  const end = parseSabanciDate(endDate);
  if (!start || !end || start > end) return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days: string[] = [];
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let at = start.getTime(); at <= end.getTime(); at += 86_400_000) {
    days.push(labels[new Date(at).getUTCDay()]);
  }
  return unique(days);
}

function parseSabanciDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(2000 + Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

function normalizeIntegerText(value: unknown, min: number, max: number) {
  const parsed = parseInteger(String(value ?? ''));
  if (parsed === null) return '';
  return String(Math.min(max, Math.max(min, parsed)));
}

function normalizeLimit(value: unknown, fallback: number, max: number) {
  const parsed = parseInteger(String(value ?? ''));
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(1, parsed));
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const raw = cleanCellText(String(value ?? '')).toLocaleLowerCase('tr-TR');
  return ['true', '1', 'yes', 'y', 'evet', 'detay', 'details', 'detail'].includes(raw);
}

async function mapLimit<T, U>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<U>) {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function parseInteger(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanCellText(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function absolutize(href: string | undefined) {
  if (!href) return '';
  return new URL(href, `${BASE_URL}/`).toString();
}

function formatSabanciUrl(url: URL) {
  return url.toString().replaceAll('%2F', '/');
}

function extractDetailId(url: string) {
  if (!url) return '';
  try {
    return new URL(url).searchParams.get('r_crn') || '';
  } catch {
    return '';
  }
}

function toCamelCase(value: string) {
  const words = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  if (!words?.length) return '';
  return words.map((word, index) => (index ? `${word[0].toUpperCase()}${word.slice(1)}` : word)).join('');
}
