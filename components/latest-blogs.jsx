import { BlogPreview } from '@/components/blog-preview'

export function LatestBlogs({ blogs }) {
    blogs = [
  {
    slug: '2025-07-04-test-blog',
    category: 'blog',
    content: 'This is a test blog post. Edited that shi man\r\n',
    data: {
      layout: 'blog',
      title: 'Test Blog',
      date: "2025-07-04T16:10:00.000Z",
      thumbnail: 'https://plus.unsplash.com/premium_photo-1680608155016-3faa9cbdc236?q=80&w=686&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      rating: 3
    }
  },
  {
    slug: '2025-07-04-test-blog',
    category: 'blog',
    content: 'This is a test blog post. Edited that shi man\r\n',
    data: {
      layout: 'blog',
      title: 'Test Blog',
      date: "2025-07-04T16:10:00.000Z",
      thumbnail: 'https://plus.unsplash.com/premium_photo-1680608155016-3faa9cbdc236?q=80&w=686&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      rating: 3
    }
  },
  {
    slug: '2025-07-04-test-blog',
    category: 'blog',
    content: 'This is a test blog post. Edited that shi man\r\n',
    data: {
      layout: 'blog',
      title: 'Test Blog',
      date: "2025-07-04T16:10:00.000Z",
      thumbnail: 'https://plus.unsplash.com/premium_photo-1680608155016-3faa9cbdc236?q=80&w=686&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
      rating: 3
    }
  }
]
    return (
        <div className="min-h-screen bg-gray flex flex-col p-8 gap-2">
            <div className="text-black font-gotham font-light text-4xl">SON YAZILANLAR</div>
            <div className="flex flex-row flex-wrap justify-between w-full gap-8">
                {blogs && blogs.map((blog) => (
                    <BlogPreview key={blog.slug} blog={blog} />
                ))}
            </div>
        </div>
    );
}
