import type { APIRoute } from 'astro';
import { completeGoogleDriveAuthorization } from '@/lib/google-drive';

export const GET: APIRoute = async (context) => {
  try {
    await completeGoogleDriveAuthorization(context);
    return context.redirect('/settings?drive=connected');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Drive connection failed';
    return context.redirect(`/settings?drive=error&message=${encodeURIComponent(message)}`);
  }
};
