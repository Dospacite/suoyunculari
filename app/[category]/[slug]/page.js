import { getPostByCategoryAndSlug, getAllPosts } from '@/lib/posts';
import Markdown from 'markdown-to-jsx';

export async function generateStaticParams() {
  const posts = getAllPosts();

  return posts.map((post) => ({
    category: post.category,
    slug: post.slug,
  }));
}

export default function PostPage({ params }) {
  const post = getPostByCategoryAndSlug(params.category, params.slug);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">{post.title}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {new Date(post.date).toDateString()}
      </p>
      <Markdown>{post.content}</Markdown>
    </main>
  );
}
