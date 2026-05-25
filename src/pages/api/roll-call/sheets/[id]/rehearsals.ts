import type { APIRoute } from 'astro';
import { addRehearsal } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const POST: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    const rehearsal = await addRehearsal(
      String(context.params.id),
      { date: body.date, title: body.title, notes: body.notes },
      { user, request: context.request },
    );
    return json({ rehearsal }, 201);
  } catch (error) {
    return handleError(error);
  }
};
