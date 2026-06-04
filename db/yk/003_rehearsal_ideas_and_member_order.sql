alter table yk_members
  add column if not exists sort_order integer;

alter table yk_rehearsals
  add column if not exists rehearsal_idea_slug text,
  add column if not exists rehearsal_idea_title text;

create index if not exists yk_members_season_order_idx
  on yk_members(season_id, active, sort_order, last_name, first_name);
