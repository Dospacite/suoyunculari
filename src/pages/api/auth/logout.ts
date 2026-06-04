import type { APIRoute } from 'astro';
import { audit, destroySession } from '@/lib/yk';

export const POST: APIRoute = async (context) => {
  const token = context.cookies.get('yk_session')?.value;
  await audit({ user: context.locals.user ?? null, request: context.request }, 'logout', 'yk_sessions');
  await destroySession(token);
  context.cookies.delete('yk_session', { path: '/' });
  return context.redirect('/login', 303);
};
