import type { APIRoute } from 'astro';
import { readLocalPdf } from '@/lib/local-documents';
import { getUser } from '@/lib/yk-api';

export const GET: APIRoute = async (context) => {
  getUser(context);
  const { data } = await readLocalPdf(String(context.params.id || ''));
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(data.byteLength),
      'content-disposition': 'inline',
      'cache-control': 'private, max-age=0, no-store',
    },
  });
};
