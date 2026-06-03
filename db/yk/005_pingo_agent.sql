create table if not exists pingo_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  trigger_mode text not null default 'mention' check (trigger_mode in ('mention', 'keyword')),
  keyword text not null default 'pingo',
  mention_aliases text[] not null default array['pingo'],
  user_rate_limit integer not null default 6 check (user_rate_limit > 0 and user_rate_limit <= 120),
  chat_rate_limit integer not null default 20 check (chat_rate_limit > 0 and chat_rate_limit <= 600),
  short_memory_messages integer not null default 12 check (short_memory_messages > 0 and short_memory_messages <= 80),
  long_memory_enabled boolean not null default true,
  long_memory_max_results integer not null default 5 check (long_memory_max_results >= 0 and long_memory_max_results <= 20),
  system_prompt text not null default 'Sen Pingo''sun. SUOyuncuları için WhatsApp üzerinde çalışan yardımcı bir asistansın. Kısa, nazik ve işe yarar cevaplar ver. Metin Bankası aracını yalnızca kullanıcı tiyatro metni, oyun, tür, kadro, süre veya benzer arama istediğinde kullan.',
  updated_at timestamptz not null default now()
);

insert into pingo_settings (id) values (1)
on conflict (id) do nothing;

create table if not exists pingo_actors (
  id uuid primary key default gen_random_uuid(),
  identifier text unique not null,
  label text,
  role text not null check (role in ('admin', 'moderator')),
  active boolean not null default true,
  created_by uuid references yk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pingo_access_rules (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'chat')),
  identifier text not null,
  label text,
  list_type text not null check (list_type in ('whitelist', 'blacklist')),
  active boolean not null default true,
  created_by uuid references yk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_type, identifier, list_type)
);

create table if not exists pingo_tools (
  key text primary key,
  label text not null,
  description text,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into pingo_tools (key, label, description, enabled, config)
values
  ('text_bank', 'Metin Bankası', 'Pingo can search the website text bank and cite matching play records.', true, '{}'::jsonb)
on conflict (key) do nothing;

create table if not exists pingo_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  chat_id text,
  user_id text,
  message_id text,
  tool_key text,
  response_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists pingo_events_created_at_idx on pingo_events(created_at desc);
create index if not exists pingo_events_chat_created_idx on pingo_events(chat_id, created_at desc);
create index if not exists pingo_events_user_created_idx on pingo_events(user_id, created_at desc);
