import type { APIRoute } from 'astro';
import { disconnectGoogleDrive } from '@/lib/google-drive';
import { handleError, json, requireAdmin } from '@/lib/yk-api';

export const POST: APIRoute = async (context) => {
  try {
    requireAdmin(context);
    await disconnectGoogleDrive();
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
