import { Tool } from "@/components/tool";

export function Tools() {
    return (
        <div className="min-h-screen bg-gray flex flex-col items-center p-8">
            <div className="text-black font-gotham font-light text-center text-4xl">ARAÇLAR</div>
            <div className="flex flex-row flex-wrap justify-between w-full">
                <Tool name="Metin Ara" href="/tools/play-finder"/>
                <Tool name="Prova Fikirleri" href="/tools/rehersals"/>
            </div>
        </div>
    );
}
