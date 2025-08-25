import Markdown from "markdown-to-jsx";
import { CalendarDaysIcon, MapPinIcon } from "@heroicons/react/24/outline";

export function Play({ play }) {
    let image;
    if (play.data.image) {
        image = <Image src={play.data.image} alt={play.data.title} className="w-full h-auto" />;
    } else {
        image = <div className="w-full h-auto aspect-[16/9] min-w-xs bg-gradient-to-br from-niceRed to-niceBlue" />;
    }

    let datetime;
    if (play.data.datetime) { // Convert Datetime to readable format
        datetime = new Date(play.data.datetime).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    return (
        <div className="flex flex-col p-8 flex-1">
            {image}
            <Markdown className="text-2xl text-black font-gotham font-medium mt-4">{play.data.title}</Markdown>
            <Markdown className="text-lg mt-2 text-black font-gotham font-light max-w-sm">{play.data.description}</Markdown>
            <div className="flex flex-row mt-4 justify-between items-center flex-wrap gap-y-4">
                <div className="flex flex-col gap-2">
                    <div className="flex flex-row  items-center">
                        <CalendarDaysIcon className="w-12 h-12 text-niceRed" />
                        <span className="text-md text-black">{datetime}</span>
                    </div>
                    <div className="flex flex-row gap-2 items-center">
                        <MapPinIcon className="w-12 h-12 text-niceRed" />
                        <span className="text-md text-black">{play.data.location}</span>
                    </div>
                </div>
                <div className="bg-niceRed text-lg font-gotham font-light text-white px-6 py-4 rounded-lg hover:bg-niceRed/90 duration-300 cursor-pointer">DETAY</div>
            </div>
        </div>
    );
}
