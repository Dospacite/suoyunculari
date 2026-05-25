import type { APIRoute } from 'astro';
import { createSheet, listSheetSummaries } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const GET: APIRoute = async () => json({ sheets: await listSheetSummaries() });

export const POST: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    const sheet = await createSheet(
      {
        name: body.name,
        seasonId: body.seasonId,
        startDate: body.startDate,
        endDate: body.endDate,
        weekdays: body.weekdays,
        description: body.description,
      },
      { user, request: context.request },
    );
    return json({ sheet }, 201);
  } catch (error) {
    return handleError(error);
  }
};
