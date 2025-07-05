import '../styles/globals.css';
import { Footer } from '../components/footer';
import { Header } from '../components/header';
import { BottomHeader } from '@/components/bottom_header';

export const metadata = {
    title: {
        template: '%s | SUOyuncuları',
        default: 'SUOyuncuları'
    }
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link rel="icon" href="images/minimal.svg" sizes="any" />
            </head>
            <body className="antialiased text-[#F5EFED] bg-[#121212]">
                <div className="flex flex-col min-h-screen">
                    <div className="flex flex-col w-full mx-auto grow">
                        <Header />
                        <BottomHeader />
                        {children}
                        <Footer />
                    </div>
                </div>
            </body>
        </html>
    );
}
