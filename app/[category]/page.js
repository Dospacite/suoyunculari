import { getAllPosts } from '@/lib/posts';
import Link from 'next/link';

export default function CategoryPage({ params }) {
  const posts = getAllPosts(params.category);

  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold capitalize mb-4">{params.category}</h1>
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