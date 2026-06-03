import type { APIRoute } from 'astro';
import { deletePingoActor, updatePingoActor } from '@/lib/pingo';
import { handleError, json, readJson, requireAdmin } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    const actor = await updatePingoActor(String(context.params.id), await readJson(context), {
      user,
      request: context.request,
    });
    return json({ actor });
  } catch (error) {
    return handleError(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    await deletePingoActor(String(context.params.id), { user, request: context.request });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
