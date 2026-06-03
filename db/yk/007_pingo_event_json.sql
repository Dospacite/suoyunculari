alter table pingo_events
  add column if not exists request_json jsonb,
  add column if not exists response_json jsonb;
