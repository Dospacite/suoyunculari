import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from '@/lib/yk';

const publicPrefixes = ['/login', '/api/auth/login', '/api/pingo/waha', '/drive', '/documents', '/favicon.svg', '/Logo.svg', '/pingo.svg', '/_astro', '/images'];
const appPrefixes = [
  '/change-password',
  '/roll-call',
  '/members',
  '/users',
  '/settings',
  '/logs',
  '/seasons',
  '/belgeler',
  '/api/auth',
  '/api/documents',
  '/api/roll-call',
  '/api/users',
  '/api/seasons',
  '/pingo',
  '/api/pingo',
];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const forwardedHost = context.request.headers.get('x-forwarded-host');
  const requestHost = forwardedHost || context.request.headers.get('host') || context.url.host;
  const requestHostname = requestHost.split(':')[0];
  const ykHostname = process.env.YK_PUBLIC_HOST || 'yk.suoyunculari.com';
  const pingoHostname = process.env.PINGO_PUBLIC_HOST || 'pingo.suoyunculari.com';
  const isYkHost = requestHostname === ykHostname || requestHostname === pingoHostname;
  const isAppPath = appPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (pathname === '/' && requestHostname === pingoHostname) {
    return context.redirect('/pingo');
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(context.request.method)) {
    const origin = context.request.headers.get('origin');
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

  if (!isYkHost && !isAppPath) {
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

  if (!isAppPath) {
    return context.redirect('/roll-call');
  }

  return next();
});
