import type { APIRoute } from 'astro';
import { createSheet, listSheets } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const GET: APIRoute = async () => json({ sheets: await listSheets() });

export const POST: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    const sheet = await createSheet(
      { name: body.name, description: body.description },
      { user, request: context.request },
    );
    return json({ sheet }, 201);
  } catch (error) {
    return handleError(error);
  }
};
