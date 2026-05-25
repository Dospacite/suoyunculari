import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from '@/lib/yk';

const publicPrefixes = ['/login', '/api/auth/login', '/favicon.svg', '/Logo.svg', '/_astro', '/images'];
const appPrefixes = [
  '/change-password',
  '/roll-call',
  '/members',
  '/users',
  '/settings',
  '/logs',
  '/api/auth',
  '/api/roll-call',
  '/api/users',
];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(context.request.method)) {
    const origin = context.request.headers.get('origin');
    if (origin && new URL(origin).host !== context.url.host) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  if (publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return next();
  }

  const token = context.cookies.get('yk_session')?.value;
  const user = await getSessionUser(token).catch(() => null);

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Oturum gerekli' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return context.redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  context.locals.user = user;

  if (user.must_change_password && pathname !== '/change-password' && pathname !== '/api/auth/change-password' && pathname !== '/api/auth/logout') {
    return context.redirect('/change-password');
  }

  if (pathname === '/') {
    return context.redirect('/roll-call');
  }

  if (!appPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return context.redirect('/roll-call');
  }

  return next();
});
