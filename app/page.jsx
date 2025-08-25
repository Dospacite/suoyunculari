import { getAllCategories, getLatestPosts, getPostsByCategories } from '@/lib/posts';
import Link from 'next/link';
import Image from 'next/image';
import logo from 'public/images/logo.svg';
import { Plays } from '@/components/plays';
import { ArrowDownIcon } from '@heroicons/react/24/outline';
import { Tools } from '@/components/tools';
import { LatestBlogs } from '@/components/latest-blogs';

export default function HomePage() {
  const latestPlays = getPostsByCategories("play");
  const latestBlogs = getPostsByCategories("blog");

  return (
    <>
    <div className="flex flex-col items-center p-8 justify-center min-h-screen bg-[url('/images/bg.webp')] bg-black/50 bg-blend-multiply bg-center bg-cover">
        <Image src={logo} alt="SUO logo" className="w-64" />
        <h2 className="text-6xl font-normal font-gotham-narrow text-center tracking-wide">Tiyatro</h2>
        <h2 className="text-6xl font-normal font-gotham-narrow text-center">Kulübü</h2>
        <div className="flex flex-col">
          <span className="text-2xl font-light font-gotham text-center block mt-4 tracking-widest">KEŞFET</span>
          <ArrowDownIcon className="w-6 h-6 mx-auto mt-4 text-white stroke-2 animate-bounce" />
        </div>
      </div>
      <Plays plays={latestPlays} />
      <Tools />
      <LatestBlogs blogs={latestBlogs} />
    </>
  );
}
