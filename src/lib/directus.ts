import {
  fallbackAuthors,
  fallbackBlogPosts,
  fallbackHomepageSections,
  fallbackPages,
  fallbackPlays,
  fallbackRehearsalIdeas,
} from '@/data/fallback';

const directusUrl = (import.meta.env.PUBLIC_DIRECTUS_URL || 'https://cms.suoyunculari.com').replace(
  /\/$/,
  '',
);

type DirectusList<T> = {
  data?: T[];
};

const playFields =
  '*,author.*,language.*,period.*,genres.genres_id.*,tags.tags_id.*,cover_image,home_card_image';

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
  display_on_home?: boolean;
  home_sort_order?: number;
  event_date?: string;
  event_venue?: string;
  home_card_image?: string | { id: string };
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

export type RehearsalIdea = {
  title: string;
  slug: string;
  summary?: string;
  body?: string;
  tags?: string | string[] | Taxonomy[];
  difficulty?: 'easy' | 'medium' | 'hard' | 'unknown';
  is_published?: boolean;
  created_at?: string;
  updated_at?: string;
};

async function fetchItems<T>(
  collection: string,
  query: Record<string, string> = {},
): Promise<T[] | null> {
  const params = new URLSearchParams(query);
  const url = `${directusUrl}/items/${collection}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as DirectusList<T>;
    return payload.data ?? [];
  } catch {
    return null;
  }
}

export function assetUrl(file?: string | { id: string }): string | undefined {
  if (!file) return undefined;
  const id = typeof file === 'string' ? file : file.id;
  return `${directusUrl}/assets/${id}`;
}

export async function getPlays(): Promise<Play[]> {
  const items = await fetchItems<Play>('plays', {
    fields: playFields,
    'filter[is_published][_eq]': 'true',
    sort: 'title',
  });

  return items ? items.map(normalizePlay) : fallbackPlays;
}

export async function getPlayBySlug(slug: string): Promise<Play | undefined> {
  const items = await fetchItems<Play>('plays', {
    fields: playFields,
    'filter[slug][_eq]': slug,
    'filter[is_published][_eq]': 'true',
    limit: '1',
  });

  return items ? items.map(normalizePlay)[0] : fallbackPlays.find((play) => play.slug === slug);
}

export async function getHomePlays(): Promise<Play[]> {
  const items = await fetchItems<Play>('plays', {
    fields: playFields,
    'filter[is_published][_eq]': 'true',
    'filter[display_on_home][_eq]': 'true',
    sort: 'home_sort_order,event_date,title',
  });

  return items
    ? items.map(normalizePlay)
    : fallbackPlays.filter((play) => play.display_on_home);
}

export async function getAuthors(): Promise<Author[]> {
  const items = await fetchItems<Author>('authors', {
    fields: '*',
    sort: 'name',
  });

  return items ?? fallbackAuthors;
}

export async function getAuthorBySlug(slug: string): Promise<Author | undefined> {
  const items = await fetchItems<Author>('authors', {
    fields: '*',
    'filter[slug][_eq]': slug,
    limit: '1',
  });

  return items ? items[0] : fallbackAuthors.find((author) => author.slug === slug);
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const items = await fetchItems<BlogPost>('blog_posts', {
    fields: '*',
    'filter[is_published][_eq]': 'true',
    sort: '-published_at',
  });

  return items ?? fallbackBlogPosts;
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const items = await fetchItems<BlogPost>('blog_posts', {
    fields: '*',
    'filter[slug][_eq]': slug,
    'filter[is_published][_eq]': 'true',
    limit: '1',
  });

  return items ? items[0] : fallbackBlogPosts.find((post) => post.slug === slug);
}

export async function getPages(): Promise<Page[]> {
  const items = await fetchItems<Page>('pages', {
    fields: '*',
  });

  return items ?? fallbackPages;
}

export async function getHomepageSections(): Promise<HomepageSection[]> {
  const items = await fetchItems<HomepageSection>('homepage_sections', {
    fields: '*',
    'filter[is_visible][_eq]': 'true',
    sort: 'sort_order',
  });

  return items ?? fallbackHomepageSections;
}

export async function getRehearsalIdeas(): Promise<RehearsalIdea[]> {
  const items = await fetchItems<RehearsalIdea>('rehearsal_ideas', {
    fields: '*',
    'filter[is_published][_eq]': 'true',
    sort: 'title',
  });

  return items ? items.map(normalizeRehearsalIdea) : fallbackRehearsalIdeas;
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

function normalizeRehearsalIdea(idea: RehearsalIdea): RehearsalIdea {
  return {
    ...idea,
    tags: normalizeTags(idea.tags),
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

function normalizeTags(value: RehearsalIdea['tags']): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        return item?.name;
      })
      .filter(Boolean) as string[];
  }

  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
