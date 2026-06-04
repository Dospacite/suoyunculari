import type { APIRoute } from 'astro';
import { updateAttendanceState } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const state = await updateAttendanceState(String(context.params.id), await readJson(context), {
      user,
      request: context.request,
    });
    return json({ state });
  } catch (error) {
    return handleError(error);
  }
};
