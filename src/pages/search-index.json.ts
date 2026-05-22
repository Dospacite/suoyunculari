import { getPlays } from '@/lib/directus';

export const prerender = false;

export async function GET() {
  const plays = await getPlays();

  return new Response(
    JSON.stringify(
      plays.map((play) => ({
        title: play.title,
        slug: play.slug,
        author: play.author?.name,
        summary: play.summary,
        genres: play.genres?.map((genre) => genre.name) ?? [],
        tags: play.tags?.map((tag) => tag.name) ?? [],
        difficulty: play.difficulty,
      })),
    ),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}
