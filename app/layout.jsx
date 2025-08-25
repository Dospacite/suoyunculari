import '../styles/globals.css';
import { Footer } from '../components/footer';
import { Header } from '../components/header';

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
        },
        {
            path: '../public/fonts/GothamSSm/gothamssm_medium.otf',
            weight: '500',
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
            <body className="min-h-screen flex flex-col antialiased text-[#F5EFED]">
                <div className="flex flex-col">
                    <div className="flex flex-col w-full">
                        <Header />
                        <main>
                            {children}
                        </main>
                    </div>
                </div>
                <Footer />
            </body>
        </html>
    );
}
