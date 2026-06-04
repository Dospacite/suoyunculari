import type { APIRoute } from 'astro';
import { updatePingoTool } from '@/lib/pingo';
import { handleError, json, readJson, requireAdmin } from '@/lib/yk-api';

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    const tool = await updatePingoTool(String(context.params.key), await readJson(context), {
      user,
      request: context.request,
    });
    return json({ tool });
  } catch (error) {
    return handleError(error);
  }
};
