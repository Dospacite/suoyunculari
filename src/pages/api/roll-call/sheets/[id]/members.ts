import type { APIRoute } from 'astro';
import { addSheetMember } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const POST: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    const member = await addSheetMember(
      String(context.params.id),
      { firstName: body.firstName, lastName: body.lastName },
      { user, request: context.request },
    );
    return json({ member }, 201);
  } catch (error) {
    return handleError(error);
  }
};
