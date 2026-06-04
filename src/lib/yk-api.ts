import type { APIContext } from 'astro';
import { canEditRollCall, isAdmin, type YkUser } from '@/lib/yk';

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function readJson(context: APIContext) {
  const type = context.request.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    throw new Error('JSON body required');
  }
  return context.request.json();
}

export async function readForm(context: APIContext) {
  const form = await context.request.formData();
  return Object.fromEntries(form.entries());
}

export function getUser(context: APIContext): YkUser {
  const user = context.locals.user;
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export function requireEditor(context: APIContext): YkUser {
  const user = getUser(context);
  if (!canEditRollCall(user)) {
    throw new Error('Forbidden');
  }
  return user;
}

export function requireAdmin(context: APIContext): YkUser {
  const user = getUser(context);
  if (!isAdmin(user)) {
    throw new Error('Forbidden');
  }
  return user;
}

export function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Beklenmeyen hata';
  if (message === 'Unauthorized') return json({ error: 'Oturum gerekli' }, 401);
  if (message === 'Forbidden') return json({ error: 'Yetkin yok' }, 403);
  return json({ error: message || 'Beklenmeyen hata' }, 400);
}
