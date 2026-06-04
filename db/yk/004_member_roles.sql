alter table yk_members
  add column if not exists member_role text not null default 'new_member';

alter table yk_members
  drop constraint if exists yk_members_member_role_check;

alter table yk_members
  add constraint yk_members_member_role_check
  check (member_role in ('new_member', 'old_member', 'yk', 'myk'));

create index if not exists yk_members_season_role_idx
  on yk_members(season_id, member_role, active);
