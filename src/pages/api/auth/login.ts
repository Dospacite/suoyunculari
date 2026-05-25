import type { APIRoute } from 'astro';
import { createSession, login } from '@/lib/yk';

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = String(form.get('email') || '');
  const password = String(form.get('password') || '');
  const next = String(form.get('next') || '/roll-call');
  const user = await login(email, password, context.request);

  if (!user) {
    return context.redirect('/login?error=1', 303);
  }

  const session = await createSession(user, context.request);
  context.cookies.set('yk_session', session.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: session.expiresAt,
  });

  return context.redirect(user.must_change_password ? '/change-password' : next, 303);
};
