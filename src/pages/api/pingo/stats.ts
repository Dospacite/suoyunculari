import type { APIRoute } from 'astro';
import { getPingoStats } from '@/lib/pingo';
import { handleError, json, requireAdmin } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  try {
    requireAdmin(context);
    return json({ stats: await getPingoStats() });
  } catch (error) {
    return handleError(error);
  }
};
