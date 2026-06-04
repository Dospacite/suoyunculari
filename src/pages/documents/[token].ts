import type { APIRoute } from 'astro';
import { readLocalPdf, verifyLocalPdfToken } from '@/lib/local-documents';

export const GET: APIRoute = async ({ params }) => {
  const id = verifyLocalPdfToken(String(params.token || ''));
  if (!id) return new Response('This download link is expired or unavailable.', { status: 404 });
  const { document, data } = await readLocalPdf(id).catch(() => ({ document: null, data: null }));
  if (!document || !data) return new Response('This download link is expired or unavailable.', { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(data.byteLength),
      'content-disposition': `attachment; filename="${document.filename.replace(/["\\]/g, '')}"`,
      'cache-control': 'private, max-age=0, no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
};
