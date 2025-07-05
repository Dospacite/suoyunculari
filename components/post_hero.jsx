export function PostHero({ post }) {
    return (
        <div className="relative w-350 h-125 rounded-2xl overflow-hidden border-2 border-gray-800">
            {/* 🔹 Background image layer */}
            <div className="absolute inset-0 flex scale-105">
                {/* Left side – mirrored */}
                <img
                src={post.thumbnail}
                alt=""
                className="w-1/2 h-full object-cover -scale-x-100 blur-md mr-[-10px]"
                />

                {/* Right side – original */}
                <img
                src={post.thumbnail}
                alt=""
                className="w-1/2 h-full object-cover ml-[-10px]"
                />
            </div>

            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent pointer-events-none" />

            {/* 🔹 Foreground content */}
            <div className="relative z-10 w-1/2 text-neutral-200 flex items-end p-16 h-full">
                {post.title && (
                <h2 className="text-4xl font-semibold">{post.title}</h2>
                )}
                {post.description && (
                <h3 className="text-2xl font-semibold">{post.description}</h3>
                )}
            </div>
        </div>
    );
}