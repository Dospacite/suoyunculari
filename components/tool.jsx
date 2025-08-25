export function Tool({ name, image, href }) {
    if (!image) {
        image = "bg-gradient-to-br from-niceRed to-niceBlue";
    } else {
        image = `bg-[url(${image})]`;
    }
    return (
        <div className={`flex flex-1 flex-col items-start justify-end p-8 m-8 ${image} min-w-ws aspect-[16/9]`}>
            <a href={href} className="text-white no-underline font-gotham font-medium text-3xl">{name}</a>
        </div>  
    );
}
