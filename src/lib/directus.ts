import {
  fallbackAuthors,
  fallbackBlogPosts,
  fallbackHomepageSections,
  fallbackPages,
  fallbackPlays,
} from '@/data/fallback';

const directusUrl = (import.meta.env.PUBLIC_DIRECTUS_URL || 'https://cms.suoyunculari.com').replace(
  /\/$/,
  '',
);

type DirectusList<T> = {
  data?: T[];
};

export type Taxonomy = {
  name: string;
  slug?: string;
  description?: string;
  code?: string;
};

export type Author = {
  name: string;
  slug: string;
  birth_year?: number;
  death_year?: number;
  country?: string;
  bio?: string;
};

export type Play = {
  title: string;
  slug: string;
  original_title?: string;
  summary?: string;
  cover_image?: string | { id: string };
  author?: Author;
  year_written?: number;
  language?: Taxonomy;
  duration_minutes?: number;
  min_cast_size?: number;
  max_cast_size?: number;
  female_roles?: number;
  male_roles?: number;
  neutral_roles?: number;
  genres?: Taxonomy[];
  tags?: Taxonomy[];
  period?: Taxonomy;
  setting?: string;
  themes?: string;
  difficulty?: 'easy' | 'medium' | 'hard' | 'unknown';
  rights_status?:
    | 'unknown'
    | 'public_domain'
    | 'licensed'
    | 'permission_required'
    | 'original_club_work';
  rights_notes?: string;
  script_url?: string;
  is_published?: boolean;
};

export type BlogPost = {
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  cover_image?: string | { id: string };
  author_name?: string;
  published_at?: string;
  is_published?: boolean;
};

export type Page = {
  key: string;
  title?: string;
  content?: string | Record<string, unknown>;
};

export type HomepageSection = {
  section_key: string;
  heading?: string;
  subheading?: string;
  body?: string;
  image?: string | { id: string };
  button_text?: string;
  button_url?: string;
  sort_order?: number;
  is_visible?: boolean;
};

async function fetchItems<T>(collection: string, query: Record<string, string> = {}): Promise<T[]> {
  const params = new URLSearchParams(query);
  const url = `${directusUrl}/items/${collection}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const payload = (await response.json()) as DirectusList<T>;
    return payload.data ?? [];
  } catch {
    return [];
  }
}

function withFallback<T>(items: T[], fallback: T[]): T[] {
  return items.length > 0 ? items : fallback;
}

export function assetUrl(file?: string | { id: string }): string | undefined {
  if (!file) return undefined;
  const id = typeof file === 'string' ? file : file.id;
  return `${directusUrl}/assets/${id}`;
}

export async function getPlays(): Promise<Play[]> {
  const items = await fetchItems<Play>('plays', {
    fields: '*,author.*,language.*,period.*,genres.genres_id.*,tags.tags_id.*,cover_image',
    'filter[is_published][_eq]': 'true',
    sort: 'title',
  });

  return withFallback(items.map(normalizePlay), fallbackPlays);
}

export async function getAuthors(): Promise<Author[]> {
  const items = await fetchItems<Author>('authors', {
    fields: '*',
    sort: 'name',
  });

  return withFallback(items, fallbackAuthors);
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const items = await fetchItems<BlogPost>('blog_posts', {
    fields: '*',
    'filter[is_published][_eq]': 'true',
    sort: '-published_at',
  });

  return withFallback(items, fallbackBlogPosts);
}

export async function getPages(): Promise<Page[]> {
  const items = await fetchItems<Page>('pages', {
    fields: '*',
  });

  return withFallback(items, fallbackPages);
}

export async function getHomepageSections(): Promise<HomepageSection[]> {
  const items = await fetchItems<HomepageSection>('homepage_sections', {
    fields: '*',
    'filter[is_visible][_eq]': 'true',
    sort: 'sort_order',
  });

  return withFallback(items, fallbackHomepageSections);
}

export function getPageByKey(pages: Page[], key: string): Page | undefined {
  return pages.find((page) => page.key === key);
}

export function textContent(content?: string | Record<string, unknown>): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if ('body' in content && typeof content.body === 'string') return content.body;
  return JSON.stringify(content);
}

function normalizePlay(play: Play): Play {
  return {
    ...play,
    genres: normalizeManyToMany(play.genres, 'genres_id'),
    tags: normalizeManyToMany(play.tags, 'tags_id'),
  };
}

function normalizeManyToMany<T extends Taxonomy>(
  value: unknown,
  relationKey: 'genres_id' | 'tags_id',
): T[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (item && typeof item === 'object' && relationKey in item) {
        return (item as Record<string, T>)[relationKey];
      }
      return item as T;
    })
    .filter(Boolean);
}
