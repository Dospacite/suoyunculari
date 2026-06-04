insert into pingo_tools (key, label, description, enabled, config)
values (
  'scribd_scripts',
  'Scribd Scripts',
  'Pingo can search Scribd for play script PDFs, list indexed results, and download a selected result as a one-day PDF link.',
  true,
  jsonb_build_object(
    'prompt',
    'Use Scribd Scripts when the user asks for the PDF, script, oyun metni, or text file of a specific play by title. First call search_scribd_scripts and show indexed results with link and page count. Do not download immediately. If the user later asks to download one of those results by number or sends a Scribd document link, call download_scribd_script. If Scribd returns no result or is unavailable, say so plainly and do not invent links.',
    'maxResults',
    6
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
         'Kullanıcı belirli bir oyunun metin dosyasını/scriptini istediğinde Google Drive Scripts aracını kullan. Kullanıcı oyun önerisi, tür, kadro, süre veya metin bankası metadatası aradığında Metin Bankası aracını kullan.',
         'Kullanıcı belirli bir oyunun PDF/script/metin dosyasını istediğinde önce Scribd Scripts aracında oyunu ara ve indeksli sonuçları ver. Kullanıcı bu sonuçlardan birini numara veya Scribd linkiyle indirmek isterse Scribd Scripts indirme aracını kullan. Kullanıcı özellikle kulüp arşivi veya Drive isterse Google Drive Scripts aracını kullan. Kullanıcı oyun önerisi, tür, kadro, süre veya metin bankası metadatası aradığında Metin Bankası aracını kullan.'
       ),
       updated_at = now()
 where system_prompt like '%Kullanıcı belirli bir oyunun metin dosyasını/scriptini istediğinde Google Drive Scripts aracını kullan.%'
   and system_prompt not like '%Scribd Scripts%';
