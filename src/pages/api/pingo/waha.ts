import type { APIRoute } from 'astro';
import { handlePingoWebhook } from '@/lib/pingo';

export const prerender = false;

export const POST: APIRoute = (context) => handlePingoWebhook(context);

export const ALL: APIRoute = async () =>
  new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
