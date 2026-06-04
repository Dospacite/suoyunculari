import type { APIRoute } from 'astro';
import { getPingoDashboardData, updatePingoSettings } from '@/lib/pingo';
import { handleError, json, readJson, requireAdmin } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  try {
    requireAdmin(context);
    return json(await getPingoDashboardData());
  } catch (error) {
    return handleError(error);
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    const settings = await updatePingoSettings(await readJson(context), { user, request: context.request });
    return json({ settings });
  } catch (error) {
    return handleError(error);
  }
};
