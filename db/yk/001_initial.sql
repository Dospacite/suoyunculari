create extension if not exists pgcrypto;

create table if not exists yk_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  role text not null check (role in ('admin', 'yonetim_kurulu', 'merkezi_yonetim_kurulu')),
  password_hash text not null,
  password_salt text not null,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_by uuid references yk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists yk_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references yk_users(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists yk_roll_call_sheets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  archived boolean not null default false,
  created_by uuid references yk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists yk_members (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references yk_roll_call_sheets(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists yk_rehearsals (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references yk_roll_call_sheets(id) on delete cascade,
  rehearsal_date date not null,
  title text,
  notes text,
  sort_order integer not null default 0
);

create table if not exists yk_attendance_states (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references yk_roll_call_sheets(id) on delete cascade,
  key text not null,
  label text not null,
  points integer not null check (points >= 0 and points <= 100),
  color text,
  sort_order integer not null default 0,
  active boolean not null default true
);

create unique index if not exists yk_attendance_states_sheet_key_idx
  on yk_attendance_states(sheet_id, key);

create table if not exists yk_attendance_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references yk_members(id) on delete cascade,
  rehearsal_id uuid not null references yk_rehearsals(id) on delete cascade,
  state_id uuid references yk_attendance_states(id),
  note text,
  updated_by uuid references yk_users(id),
  updated_at timestamptz not null default now(),
  unique (member_id, rehearsal_id)
);

create table if not exists yk_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references yk_users(id),
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_value jsonb,
  after_value jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists yk_sessions_expires_at_idx on yk_sessions(expires_at);
create index if not exists yk_members_sheet_name_idx on yk_members(sheet_id, last_name, first_name);
create index if not exists yk_rehearsals_sheet_order_idx on yk_rehearsals(sheet_id, sort_order, rehearsal_date);
create index if not exists yk_audit_logs_created_at_idx on yk_audit_logs(created_at desc);
