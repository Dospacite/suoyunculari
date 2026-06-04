import type { APIRoute } from 'astro';
import { updateUser } from '@/lib/yk';
import { handleError, json, readJson, requireAdmin } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    const updated = await updateUser(String(context.params.id), await readJson(context), {
      user,
      request: context.request,
    });
    return json({ user: updated });
  } catch (error) {
    return handleError(error);
  }
};
