import { getRehearsalIdeas } from '@/lib/directus';

export const prerender = false;

export async function GET() {
  const ideas = await getRehearsalIdeas();

  return new Response(
    JSON.stringify(
      ideas.map((idea) => ({
        title: idea.title,
        slug: idea.slug,
        summary: idea.summary,
        body: idea.body,
        tags: idea.tags ?? [],
        difficulty: idea.difficulty,
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
