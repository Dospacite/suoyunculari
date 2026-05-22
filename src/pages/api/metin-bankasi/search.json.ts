import type { APIRoute } from 'astro';
import { searchConcordPlays } from '@/lib/concord-db';
import { getPlayedTextBankReferences } from '@/lib/directus';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('pageSize') ?? '25');

  try {
    const playedReferences = await getPlayedTextBankReferences();
    const result = await searchConcordPlays({
      query: url.searchParams.get('q') ?? '',
      source: url.searchParams.get('source') ?? '',
      genre: url.searchParams.get('genre') ?? '',
      duration: url.searchParams.get('duration') ?? '',
      reference: url.searchParams.get('reference') ?? '',
      page,
      pageSize,
      playedReferences,
    });

    return json(result);
  } catch (error) {
    console.error('Metin Bankasi search failed:', error);
    return json(
      {
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
        genres: [],
        sources: [],
        databaseReady: false,
      },
      500,
    );
  }
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
