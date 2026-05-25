import type { APIRoute } from 'astro';
import { createSeason, listSeasons } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const GET: APIRoute = async () => json({ seasons: await listSeasons() });

export const POST: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    const season = await createSeason(
      { name: body.name, startDate: body.startDate, endDate: body.endDate },
      { user, request: context.request },
    );
    return json({ season }, 201);
  } catch (error) {
    return handleError(error);
  }
};
