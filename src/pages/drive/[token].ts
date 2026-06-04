import type { APIRoute } from 'astro';
import { getDriveDownloadByToken } from '@/lib/google-drive';

export const GET: APIRoute = async (context) => {
  const token = String(context.params.token || '');
  const download = await getDriveDownloadByToken(token);
  if (!download) {
    return new Response('This download link is expired or unavailable.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const filename = download.file.local_filename.replace(/["\\]/g, '');
  return new Response(download.data, {
    headers: {
      'content-type': download.file.download_mime_type || 'application/octet-stream',
      'content-length': String(download.data.byteLength),
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, max-age=0, no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
};
