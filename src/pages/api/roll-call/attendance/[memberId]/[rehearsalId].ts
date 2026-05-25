import type { APIRoute } from 'astro';
import { updateAttendance } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    const entry = await updateAttendance(
      String(context.params.memberId),
      String(context.params.rehearsalId),
      body.stateId ? String(body.stateId) : null,
      { user, request: context.request },
    );
    return json({ entry });
  } catch (error) {
    return handleError(error);
  }
};
