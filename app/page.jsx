import { getAllCategories } from '@/lib/posts';
import Link from 'next/link';

export default function HomePage() {
  const categories = getAllCategories();

  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold mb-6">Theater Club Content</h1>
      {categories.map((category) => (
        <Link
          key={category}
          href={`/${category}`}
          className="block text-xl text-blue-600 hover:underline mb-2 capitalize"
        >
          {category}
        </Link>
      ))}
    </main>
  );
}
