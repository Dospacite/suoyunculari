import { getAllPosts } from '@/lib/posts';
import Link from 'next/link';


export default function PlayPage() {
  const posts = getAllPosts('play');

  return (
    <main className="p-6 w-full grow flex flex-col items-center">
      {posts.map((post) => (
        <div key={post.slug} className="mb-4">
          <Link href={`/${post.category}/${post.slug}`} className="text-blue-600 hover:underline text-xl">
            {post.title}
          </Link>
        </div>
      ))}
    </main>
  );
}
