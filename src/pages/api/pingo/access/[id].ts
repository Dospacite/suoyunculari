import type { APIRoute } from 'astro';
import { deletePingoAccessRule, updatePingoAccessRule } from '@/lib/pingo';
import { handleError, json, readJson, requireAdmin } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    const accessRule = await updatePingoAccessRule(String(context.params.id), await readJson(context), {
      user,
      request: context.request,
    });
    return json({ accessRule });
  } catch (error) {
    return handleError(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    await deletePingoAccessRule(String(context.params.id), { user, request: context.request });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
