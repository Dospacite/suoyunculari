import type { APIRoute } from 'astro';
import { addMember, reorderMembers } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const POST: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    const member = await addMember(
      String(context.params.id),
      { firstName: body.firstName, lastName: body.lastName, memberRole: body.memberRole },
      { user, request: context.request },
    );
    return json({ member }, 201);
  } catch (error) {
    return handleError(error);
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const body = await readJson(context);
    await reorderMembers(String(context.params.id), Array.isArray(body.memberIds) ? body.memberIds.map(String) : [], {
      user,
      request: context.request,
    });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
