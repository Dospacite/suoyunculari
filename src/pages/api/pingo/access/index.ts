import type { APIRoute } from 'astro';
import { createPingoAccessRule, listPingoAccessRules } from '@/lib/pingo';
import { handleError, json, readJson, requireAdmin } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  try {
    requireAdmin(context);
    return json({ accessRules: await listPingoAccessRules() });
  } catch (error) {
    return handleError(error);
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    const accessRule = await createPingoAccessRule(await readJson(context), { user, request: context.request });
    return json({ accessRule }, 201);
  } catch (error) {
    return handleError(error);
  }
};
