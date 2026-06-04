create table if not exists pingo_drive_auth (
  id integer primary key default 1 check (id = 1),
  account_email text,
  scope text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connected_by uuid references yk_users(id),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pingo_drive_oauth_states (
  state_hash text primary key,
  user_id uuid not null references yk_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists pingo_drive_oauth_states_expires_idx on pingo_drive_oauth_states(expires_at);

create table if not exists pingo_drive_files (
  file_id text primary key,
  drive_name text not null,
  drive_mime_type text not null,
  local_filename text not null,
  local_path text not null,
  download_mime_type text not null,
  bytes integer not null default 0,
  md5_checksum text,
  downloaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pingo_drive_download_tokens (
  token_hash text primary key,
  file_id text not null references pingo_drive_files(file_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists pingo_drive_download_tokens_expires_idx on pingo_drive_download_tokens(expires_at);
create index if not exists pingo_drive_download_tokens_file_idx on pingo_drive_download_tokens(file_id);

insert into pingo_tools (key, label, description, enabled, config)
values (
  'google_drive_scripts',
  'Google Drive Scripts',
  'Pingo can search configured Google Drive folders for stage play scripts and return one-day download links.',
  false,
  jsonb_build_object(
    'prompt',
    'Use Google Drive Scripts only when the user asks for a specific stage play script, oyun metni, or script file. Extract the requested play title, search Drive, and if no result is returned say the script was not found. If a result is returned, send the provided download link and mention that it expires in one day.',
    'allowedFolderIds',
    jsonb_build_array(),
    'includeSubfolders',
    true,
    'maxResults',
    8
  )
)
on conflict (key)
do update set label = excluded.label,
              description = excluded.description,
              config = pingo_tools.config || excluded.config,
              updated_at = now();

update pingo_settings
   set system_prompt = replace(
         system_prompt,
         'Metin Bankası aracını yalnızca kullanıcı tiyatro metni, oyun, tür, kadro, süre veya benzer arama istediğinde kullan.',
         'Kullanıcı belirli bir oyunun metin dosyasını/scriptini istediğinde Google Drive Scripts aracını kullan. Kullanıcı oyun önerisi, tür, kadro, süre veya metin bankası metadatası aradığında Metin Bankası aracını kullan.'
       ),
       updated_at = now()
 where system_prompt like '%Metin Bankası aracını yalnızca kullanıcı tiyatro metni, oyun, tür, kadro, süre veya benzer arama istediğinde kullan.%';
