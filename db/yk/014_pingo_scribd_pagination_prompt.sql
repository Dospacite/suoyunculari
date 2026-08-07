update pingo_tools
   set config = config || jsonb_build_object(
         'prompt',
         'Use Scribd Scripts when the user asks for the PDF, script, oyun metni, or text file of a specific play by title. First call search_scribd_scripts and show indexed results with link and page count. Use verbatim=true by default; use verbatim=false when the user asks for a broader/non-exact search. Use the page parameter when the user asks for next page or more results. Do not download immediately. If the user later asks to download one of those results by number or sends a Scribd document link, call download_scribd_script. If Scribd returns no result or is unavailable, say so plainly and do not invent links.'
       ),
       updated_at = now()
 where key = 'scribd_scripts';
