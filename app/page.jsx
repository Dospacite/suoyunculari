import { getSortedPosts } from '@/lib/posts';
import Markdown from 'markdown-to-jsx';

export async function getStaticProps() {
  const posts = getSortedPosts();
  return { props: { posts } };
}

export default function HomePage({ posts }) {
  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold mb-4">Theater Club Blog</h1>
      {posts.map((post) => (
        <article key={post.slug} className="mb-8 border-b pb-4">
          <h2 className="text-xl font-semibold">{post.title}</h2>
          {post.date && (
            <p className="text-sm text-gray-500">{new Date(post.date).toDateString()}</p>
          )}
          <Markdown>{post.content}</Markdown>
        </article>
      ))}
    </main>
  );
}
