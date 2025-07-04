import Link from 'next/link';
import { getAllPosts } from '../lib/posts';

export default function HomePage() {
  const posts = getAllPosts();

  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold mb-6">Theater Club Blog</h1>
      {posts.map((post) => (
        <article key={post.slug} className="mb-6 border-b pb-4">
          <h2 className="text-xl font-semibold">
            <Link href={`/blog/${post.slug}`} className="text-blue-600 hover:underline">
              {post.title}
            </Link>
          </h2>
          {post.date && (
            <p className="text-sm text-gray-500">{new Date(post.date).toDateString()}</p>
          )}
          <p>{post.content.slice(0, 200)}...</p>
        </article>
      ))}
    </main>
  );
}
