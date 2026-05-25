import type { APIRoute } from 'astro';
import { addMember } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const POST: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    const member = await addMember(
      String(context.params.id),
      { firstName: body.firstName, lastName: body.lastName, notes: body.notes },
      { user, request: context.request },
    );
    return json({ member }, 201);
  } catch (error) {
    return handleError(error);
  }
};
