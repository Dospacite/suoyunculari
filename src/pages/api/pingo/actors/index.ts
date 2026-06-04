import type { APIRoute } from 'astro';
import { createPingoActor, listPingoActors } from '@/lib/pingo';
import { handleError, json, readJson, requireAdmin } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  try {
    requireAdmin(context);
    return json({ actors: await listPingoActors() });
  } catch (error) {
    return handleError(error);
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    const actor = await createPingoActor(await readJson(context), { user, request: context.request });
    return json({ actor }, 201);
  } catch (error) {
    return handleError(error);
  }
};
