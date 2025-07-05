import { getAllCategories, getLatestPosts, getPostsByCategories } from '@/lib/posts';
import Link from 'next/link';
import Image from 'next/image';
import { PostHero } from '@/components/post_hero';

export default function HomePage() {
  const latestPosts = getPostsByCategories(["blog", "play"]);

  return (
    <main className="flex flex-col items-center grow p-8">
      <div>
        <PostHero post={latestPosts[0]}></PostHero>
      </div>
    </main>
  );
}
