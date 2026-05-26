import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import type { QueryResultRow } from 'pg';

const { Pool } = pg;
const scrypt = promisify(scryptCallback);

export type YkRole = 'admin' | 'yonetim_kurulu' | 'merkezi_yonetim_kurulu';

export type YkUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: YkRole;
  must_change_password: boolean;
  active: boolean;
};

export type AttendanceState = {
  id: string;
  key: string;
  label: string;
  points: number;
  color: string | null;
  sort_order: number;
  active: boolean;
};

export type RollCallSheet = {
  id: string;
  season_id: string;
  season_name?: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  rehearsal_weekdays: number[];
  archived: boolean;
};

export type Member = {
  id: string;
  season_id: string;
  season_name?: string;
  first_name: string;
  last_name: string;
  display_name: string;
  active: boolean;
  notes: string | null;
  sort_order: number | null;
};

export type Rehearsal = {
  id: string;
  rehearsal_date: string;
  notes: string | null;
  sort_order: number;
  rehearsal_idea_slug: string | null;
  rehearsal_idea_title: string | null;
};

export type AttendanceEntry = {
  member_id: string;
  rehearsal_id: string;
  state_id: string | null;
  label: string | null;
  points: number | null;
};

export type RollCallData = {
  sheet: RollCallSheet;
  season: Season;
  states: AttendanceState[];
  members: Member[];
  rehearsals: Rehearsal[];
  entries: AttendanceEntry[];
  totals: Record<string, number>;
  memberStats: Record<string, MemberPoints>;
  average: number;
};

export type Season = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  archived: boolean;
};

export type MemberPoints = {
  total: number;
  average: number;
  rehearsalCount: number;
};

export type MemberDetails = {
  member: Member;
  season: Season;
  stats: MemberPoints;
  sheets: Array<{ id: string; name: string; total: number; average: number; rehearsalCount: number }>;
};

export type RehearsalDetails = {
  rehearsal: Rehearsal & {
    sheet_id: string;
    sheet_name: string;
    season_id: string;
    season_name: string;
  };
};

type AuditContext = {
  user?: YkUser | null;
  request?: Request;
};

const pool = new Pool(
  process.env.YK_DATABASE_URL || process.env.DATABASE_URL
    ? { connectionString: process.env.YK_DATABASE_URL || process.env.DATABASE_URL }
    : {
        host: process.env.YK_DB_HOST || 'postgres',
        port: Number(process.env.YK_DB_PORT || 5432),
        database: process.env.YK_POSTGRES_DB || 'suoyunculari_yk',
        user: process.env.YK_POSTGRES_USER || 'suo_yk',
        password: process.env.YK_POSTGRES_PASSWORD || 'suo_yk_password',
      },
);

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function cleanText(value: unknown, maxLength = 240): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function roleLabel(role: YkRole): string {
  if (role === 'admin') return 'Admin';
  if (role === 'merkezi_yonetim_kurulu') return 'Merkezi Yönetim Kurulu';
  return 'Yönetim Kurulu';
}

export function canEditRollCall(user: YkUser): boolean {
  return ['admin', 'yonetim_kurulu', 'merkezi_yonetim_kurulu'].includes(user.role);
}

export function isAdmin(user: YkUser): boolean {
  return user.role === 'admin';
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return {
    salt,
    hash: derived.toString('hex'),
  };
}

export async function verifyPassword(password: string, salt: string, hash: string) {
  const derived = Buffer.from((await hashPassword(password, salt)).hash, 'hex');
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function createSession(user: YkUser, request: Request) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    `insert into yk_sessions (user_id, token_hash, expires_at, ip, user_agent)
     values ($1, $2, $3, $4, $5)`,
    [user.id, tokenHash, expiresAt.toISOString(), getIp(request), request.headers.get('user-agent') || ''],
  );
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined): Promise<YkUser | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const result = await query<YkUser>(
    `select u.id, u.email, u.display_name, u.role, u.must_change_password, u.active
       from yk_sessions s
       join yk_users u on u.id = s.user_id
      where s.token_hash = $1
        and s.expires_at > now()
        and u.active = true
      limit 1`,
    [tokenHash],
  );
  const user = result.rows[0] ?? null;
  if (user) {
    await query(`update yk_sessions set last_seen_at = now() where token_hash = $1`, [tokenHash]);
  }
  return user;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await query(`delete from yk_sessions where token_hash = $1`, [hashToken(token)]);
}

export async function login(email: string, password: string, request: Request) {
  const normalized = normalizeEmail(email);
  const result = await query<YkUser & { password_hash: string; password_salt: string }>(
    `select id, email, display_name, role, password_hash, password_salt, must_change_password, active
       from yk_users
      where email = $1 and active = true`,
    [normalized],
  );
  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
    await audit({ request }, 'login_failed', 'yk_users', null, null, { email: normalized });
    return null;
  }
  await query(`update yk_users set last_login_at = now(), updated_at = now() where id = $1`, [user.id]);
  await audit({ user, request }, 'login', 'yk_users', user.id, null, { email: user.email });
  return user;
}

export async function changePassword(user: YkUser, password: string, request: Request) {
  const { salt, hash } = await hashPassword(password);
  await query(
    `update yk_users
        set password_hash = $1,
            password_salt = $2,
            must_change_password = false,
            updated_at = now()
      where id = $3`,
    [hash, salt, user.id],
  );
  await query(`delete from yk_sessions where user_id = $1`, [user.id]);
  await audit({ user, request }, 'password_changed', 'yk_users', user.id);
}

export async function audit(
  context: AuditContext,
  action: string,
  entityType: string,
  entityId?: string | null,
  beforeValue?: unknown,
  afterValue?: unknown,
) {
  const user = context.user ?? null;
  const request = context.request;
  await query(
    `insert into yk_audit_logs
      (actor_user_id, actor_email, action, entity_type, entity_id, before_value, after_value, ip, user_agent)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
    [
      user?.id ?? null,
      user?.email ?? null,
      action,
      entityType,
      entityId ?? null,
      beforeValue === undefined ? null : JSON.stringify(beforeValue),
      afterValue === undefined ? null : JSON.stringify(afterValue),
      request ? getIp(request) : null,
      request?.headers.get('user-agent') || null,
    ],
  );
}

export async function listSheets() {
  const result = await query<RollCallSheet>(
    `select s.id,
            s.season_id,
            y.name as season_name,
            s.name,
            s.description,
            s.start_date::text,
            s.end_date::text,
            s.rehearsal_weekdays,
            s.archived,
            count(r.id)::int as rehearsal_count
       from yk_roll_call_sheets s
       join yk_seasons y on y.id = s.season_id
       left join yk_rehearsals r on r.sheet_id = s.id
      group by s.id, y.name, y.start_date
      order by s.archived asc, y.start_date desc nulls last, s.updated_at desc, s.name asc`,
  );
  return result.rows;
}

export async function listSeasons() {
  const result = await query<Season>(
    `select id, name, start_date::text, end_date::text, archived
       from yk_seasons
      order by archived asc, start_date desc nulls last, name asc`,
  );
  return result.rows;
}

export async function createSeason(input: { name: string; startDate?: string; endDate?: string }, context: AuditContext) {
  const name = cleanText(input.name, 120);
  if (!name) throw new Error('Season name is required');
  const startDate = normalizeDateInput(input.startDate);
  const endDate = normalizeDateInput(input.endDate);
  const result = await query<Season>(
    `insert into yk_seasons (name, start_date, end_date, created_by)
     values ($1, $2, $3, $4)
     returning id, name, start_date::text, end_date::text, archived`,
    [
      name,
      startDate,
      endDate,
      context.user?.id ?? null,
    ],
  );
  await audit(context, 'create', 'yk_seasons', result.rows[0].id, null, result.rows[0]);
  return result.rows[0];
}

export async function updateSeason(id: string, input: Partial<Season>, context: AuditContext) {
  const before = (await query<Season>(`select id, name, start_date::text, end_date::text, archived from yk_seasons where id = $1`, [id])).rows[0];
  if (!before) throw new Error('Season not found');
  const startDate = input.start_date === undefined ? before.start_date : normalizeDateInput(input.start_date);
  const endDate = input.end_date === undefined ? before.end_date : normalizeDateInput(input.end_date);
  const result = await query<Season>(
    `update yk_seasons
        set name = coalesce($2, name),
            start_date = $3,
            end_date = $4,
            archived = coalesce($5, archived),
            updated_at = now()
      where id = $1
      returning id, name, start_date::text, end_date::text, archived`,
    [
      id,
      input.name === undefined ? null : cleanText(input.name, 120),
      startDate,
      endDate,
      typeof input.archived === 'boolean' ? input.archived : null,
    ],
  );
  await audit(context, 'update', 'yk_seasons', id, before, result.rows[0]);
  return result.rows[0];
}

export async function deleteSeason(id: string, context: AuditContext) {
  const before = (await query<Season>(`select id, name, start_date::text, end_date::text, archived from yk_seasons where id = $1`, [id])).rows[0];
  if (!before) return;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `delete from yk_attendance_entries
        where member_id in (select id from yk_members where season_id = $1)
           or rehearsal_id in (
             select r.id
               from yk_rehearsals r
               join yk_roll_call_sheets s on s.id = r.sheet_id
              where s.season_id = $1
           )`,
      [id],
    );
    await client.query(`delete from yk_members where season_id = $1`, [id]);
    await client.query(`delete from yk_roll_call_sheets where season_id = $1`, [id]);
    await client.query(`delete from yk_seasons where id = $1`, [id]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  await audit(context, 'delete', 'yk_seasons', id, before, null);
}

export async function createDefaultStates(sheetId: string) {
  await query(
    `insert into yk_attendance_states (sheet_id, key, label, points, color, sort_order)
     values
       ($1, 'present', 'Geldi', 3, '#177245', 10),
       ($1, 'late', 'Geç geldi', 2, '#c46a14', 20),
       ($1, 'excused_absent', 'Mazeretli gelmedi', 1, '#155f9f', 30),
       ($1, 'absent', 'Gelmedi', 0, '#c41422', 40)
     on conflict (sheet_id, key) do nothing`,
    [sheetId],
  );
}

function parseWeekdays(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(raw.map((item) => Number(item)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
}

function normalizeDateInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

async function replaceGeneratedRehearsals(sheetId: string, startDate: string, endDate: string, weekdays: number[], context: AuditContext) {
  await query(`delete from yk_rehearsals where sheet_id = $1`, [sheetId]);
  if (weekdays.length === 0) return;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('Invalid date range');
  }
  const rows: Array<{ date: string; order: number }> = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (weekdays.includes(cursor.getUTCDay())) {
      rows.push({ date: cursor.toISOString().slice(0, 10), order: rows.length * 10 + 10 });
    }
  }
  for (const row of rows) {
    await query(
      `insert into yk_rehearsals (sheet_id, rehearsal_date, sort_order)
       values ($1, $2, $3)`,
      [sheetId, row.date, row.order],
    );
  }
  await audit(context, 'generate', 'yk_rehearsals', sheetId, null, { count: rows.length, startDate, endDate, weekdays });
}

export async function createSheet(
  input: { name: string; seasonId: string; weekdays: unknown; description?: string },
  context: AuditContext,
) {
  const name = cleanText(input.name, 120);
  if (!name) throw new Error('Sheet name is required');
  if (!input.seasonId) throw new Error('Season is required');
  const season = (
    await query<Season>(`select id, name, start_date::text, end_date::text, archived from yk_seasons where id = $1`, [input.seasonId])
  ).rows[0];
  if (!season) throw new Error('Season not found');
  if (!season.start_date || !season.end_date) throw new Error('Season start and end dates are required');
  const weekdays = parseWeekdays(input.weekdays);
  if (weekdays.length === 0) throw new Error('At least one rehearsal day is required');
  const result = await query<RollCallSheet>(
    `insert into yk_roll_call_sheets (name, season_id, description, start_date, end_date, rehearsal_weekdays, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, season_id, name, description, start_date::text, end_date::text, rehearsal_weekdays, archived`,
    [name, input.seasonId, cleanText(input.description, 500) || null, season.start_date, season.end_date, weekdays, context.user?.id ?? null],
  );
  const sheet = result.rows[0];
  await createDefaultStates(sheet.id);
  await replaceGeneratedRehearsals(sheet.id, season.start_date, season.end_date, weekdays, context);
  await audit(context, 'create', 'yk_roll_call_sheets', sheet.id, null, sheet);
  return sheet;
}

export async function updateSheet(id: string, input: Partial<RollCallSheet>, context: AuditContext) {
  const before = (
    await query<RollCallSheet>(
      `select id, season_id, name, description, start_date::text, end_date::text, rehearsal_weekdays, archived from yk_roll_call_sheets where id = $1`,
      [id],
    )
  ).rows[0];
  if (!before) throw new Error('Sheet not found');
  const result = await query<RollCallSheet>(
    `update yk_roll_call_sheets
        set name = coalesce($2, name),
            description = $3,
            archived = coalesce($4, archived),
            start_date = coalesce($5, start_date),
            end_date = coalesce($6, end_date),
            rehearsal_weekdays = coalesce($7, rehearsal_weekdays),
            updated_at = now()
      where id = $1
      returning id, season_id, name, description, start_date::text, end_date::text, rehearsal_weekdays, archived`,
    [
      id,
      input.name === undefined ? null : cleanText(input.name, 120),
      input.description === undefined ? before.description : cleanText(input.description, 500) || null,
      typeof input.archived === 'boolean' ? input.archived : null,
      input.start_date && normalizeDateInput(input.start_date) ? normalizeDateInput(input.start_date) : null,
      input.end_date && normalizeDateInput(input.end_date) ? normalizeDateInput(input.end_date) : null,
      Array.isArray(input.rehearsal_weekdays) ? input.rehearsal_weekdays : null,
    ],
  );
  const next = result.rows[0];
  if (
    (input.start_date || input.end_date || Array.isArray(input.rehearsal_weekdays)) &&
    next.start_date &&
    next.end_date
  ) {
    await replaceGeneratedRehearsals(next.id, next.start_date, next.end_date, next.rehearsal_weekdays, context);
  }
  await audit(context, 'update', 'yk_roll_call_sheets', id, before, result.rows[0]);
  return result.rows[0];
}

export async function deleteSheet(id: string, context: AuditContext) {
  const before = (await query<RollCallSheet>(`select id, season_id, name, description, start_date::text, end_date::text, rehearsal_weekdays, archived from yk_roll_call_sheets where id = $1`, [id])).rows[0];
  if (!before) return;
  await query(`delete from yk_roll_call_sheets where id = $1`, [id]);
  await audit(context, 'delete', 'yk_roll_call_sheets', id, before, null);
}

export async function getRollCallData(sheetId: string): Promise<RollCallData | null> {
  const sheet = (
    await query<RollCallSheet>(
      `select s.id,
              s.season_id,
              y.name as season_name,
              s.name,
              s.description,
              s.start_date::text,
              s.end_date::text,
              s.rehearsal_weekdays,
              s.archived
         from yk_roll_call_sheets s
         join yk_seasons y on y.id = s.season_id
        where s.id = $1`,
      [sheetId],
    )
  ).rows[0];
  if (!sheet) return null;
  const season = (
    await query<Season>(`select id, name, start_date::text, end_date::text, archived from yk_seasons where id = $1`, [sheet.season_id])
  ).rows[0];
  await createDefaultStates(sheet.id);
  const [states, members, rehearsals, entries] = await Promise.all([
    query<AttendanceState>(
      `select id, key, label, points, color, sort_order, active
         from yk_attendance_states
        where sheet_id = $1
        order by sort_order asc, label asc`,
      [sheetId],
    ),
    query<Member>(
      `select id, season_id, first_name, last_name, display_name, active, notes, sort_order
         from yk_members
        where season_id = $1 and active = true
        order by sort_order asc nulls last, lower(last_name) collate "C" asc, lower(first_name) collate "C" asc`,
      [sheet.season_id],
    ),
    query<Rehearsal>(
      `select id, rehearsal_date::text, notes, sort_order, rehearsal_idea_slug, rehearsal_idea_title
         from yk_rehearsals
        where sheet_id = $1
        order by sort_order asc, rehearsal_date asc`,
      [sheetId],
    ),
    query<AttendanceEntry>(
      `select e.member_id, e.rehearsal_id, e.state_id, s.label, s.points
         from yk_attendance_entries e
         left join yk_attendance_states s on s.id = e.state_id
         join yk_members m on m.id = e.member_id
         join yk_rehearsals r on r.id = e.rehearsal_id
        where m.season_id = $2 and r.sheet_id = $1`,
      [sheetId, sheet.season_id],
    ),
  ]);
  const totals: Record<string, number> = {};
  const memberStats: Record<string, MemberPoints> = {};
  for (const member of members.rows) totals[member.id] = 0;
  for (const entry of entries.rows) {
    totals[entry.member_id] = (totals[entry.member_id] ?? 0) + (entry.points ?? 0);
  }
  for (const member of members.rows) {
    const total = totals[member.id] ?? 0;
    const rehearsalCount = rehearsals.rows.length;
    memberStats[member.id] = {
      total,
      average: rehearsalCount ? total / rehearsalCount : 0,
      rehearsalCount,
    };
  }
  const memberTotals = Object.values(totals);
  const average = memberTotals.length ? memberTotals.reduce((sum, value) => sum + value, 0) / memberTotals.length : 0;
  return {
    sheet,
    season,
    states: states.rows,
    members: members.rows,
    rehearsals: rehearsals.rows,
    entries: entries.rows,
    totals,
    memberStats,
    average,
  };
}

export async function listMembers(seasonId?: string, sort: 'manual' | 'name' | 'total' = 'manual') {
  if (sort === 'total') {
    const result = await query<Member & { total_points: number; average_points: number }>(
      `select m.id,
              m.season_id,
              y.name as season_name,
              m.first_name,
              m.last_name,
              m.display_name,
              m.active,
              m.notes,
              m.sort_order,
              coalesce(sum(st.points), 0)::int as total_points,
              case
                when count(distinct r.id) = 0 then 0
                else coalesce(sum(st.points), 0)::numeric / count(distinct r.id)
              end as average_points
         from yk_members m
         join yk_seasons y on y.id = m.season_id
         left join yk_roll_call_sheets s on s.season_id = m.season_id
         left join yk_rehearsals r on r.sheet_id = s.id
         left join yk_attendance_entries e on e.member_id = m.id and e.rehearsal_id = r.id
         left join yk_attendance_states st on st.id = e.state_id
        where ($1::uuid is null or m.season_id = $1)
          and m.active = true
        group by m.id, y.name, y.start_date
        order by total_points desc, lower(m.last_name) collate "C" asc, lower(m.first_name) collate "C" asc`,
      [seasonId || null],
    );
    return result.rows;
  }

  const result = await query<Member>(
    `select m.id, m.season_id, y.name as season_name, m.first_name, m.last_name, m.display_name, m.active, m.notes, m.sort_order
       from yk_members m
       join yk_seasons y on y.id = m.season_id
      where ($1::uuid is null or m.season_id = $1)
        and m.active = true
      order by
        y.start_date desc nulls last,
        ${sort === 'name' ? '' : 'm.sort_order asc nulls last,'}
        lower(m.last_name) collate "C" asc,
        lower(m.first_name) collate "C" asc`,
    [seasonId || null],
  );
  return result.rows;
}

export async function addMember(seasonId: string, input: { firstName: string; lastName: string }, context: AuditContext) {
  const firstName = cleanText(input.firstName, 80);
  const lastName = cleanText(input.lastName, 80);
  if (!seasonId || !firstName || !lastName) throw new Error('Member season and name are required');
  const displayName = `${firstName} ${lastName}`.trim();
  const result = await query<Member>(
    `insert into yk_members (season_id, first_name, last_name, display_name)
     values ($1, $2, $3, $4)
     returning id, season_id, first_name, last_name, display_name, active, notes, sort_order`,
    [seasonId, firstName, lastName, displayName],
  );
  await audit(context, 'create', 'yk_members', result.rows[0].id, null, result.rows[0]);
  return result.rows[0];
}

export async function addSheetMember(sheetId: string, input: { firstName: string; lastName: string }, context: AuditContext) {
  const sheet = (await query<{ season_id: string }>(`select season_id from yk_roll_call_sheets where id = $1`, [sheetId])).rows[0];
  if (!sheet) throw new Error('Sheet not found');
  return addMember(sheet.season_id, input, context);
}

export async function listSheetSummaries() {
  const result = await query<RollCallSheet & { rehearsal_count: number; member_count: number }>(
    `select s.id,
            s.season_id,
            y.name as season_name,
            s.name,
            s.description,
            s.start_date::text,
            s.end_date::text,
            s.rehearsal_weekdays,
            s.archived,
            count(distinct r.id)::int as rehearsal_count,
            count(distinct m.id)::int as member_count
       from yk_roll_call_sheets s
       join yk_seasons y on y.id = s.season_id
       left join yk_rehearsals r on r.sheet_id = s.id
       left join yk_members m on m.season_id = s.season_id and m.active = true
      group by s.id, y.name
      order by s.archived asc, s.start_date desc nulls last, s.name asc`,
  );
  return result.rows;
}



export async function updateMember(id: string, input: Partial<Member>, context: AuditContext) {
  const before = (await query<Member>(`select id, season_id, first_name, last_name, display_name, active, notes, sort_order from yk_members where id = $1`, [id])).rows[0];
  if (!before) throw new Error('Member not found');
  const firstName = input.first_name === undefined ? before.first_name : cleanText(input.first_name, 80);
  const lastName = input.last_name === undefined ? before.last_name : cleanText(input.last_name, 80);
  const result = await query<Member>(
    `update yk_members
        set first_name = $2,
            last_name = $3,
            display_name = $4,
            active = coalesce($5, active),
            notes = $6,
            sort_order = coalesce($7, sort_order)
      where id = $1
      returning id, season_id, first_name, last_name, display_name, active, notes, sort_order`,
    [
      id,
      firstName,
      lastName,
      `${firstName} ${lastName}`.trim(),
      typeof input.active === 'boolean' ? input.active : null,
      input.notes === undefined ? before.notes : cleanText(input.notes, 500) || null,
      Number.isFinite(input.sort_order) ? input.sort_order : null,
    ],
  );
  await audit(context, 'update', 'yk_members', id, before, result.rows[0]);
  return result.rows[0];
}

export async function deleteMember(id: string, context: AuditContext) {
  await updateMember(id, { active: false }, context);
}

export async function reorderMembers(seasonId: string, memberIds: string[], context: AuditContext) {
  const ids = memberIds.filter(Boolean);
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const [index, id] of ids.entries()) {
      await client.query(`update yk_members set sort_order = $3 where id = $1 and season_id = $2`, [id, seasonId, (index + 1) * 10]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  await audit(context, 'reorder', 'yk_members', seasonId, null, { memberIds: ids });
}

export async function getMemberDetails(id: string): Promise<MemberDetails | null> {
  const member = (
    await query<Member & { season_name: string }>(
      `select m.id, m.season_id, y.name as season_name, m.first_name, m.last_name, m.display_name, m.active, m.notes, m.sort_order
         from yk_members m
         join yk_seasons y on y.id = m.season_id
        where m.id = $1`,
      [id],
    )
  ).rows[0];
  if (!member) return null;

  const season = (
    await query<Season>(`select id, name, start_date::text, end_date::text, archived from yk_seasons where id = $1`, [member.season_id])
  ).rows[0];
  const sheets = (
    await query<{ id: string; name: string; total: number; average: number; rehearsalcount: number }>(
      `select s.id,
              s.name,
              coalesce(sum(st.points), 0)::int as total,
              count(distinct r.id)::int as rehearsalCount,
              case
                when count(distinct r.id) = 0 then 0
                else coalesce(sum(st.points), 0)::numeric / count(distinct r.id)
              end as average
         from yk_roll_call_sheets s
         left join yk_rehearsals r on r.sheet_id = s.id
         left join yk_attendance_entries e on e.rehearsal_id = r.id and e.member_id = $1
         left join yk_attendance_states st on st.id = e.state_id
        where s.season_id = $2
        group by s.id
        order by s.start_date desc nulls last, s.name asc`,
      [id, member.season_id],
    )
  ).rows;
  const total = sheets.reduce((sum, sheet) => sum + Number(sheet.total || 0), 0);
  const rehearsalCount = sheets.reduce((sum, sheet) => sum + Number(sheet.rehearsalcount || 0), 0);
  return {
    member,
    season,
    stats: {
      total,
      average: rehearsalCount ? total / rehearsalCount : 0,
      rehearsalCount,
    },
    sheets: sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      total: Number(sheet.total || 0),
      average: Number(sheet.average || 0),
      rehearsalCount: Number(sheet.rehearsalcount || 0),
    })),
  };
}

export async function addRehearsal(sheetId: string, input: { date: string; notes?: string }, context: AuditContext) {
  const date = normalizeDateInput(input.date);
  if (!date) throw new Error('Date is required');
  const maxOrder = await query<{ next_order: number }>(`select coalesce(max(sort_order), 0) + 10 as next_order from yk_rehearsals where sheet_id = $1`, [sheetId]);
  const result = await query<Rehearsal>(
    `insert into yk_rehearsals (sheet_id, rehearsal_date, notes, sort_order)
     values ($1, $2, $3, $4)
     returning id, rehearsal_date::text, notes, sort_order, rehearsal_idea_slug, rehearsal_idea_title`,
    [sheetId, date, cleanText(input.notes, 500) || null, maxOrder.rows[0].next_order],
  );
  await audit(context, 'create', 'yk_rehearsals', result.rows[0].id, null, result.rows[0]);
  return result.rows[0];
}

export async function updateRehearsal(id: string, input: Partial<Rehearsal>, context: AuditContext) {
  const before = (await query<Rehearsal>(`select id, rehearsal_date::text, notes, sort_order, rehearsal_idea_slug, rehearsal_idea_title from yk_rehearsals where id = $1`, [id])).rows[0];
  if (!before) throw new Error('Rehearsal not found');
  const date = normalizeDateInput(input.rehearsal_date);
  const result = await query<Rehearsal>(
    `update yk_rehearsals
        set rehearsal_date = coalesce($2, rehearsal_date),
            notes = $3,
            sort_order = coalesce($4, sort_order),
            rehearsal_idea_slug = $5,
            rehearsal_idea_title = $6
      where id = $1
      returning id, rehearsal_date::text, notes, sort_order, rehearsal_idea_slug, rehearsal_idea_title`,
    [
      id,
      date,
      input.notes === undefined ? before.notes : cleanText(input.notes, 500) || null,
      Number.isFinite(input.sort_order) ? input.sort_order : null,
      input.rehearsal_idea_slug === undefined ? before.rehearsal_idea_slug : cleanText(input.rehearsal_idea_slug, 160) || null,
      input.rehearsal_idea_title === undefined ? before.rehearsal_idea_title : cleanText(input.rehearsal_idea_title, 240) || null,
    ],
  );
  await audit(context, 'update', 'yk_rehearsals', id, before, result.rows[0]);
  return result.rows[0];
}

export async function getRehearsalDetails(id: string): Promise<RehearsalDetails | null> {
  const rehearsal = (
    await query<RehearsalDetails['rehearsal']>(
      `select r.id,
              r.sheet_id,
              s.name as sheet_name,
              s.season_id,
              y.name as season_name,
              r.rehearsal_date::text,
              r.notes,
              r.sort_order,
              r.rehearsal_idea_slug,
              r.rehearsal_idea_title
         from yk_rehearsals r
         join yk_roll_call_sheets s on s.id = r.sheet_id
         join yk_seasons y on y.id = s.season_id
        where r.id = $1`,
      [id],
    )
  ).rows[0];
  return rehearsal ? { rehearsal } : null;
}

export async function deleteRehearsal(id: string, context: AuditContext) {
  const before = (await query<Rehearsal>(`select id, rehearsal_date::text, notes, sort_order, rehearsal_idea_slug, rehearsal_idea_title from yk_rehearsals where id = $1`, [id])).rows[0];
  if (!before) return;
  await query(`delete from yk_rehearsals where id = $1`, [id]);
  await audit(context, 'delete', 'yk_rehearsals', id, before, null);
}

export async function updateAttendance(memberId: string, rehearsalId: string, stateId: string | null, context: AuditContext) {
  const before = (
    await query(`select member_id, rehearsal_id, state_id, note from yk_attendance_entries where member_id = $1 and rehearsal_id = $2`, [memberId, rehearsalId])
  ).rows[0] ?? null;
  const result = await query<{ id: string; member_id: string; rehearsal_id: string; state_id: string | null; label: string | null; points: number | null }>(
    `with upserted as (
       insert into yk_attendance_entries (member_id, rehearsal_id, state_id, updated_by, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (member_id, rehearsal_id)
       do update set state_id = excluded.state_id, updated_by = excluded.updated_by, updated_at = now()
       returning id, member_id, rehearsal_id, state_id
     )
     select u.id, u.member_id, u.rehearsal_id, u.state_id, s.label, s.points
       from upserted u
       left join yk_attendance_states s on s.id = u.state_id`,
    [memberId, rehearsalId, stateId || null, context.user?.id ?? null],
  );
  await audit(context, 'update', 'yk_attendance_entries', result.rows[0].id, before, result.rows[0]);
  return result.rows[0];
}

export async function updateAttendanceState(id: string, input: Partial<AttendanceState>, context: AuditContext) {
  const before = (await query<AttendanceState>(`select id, key, label, points, color, sort_order, active from yk_attendance_states where id = $1`, [id])).rows[0];
  if (!before) throw new Error('State not found');
  const result = await query<AttendanceState>(
    `update yk_attendance_states
        set label = coalesce($2, label),
            points = coalesce($3, points),
            color = coalesce($4, color),
            sort_order = coalesce($5, sort_order),
            active = coalesce($6, active)
      where id = $1
      returning id, key, label, points, color, sort_order, active`,
    [
      id,
      input.label === undefined ? null : cleanText(input.label, 80),
      Number.isFinite(input.points) ? input.points : null,
      input.color === undefined ? null : cleanText(input.color, 20),
      Number.isFinite(input.sort_order) ? input.sort_order : null,
      typeof input.active === 'boolean' ? input.active : null,
    ],
  );
  await audit(context, 'update', 'yk_attendance_states', id, before, result.rows[0]);
  return result.rows[0];
}

export async function listUsers() {
  const result = await query<YkUser & { created_at: string; last_login_at: string | null }>(
    `select id, email, display_name, role, must_change_password, active, created_at::text, last_login_at::text
       from yk_users
      order by active desc, lower(email) asc`,
  );
  return result.rows;
}

export async function createUser(input: { email: string; displayName?: string; role: YkRole; password: string }, context: AuditContext) {
  const email = normalizeEmail(input.email);
  if (!email.includes('@') || input.password.length < 10) throw new Error('Invalid user');
  const role = ['admin', 'yonetim_kurulu', 'merkezi_yonetim_kurulu'].includes(input.role) ? input.role : 'yonetim_kurulu';
  const { salt, hash } = await hashPassword(input.password);
  const result = await query<YkUser>(
    `insert into yk_users (email, display_name, role, password_hash, password_salt, created_by)
     values ($1, $2, $3, $4, $5, $6)
     returning id, email, display_name, role, must_change_password, active`,
    [email, cleanText(input.displayName, 120) || null, role, hash, salt, context.user?.id ?? null],
  );
  await audit(context, 'create', 'yk_users', result.rows[0].id, null, { ...result.rows[0], password: '[redacted]' });
  return result.rows[0];
}

export async function updateUser(id: string, input: Partial<YkUser> & { password?: string }, context: AuditContext) {
  const before = (await query<YkUser>(`select id, email, display_name, role, must_change_password, active from yk_users where id = $1`, [id])).rows[0];
  if (!before) throw new Error('User not found');
  const role = input.role && ['admin', 'yonetim_kurulu', 'merkezi_yonetim_kurulu'].includes(input.role) ? input.role : before.role;
  let salt: string | null = null;
  let hash: string | null = null;
  if (input.password && input.password.length >= 10) {
    const next = await hashPassword(input.password);
    salt = next.salt;
    hash = next.hash;
  }
  const result = await query<YkUser>(
    `update yk_users
        set display_name = $2,
            role = $3,
            active = coalesce($4, active),
            password_hash = coalesce($5, password_hash),
            password_salt = coalesce($6, password_salt),
            must_change_password = case when $5::text is null then must_change_password else true end,
            updated_at = now()
      where id = $1
      returning id, email, display_name, role, must_change_password, active`,
    [
      id,
      input.display_name === undefined ? before.display_name : cleanText(input.display_name, 120) || null,
      role,
      typeof input.active === 'boolean' ? input.active : null,
      hash,
      salt,
    ],
  );
  if (hash) await query(`delete from yk_sessions where user_id = $1`, [id]);
  await audit(context, 'update', 'yk_users', id, before, { ...result.rows[0], password: hash ? '[reset]' : undefined });
  return result.rows[0];
}

export async function listLogs(filters: { actor?: string; action?: string; entity?: string } = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.actor) {
    params.push(`%${cleanText(filters.actor, 120)}%`);
    clauses.push(`actor_email ilike $${params.length}`);
  }
  if (filters.action) {
    params.push(`%${cleanText(filters.action, 80)}%`);
    clauses.push(`action ilike $${params.length}`);
  }
  if (filters.entity) {
    params.push(`%${cleanText(filters.entity, 80)}%`);
    clauses.push(`entity_type ilike $${params.length}`);
  }
  const result = await query(
    `select id, actor_email, action, entity_type, entity_id::text, created_at::text
       from yk_audit_logs
      ${clauses.length ? `where ${clauses.join(' and ')}` : ''}
      order by created_at desc
      limit 300`,
    params,
  );
  return result.rows;
}
