create table if not exists yk_seasons (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  start_date date,
  end_date date,
  archived boolean not null default false,
  created_by uuid references yk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into yk_seasons (name)
values ('Genel Sezon')
on conflict (name) do nothing;

alter table yk_roll_call_sheets
  add column if not exists season_id uuid references yk_seasons(id),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists rehearsal_weekdays integer[] not null default '{}';

update yk_roll_call_sheets
   set season_id = (select id from yk_seasons where name = 'Genel Sezon')
 where season_id is null;

alter table yk_roll_call_sheets
  alter column season_id set not null;

alter table yk_members
  add column if not exists season_id uuid references yk_seasons(id);

update yk_members
   set season_id = (
     select season_id
       from yk_roll_call_sheets
      where yk_roll_call_sheets.id = yk_members.sheet_id
      limit 1
   )
 where season_id is null
   and sheet_id is not null;

update yk_members
   set season_id = (select id from yk_seasons where name = 'Genel Sezon')
 where season_id is null;

alter table yk_members
  alter column season_id set not null,
  alter column sheet_id drop not null;

create index if not exists yk_roll_call_sheets_season_idx
  on yk_roll_call_sheets(season_id, archived, updated_at desc);

create index if not exists yk_members_season_name_idx
  on yk_members(season_id, active, last_name, first_name);
