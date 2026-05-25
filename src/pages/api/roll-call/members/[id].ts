import type { APIRoute } from 'astro';
import { deleteMember, updateMember } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    const member = await updateMember(String(context.params.id), await readJson(context), {
      user,
      request: context.request,
    });
    return json({ member });
  } catch (error) {
    return handleError(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const user = requireEditor(context);
    await deleteMember(String(context.params.id), { user, request: context.request });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
