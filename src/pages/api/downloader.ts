import type { APIRoute } from 'astro';

export const POST: APIRoute = () => {
  return new Response(JSON.stringify({ error: 'Use the WebSocket downloader endpoint.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GET: APIRoute = async ({ url }) => {
  try {
    const jobs = await import('@/lib/downloader-jobs');
    void jobs.startDownloaderJob;
    void jobs.subscribeDownloaderJob;
    void jobs.cancelDownloaderJob;
    const result = jobs.getDownloaderResult(url.searchParams.get('id'));
    return new Response(new Uint8Array(result.pdf), {
      headers: {
        'Content-Disposition': `attachment; filename="${result.filename.replace(/"/g, '')}"`,
        'Content-Length': String(result.pdf.length),
        'Content-Type': 'application/pdf',
        'X-Page-Count': String(result.pageCount),
      },
    });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500;
    const message = error instanceof Error ? error.message : 'Unexpected downloader error.';
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
