import type { APIRoute } from 'astro';
import { updateSeason } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    const season = await updateSeason(
      String(context.params.id),
      {
        name: body.name,
        start_date: body.startDate ?? body.start_date,
        end_date: body.endDate ?? body.end_date,
        archived: body.archived,
      },
      { user, request: context.request },
    );
    return json({ season });
  } catch (error) {
    return handleError(error);
  }
};
