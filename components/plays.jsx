export function Plays({ plays }) {
    return (
        <div className="h-screen bg-white flex flex-col items-center p-8">
            <div className="text-black font-gotham font-light text-center text-4xl">YAKLAŞAN<br />OYUNLAR</div>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
                {plays && plays.map((play) => (
                    <div key={play.id} className="p-4 rounded-md">
                        <h3 className="font-gotham font-semibold">{play.title}</h3>
                        <p className="font-gotham font-light">{play.date}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
