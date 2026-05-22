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
      playType: url.searchParams.get('playType') ?? '',
      genre: url.searchParams.get('genre') ?? '',
      subgenre: url.searchParams.get('subgenre') ?? '',
      theme: url.searchParams.get('theme') ?? '',
      targetAudience: url.searchParams.get('targetAudience') ?? '',
      performanceGroup: url.searchParams.get('performanceGroup') ?? '',
      feature: url.searchParams.get('feature') ?? '',
      caution: url.searchParams.get('caution') ?? '',
      duration: url.searchParams.get('duration') ?? '',
      totalCast: url.searchParams.get('totalCast') ?? '',
      femaleRoles: url.searchParams.get('femaleRoles') ?? '',
      maleRoles: url.searchParams.get('maleRoles') ?? '',
      neutralRoles: url.searchParams.get('neutralRoles') ?? '',
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
        playTypes: [],
        subgenres: [],
        themes: [],
        targetAudiences: [],
        performanceGroups: [],
        features: [],
        cautions: [],
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
