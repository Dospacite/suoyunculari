import type { APIRoute } from 'astro';
import { changePassword, createSession, query, verifyPassword } from '@/lib/yk';

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/login', 303);

  const form = await context.request.formData();
  const currentPassword = String(form.get('current_password') || '');
  const password = String(form.get('password') || '');
  const confirm = String(form.get('confirm') || '');

  if (password.length < 10 || password !== confirm) {
    return context.redirect('/change-password?error=invalid', 303);
  }

  const record = (
    await query<{ password_hash: string; password_salt: string }>(
      `select password_hash, password_salt from yk_users where id = $1`,
      [user.id],
    )
  ).rows[0];

  if (!record || !(await verifyPassword(currentPassword, record.password_salt, record.password_hash))) {
    return context.redirect('/change-password?error=current', 303);
  }

  await changePassword(user, password, context.request);
  const session = await createSession({ ...user, must_change_password: false }, context.request);
  context.cookies.set('yk_session', session.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: session.expiresAt,
  });
  return context.redirect('/roll-call', 303);
};
