import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const postsBaseDir = path.join(process.cwd(), '_posts');

export function getAllCategories() {
  return fs.readdirSync(postsBaseDir); // ['blog', 'guides', ...]
}

export function getAllPosts(category) {
  const dir = path.join(postsBaseDir, category);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir).map((filename) => {
    const slug = filename.replace(/\.md$/, '');
    const fullPath = path.join(dir, filename);
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);

    return {
      slug,
      category,
      title: data.title || slug,
      date: data.date || null,
      content,
    };
  });
}

export function getPostByCategoryAndSlug(category, slug) {
  const fullPath = path.join(postsBaseDir, category, `${slug}.md`);
  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);

  return {
    slug,
    category,
    title: data.title || slug,
    date: data.date || null,
    content,
  };
}
