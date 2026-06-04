insert into pingo_tools (key, label, description, enabled, config)
values (
  'room_availability',
  'Room Availability',
  'Pingo can search Sabanci SUIS room availability and show detailed schedules for a room.',
  true,
  jsonb_build_object(
    'prompt',
    'Use Room Availability only for Sabanci University room availability, classroom/room schedule, building, date, day, time range, category, capacity, or room attribute questions. For "today", "tomorrow", and similar relative dates, use the current_time value in the request context. Ask for missing building and room code when the user wants a detailed schedule for one specific room and those fields are not clear.'
  )
)
on conflict (key)
do update set label = excluded.label,
              description = excluded.description,
              config = pingo_tools.config || excluded.config,
              updated_at = now();

update pingo_tools
   set config = config || jsonb_build_object(
     'prompt',
     coalesce(
       nullif(config->>'prompt', ''),
       'Use Metin Bankası only when the user asks for theatre texts, plays, musicals, genres, cast size, duration, themes, or similar play-search metadata. Do not use it for chat history, people lookup, image interpretation, or general questions. If the tool returns no result, say no matching record was found and do not invent plays or sources.'
     )
   ),
       updated_at = now()
 where key = 'text_bank';
