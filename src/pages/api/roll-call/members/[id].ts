import type { APIRoute } from 'astro';
import { deleteMember, getMemberDetails, updateMember } from '@/lib/yk';
import { handleError, json, readJson, requireEditor } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  try {
    requireEditor(context);
    const details = await getMemberDetails(String(context.params.id));
    if (!details) return json({ error: 'Üye bulunamadı' }, 404);
    return json(details);
  } catch (error) {
    return handleError(error);
  }
};

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
