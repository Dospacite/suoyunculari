import type { APIRoute } from 'astro';
import { listLogs } from '@/lib/yk';
import { handleError, json, getUser } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  try {
    getUser(context);
    return json({
      logs: await listLogs({
        actor: context.url.searchParams.get('actor') || undefined,
        action: context.url.searchParams.get('action') || undefined,
        entity: context.url.searchParams.get('entity') || undefined,
      }),
    });
  } catch (error) {
    return handleError(error);
  }
};
