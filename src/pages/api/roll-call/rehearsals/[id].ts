import type { APIRoute } from 'astro';
import { deleteRehearsal, updateRehearsal } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const rehearsal = await updateRehearsal(String(context.params.id), await readJson(context), {
      user,
      request: context.request,
    });
    return json({ rehearsal });
  } catch (error) {
    return handleError(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    await deleteRehearsal(String(context.params.id), { user, request: context.request });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
