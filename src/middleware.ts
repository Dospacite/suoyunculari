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
  '/seasons',
  '/api/auth',
  '/api/roll-call',
  '/api/users',
  '/api/seasons',
];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(context.request.method)) {
    const origin = context.request.headers.get('origin');
    const forwardedHost = context.request.headers.get('x-forwarded-host');
    const requestHost = forwardedHost || context.request.headers.get('host') || context.url.host;
    const allowedHosts = new Set([
      requestHost,
      context.url.host,
      process.env.YK_PUBLIC_HOST || 'yk.suoyunculari.com',
    ]);
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        return new Response('Forbidden', { status: 403 });
      }
      if (!allowedHosts.has(originHost)) {
        return new Response('Cross-site POST form submissions are forbidden', { status: 403 });
      }
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
