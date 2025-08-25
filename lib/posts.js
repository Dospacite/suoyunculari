import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const postsBaseDir = path.join(process.cwd(), '_posts');

export function getAllCategories() {
  return fs.readdirSync(postsBaseDir).filter((f) =>
    fs.statSync(path.join(postsBaseDir, f)).isDirectory()
  );
}

export function getAllPosts() {
  const categories = getAllCategories();

  const allPosts = [];

  for (const category of categories) {
    const categoryDir = path.join(postsBaseDir, category);
    const filenames = fs.readdirSync(categoryDir);

    for (const filename of filenames) {
      const slug = filename.replace(/\.md$/, '');
      const filePath = path.join(categoryDir, filename);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(fileContent);

      allPosts.push({
        slug,
        category,
        content,
        data
      });
    }
  }

  return allPosts;
}

export function getPostByCategoryAndSlug(category, slug) {
  const filePath = path.join(postsBaseDir, category, `${slug}.md`);
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContent);

  return {
    slug,
    category,
    content,
    data
  };
}

// Get Latest Posts
export function getLatestPosts(limit = 5) {
  const allPosts = getAllPosts();
  const sortedPosts = allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return sortedPosts.slice(0, limit);
}

// Get Posts by Categories Filter (multiple categories)
export function getPostsByCategories(categories) {
  const allPosts = getAllPosts();
  return allPosts.filter((post) => categories.includes(post.category));
}
