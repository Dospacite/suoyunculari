update pingo_tools
   set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
         'prompt',
         'Use Room Availability only for Sabanci University room availability, classroom/room schedule, building, date, day, time range, category, capacity, room attribute, or room booking-detail questions. For "today", "tomorrow", and similar relative dates, use the current_time value in the request context. Ask for missing building and room code when the user wants a detailed schedule for one specific room and those fields are not clear. When the user asks who reserved/booked a room, why a time slot is occupied, or what event/course is using the room, call the schedule lookup with includeDetails=true so every returned time slot includes its detail page information. For a general schedule or occupied/free time answer, cite the returned scheduleUrl as the link. Never construct sabanci_rooms.r_crn1 detail links yourself; use a returned detailUrl only when it includes r_crn and the answer is about that exact reservation.'
       ),
       updated_at = now()
 where key = 'room_availability';
