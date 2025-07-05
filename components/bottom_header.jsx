'use client'; 

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
    { linkText: 'Ana Sayfa', href: '/' },
    { linkText: 'Yazılar', href: '/yazilar' },
    { linkText: 'Provalar', href: '/provalar' },
    { linkText: 'Oyunlar', href: '/oyunlar' },
    { linkText: 'Metinler', href: '/metinler' },
    { linkText: 'Yaptıklarımız', href: '/yaptiklarimiz' },
    { linkText: 'Hakkımızda', href: '/hakkimizda' }
];

export function BottomHeader() {

    const pathname = usePathname();

    return (
        <nav className="flex flex-wrap w-full justify-center items-center gap-x-16 pt-3 pb-3 border-b border-gray-500">
          {navItems.map(({ linkText, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
    
            return (
              <Link
                key={href}
                href={href}
                className={`no-underline text-white text-xl ${isActive ? 'font-bold' : 'font-medium'}`}
              >
                {linkText}
              </Link>
            );
          })}
        </nav>
      );
}
