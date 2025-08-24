import Image from 'next/image';
import Link from 'next/link';
import logo from 'public/images/logo.svg';
import spotify from 'public/images/spotify.svg';
import tiktok from 'public/images/tiktok.svg';
import youtube from 'public/images/youtube.svg';
import instagram from 'public/images/instagram.svg';


export function Header() {
    return (
        <nav className="absolute flex flex-wrap w-full justify-between items-center p-6">
            <Image src={logo} alt="SUO logo"/>
            <div className='flex-1'></div>
            <div className='flex space-x-8 items-center'>
                <Link href="/">
                    <Image src={spotify} alt="Spotify" className='w-8 h-8'/>
                </Link>
                <Link href="/">
                    <Image src={tiktok} alt="TikTok" className='w-8 h-8'/>
                </Link>
                <Link href="/">
                    <Image src={youtube} alt="YouTube" className='w-8 h-8'/>
                </Link>
                <Link href="/">
                    <Image src={instagram} alt="Instagram" className='w-8 h-8'/>
                </Link>
                <a className='bg-none no-underline text-white px-8 py-3 rounded-lg border-2 border-white font-gotham font-light tracking-wide hover:bg-white hover:text-black duration-300 cursor-pointer'>BLOG</a>
            </div>
        </nav>
    );
}
