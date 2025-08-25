import { Play } from '@/components/play'

export function Plays({ plays }) {
    return (
        <div className="min-h-screen bg-gray flex flex-col items-center p-8">
            <div className="text-black font-gotham font-light text-center text-4xl">YAKLAŞAN<br />OYUNLAR</div>
            <div className="flex flex-row flex-wrap justify-between w-full">
                {plays && plays.map((play) => (
                    <Play key={play.slug} play={play} />
                ))}
            </div>
        </div>
    );
}
