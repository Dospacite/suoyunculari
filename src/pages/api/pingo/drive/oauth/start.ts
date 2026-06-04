import type { APIRoute } from 'astro';
import { createGoogleDriveAuthorizationUrl } from '@/lib/google-drive';
import { handleError, requireAdmin } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  try {
    requireAdmin(context);
    return context.redirect(await createGoogleDriveAuthorizationUrl(context));
  } catch (error) {
    return handleError(error);
  }
};
