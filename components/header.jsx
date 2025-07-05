import Image from 'next/image';
import Link from 'next/link';
import logo from 'public/images/logo.svg';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export function Header() {
    return (
        <nav className="flex flex-wrap w-full justify-between items-center px-6 border-b border-gray-500">
            <Link href="/">
                <Image src={logo} alt="SUO logo" className='w-20 h-20'/>
            </Link>
            <Link href="/" className='inline-flex items-center text-3xl font-semibold no-underline absolute left-1/2 transform -translate-x-1/2'>
                <span className='font-extrabold'>SUO</span><span>yunculari.com</span>
            </Link>
            <button>
                <MagnifyingGlassIcon className='w-8 h-8 hover:cursor-pointer'></MagnifyingGlassIcon>
            </button>
        </nav>
    );
}
