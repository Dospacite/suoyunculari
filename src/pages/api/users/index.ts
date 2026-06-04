import type { APIRoute } from 'astro';
import { createUser, listUsers } from '@/lib/yk';
import { handleError, json, readJson, requireAdmin } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  try {
    requireAdmin(context);
    return json({ users: await listUsers() });
  } catch (error) {
    return handleError(error);
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const user = requireAdmin(context);
    const body = await readJson(context);
    const created = await createUser(
      { email: body.email, displayName: body.displayName, role: body.role, password: body.password },
      { user, request: context.request },
    );
    return json({ user: created }, 201);
  } catch (error) {
    return handleError(error);
  }
};
