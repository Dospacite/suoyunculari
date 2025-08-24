import '../styles/globals.css';
import { Footer } from '../components/footer';
import { Header } from '../components/header';
import { BottomHeader } from '@/components/bottom_header';

import localFont from 'next/font/local'

const GothamNarrow = localFont({
    src: [
        {
            path: '../public/fonts/GothamSSm/gothamnarrssm_book.otf',
            weight: '400',
            style: 'normal'
        }
    ],
    variable: '--font-gotham-narrow'
})

const Gotham = localFont({
    src: [
        {
            path: '../public/fonts/GothamSSm/gothamssm_light.otf',
            weight: '300',
            style: 'normal'
        }
    ],
    variable: '--font-gotham'
})

export const metadata = {
    title: {
        template: '%s | SUOyuncuları',
        default: 'SUOyuncuları'
    }
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={`${Gotham.variable} ${GothamNarrow.variable}`}>
            <head>
                <link rel="icon" href="images/minimal.svg" sizes="any" />
            </head>
            <body className="antialiased text-[#F5EFED] bg-[url('/images/bg.webp')] bg-black/50 bg-blend-multiply bg-contain bg-no-repeat">
                <div className="flex flex-col min-h-screen">
                    <div className="flex flex-col w-full mx-auto grow">
                        <Header />
                        {children}
                        <Footer />
                    </div>
                </div>
            </body>
        </html>
    );
}
