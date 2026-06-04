import type { APIRoute } from 'astro';
import { deleteSheet, updateSheet } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const sheet = await updateSheet(String(context.params.id), await readJson(context), {
      user,
      request: context.request,
    });
    return json({ sheet });
  } catch (error) {
    return handleError(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    await deleteSheet(String(context.params.id), { user, request: context.request });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
