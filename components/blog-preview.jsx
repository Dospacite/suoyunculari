import Image from "next/image";

export function BlogPreview({ blog }) {
    let image;
    if (!blog.data.image) {
        image = <div className="w-full h-auto aspect-[16/9] min-w-xs bg-gradient-to-br from-niceRed to-niceBlue" />;
    } else {
        image = <Image src={blog.data.image} alt={blog.data.title} className="w-full h-auto" />;
    }
    return (
        <div className={`flex flex-1 flex-col items-start justify-end ${image} min-w-ws aspect-[16/9]`}>
            {image}
            <div className="text-black no-underline font-gotham font-medium text-3xl">{blog.data.title}</div>
        </div>  
    );
}
