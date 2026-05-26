import {
  fallbackAuthors,
  fallbackBlogPosts,
  fallbackBooks,
  fallbackClubResources,
  fallbackHomepageSections,
  fallbackPages,
  fallbackPlays,
  fallbackContactItems,
  fallbackRehearsalIdeas,
  fallbackStagings,
} from '@/data/fallback';

const directusUrl = (import.meta.env.PUBLIC_DIRECTUS_URL || 'https://cms.suoyunculari.com').replace(
  /\/$/,
  '',
);

type DirectusList<T> = {
  data?: T[];
};

const playFields =
  '*,author.*,language.*,period.*,genres.genres_id.*,tags.tags_id.*,cover_image,poster_image,home_card_image';
const stagingFields = '*,play.*,cover_image,photos.*,photos.image';
const blogPostFields =
  '*,cover_image,related_plays.plays_id.*,related_plays.plays_id.author.*,related_plays.plays_id.genres.genres_id.*,related_plays.plays_id.tags.tags_id.*,related_plays.plays_id.tags.tags_id.category.*,related_books.books_id.*,related_books.books_id.category_ref.*,related_books.books_id.tag_refs.tags_id.*,related_books.books_id.tag_refs.tags_id.category.*,related_blog_posts.related_blog_posts_id.*,related_rehearsal_ideas.rehearsal_ideas_id.*,text_bank_references.*';
const bookFields = '*,cover_image,category_ref.*,tag_refs.tags_id.*,tag_refs.tags_id.category.*';

export type Taxonomy = {
  name: string;
  slug?: string;
  description?: string;
  code?: string;
  scope?: TagScope;
  category?: TagCategory;
};

export type TagScope = 'plays' | 'books' | 'rehearsal_ideas' | 'blog_posts' | 'global';

export type TagCategory = {
  name: string;
  slug?: string;
  scope?: TagScope;
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
  short_description?: string;
  cover_image?: string | { id: string };
  poster_image?: string | { id: string };
  author?: Author;
  year_written?: number;
  language?: Taxonomy;
  duration_minutes?: number;
  cast?: string;
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
  is_newcomer_play?: boolean;
  home_sort_order?: number;
  event_date?: string;
  event_venue?: string;
  home_card_image?: string | { id: string };
  text_bank_source?: string;
  text_bank_source_id?: string;
  text_bank_source_url?: string;
  text_bank_reference?: TextBankReference;
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
  related_plays?: Play[];
  related_books?: Book[];
  related_blog_posts?: BlogPost[];
  related_rehearsal_ideas?: RehearsalIdea[];
  text_bank_references?: TextBankReference[];
};

export type BookCategory = {
  name: string;
  slug?: string;
  description?: string;
};

export type Book = {
  title: string;
  slug: string;
  author?: string;
  translator?: string;
  publisher?: string;
  publication_year?: number;
  category?: string;
  category_ref?: BookCategory;
  language?: string;
  location?: string;
  notes?: string;
  tags?: string | string[] | Taxonomy[];
  tag_refs?: Taxonomy[];
  cover_image?: string | { id: string };
  is_available?: boolean;
  is_published?: boolean;
};

export type TextBankReference = {
  source?: string;
  source_id?: string;
  title?: string;
  source_url?: string;
};

export type StagingPhoto = {
  image?: string | { id: string };
  caption?: string;
  alt_text?: string;
  sort_order?: number;
};

export type Staging = {
  title: string;
  slug: string;
  play?: Play;
  date?: string;
  venue?: string;
  summary?: string;
  body?: string;
  director?: string;
  cast_notes?: string;
  production_notes?: string;
  ticket_url?: string;
  video_url?: string;
  cover_image?: string | { id: string };
  photos?: StagingPhoto[];
  sort_order?: number;
  is_published?: boolean;
};

export type Page = {
  key: string;
  title?: string;
  content?: string | Record<string, unknown>;
};

export type ContactItem = {
  label: string;
  value: string;
  type?: 'email' | 'phone' | 'address' | 'map' | 'instagram' | 'youtube' | 'tiktok' | 'website' | 'other';
  href?: string;
  sort_order?: number;
  is_visible?: boolean;
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

export type ClubResource = {
  title: string;
  slug: string;
  resource_type?: 'logo' | 'color' | 'link' | 'image' | 'file' | 'other';
  description?: string;
  value?: string;
  href?: string;
  color_value?: string;
  file?: string | { id: string };
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
    sort: '-event_date,title',
  });

  return sortPlaysChronologically(items ? items.map(normalizePlay) : fallbackPlays);
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

export async function getStagingsForPlay(playSlug: string, play?: Play): Promise<Staging[]> {
  const items = await fetchItems<Staging>('stagings', {
    fields: stagingFields,
    'filter[play][slug][_eq]': playSlug,
    'filter[is_published][_eq]': 'true',
    sort: 'date,sort_order,title',
  });

  const stagings = items ? items.map(normalizeStaging) : fallbackStagings.filter((item) => item.play?.slug === playSlug);
  if (stagings.length > 0) return stagings;

  return play ? legacyStagingFromPlay(play) : [];
}

export async function getStagingBySlug(
  playSlug: string,
  stagingSlug: string,
): Promise<Staging | undefined> {
  const items = await fetchItems<Staging>('stagings', {
    fields: stagingFields,
    'filter[play][slug][_eq]': playSlug,
    'filter[slug][_eq]': stagingSlug,
    'filter[is_published][_eq]': 'true',
    limit: '1',
  });

  if (items) return items.map(normalizeStaging)[0];
  return fallbackStagings.find((item) => item.play?.slug === playSlug && item.slug === stagingSlug);
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
    fields: blogPostFields,
    'filter[is_published][_eq]': 'true',
    sort: '-published_at',
  });

  return items ? items.map(normalizeBlogPost) : fallbackBlogPosts;
}

export async function getBooks(): Promise<Book[]> {
  const items = await fetchItems<Book>('books', {
    fields: bookFields,
    'filter[is_published][_eq]': 'true',
    sort: 'title',
  });

  return items ? items.map(normalizeBook) : fallbackBooks;
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const items = await fetchItems<BlogPost>('blog_posts', {
    fields: blogPostFields,
    'filter[slug][_eq]': slug,
    'filter[is_published][_eq]': 'true',
    limit: '1',
  });

  return items ? items.map(normalizeBlogPost)[0] : fallbackBlogPosts.find((post) => post.slug === slug);
}

export async function getRelatedBlogPostsForPlay(playSlug: string): Promise<BlogPost[]> {
  const posts = await getBlogPosts();
  return posts.filter((post) => post.related_plays?.some((play) => play.slug === playSlug));
}

export async function getRelatedBlogPostsForBook(bookSlug: string): Promise<BlogPost[]> {
  const posts = await getBlogPosts();
  return posts.filter((post) => post.related_books?.some((book) => book.slug === bookSlug));
}

export async function getRelatedBlogPostsForBlog(blogSlug: string): Promise<BlogPost[]> {
  const posts = await getBlogPosts();
  return posts.filter((post) => post.related_blog_posts?.some((blog) => blog.slug === blogSlug));
}

export async function getRelatedBlogPostsForRehearsalIdea(ideaSlug: string): Promise<BlogPost[]> {
  const posts = await getBlogPosts();
  return posts.filter((post) =>
    post.related_rehearsal_ideas?.some((idea) => idea.slug === ideaSlug),
  );
}

export async function getRelatedBlogPostsForTextBank(
  source?: string,
  sourceId?: string,
): Promise<BlogPost[]> {
  if (!source || !sourceId) return [];

  const posts = await getBlogPosts();
  return posts.filter((post) =>
    post.text_bank_references?.some(
      (reference) => reference.source === source && reference.source_id === sourceId,
    ),
  );
}

export async function getPlayedTextBankReferences(): Promise<
  Array<TextBankReference & { play_slug: string; play_title: string }>
> {
  const plays = await getPlays();
  const references: Array<TextBankReference & { play_slug: string; play_title: string }> = [];

  for (const play of plays) {
    const reference = getTextBankReference(play);
    if (!reference) continue;

    references.push({
      ...reference,
      title: play.title,
      play_slug: play.slug,
      play_title: play.title,
    });
  }

  return references;
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

export async function getContactItems(): Promise<ContactItem[]> {
  const items = await fetchItems<ContactItem>('contact_items', {
    fields: '*',
    'filter[is_visible][_eq]': 'true',
    sort: 'sort_order,label',
  });

  return items && items.length > 0 ? items : fallbackContactItems;
}

export async function getClubResources(): Promise<ClubResource[]> {
  const items = await fetchItems<ClubResource>('club_resources', {
    fields: '*',
    'filter[is_visible][_eq]': 'true',
    sort: 'sort_order,title',
  });

  return items && items.length > 0 ? items : fallbackClubResources;
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

export function getTextBankReference(play?: Pick<Play, 'text_bank_source' | 'text_bank_source_id' | 'text_bank_source_url'>): TextBankReference | undefined {
  if (!play?.text_bank_source_id && !play?.text_bank_source_url) return undefined;

  const parsed = parseTextBankSourceId(play.text_bank_source_id);
  const source = normalizeTextBankSource(play.text_bank_source) || parsed?.source;
  const sourceId = parsed?.source_id || normalizeSourceId(play.text_bank_source_id);
  const sourceUrl = parsed?.source_url || play.text_bank_source_url || inferTextBankSourceUrl(source, sourceId);

  if (!source || !sourceId) return undefined;

  return {
    source,
    source_id: sourceId,
    source_url: sourceUrl,
  };
}

function normalizePlay(play: Play): Play {
  return {
    ...play,
    genres: normalizeManyToMany(play.genres, 'genres_id'),
    tags: normalizeScopedTaxonomies(normalizeManyToMany<Taxonomy>(play.tags, 'tags_id'), [
      'plays',
      'global',
    ]),
    text_bank_reference: getTextBankReference(play),
  };
}

function normalizeBlogPost(post: BlogPost): BlogPost {
  return {
    ...post,
    related_plays: normalizeManyToMany<Play>(post.related_plays, 'plays_id').map(normalizePlay),
    related_books: normalizeManyToMany<Book>(post.related_books, 'books_id').map(normalizeBook),
    related_blog_posts: normalizeManyToMany<BlogPost>(
      post.related_blog_posts,
      'related_blog_posts_id',
    ),
    related_rehearsal_ideas: normalizeManyToMany<RehearsalIdea>(
      post.related_rehearsal_ideas,
      'rehearsal_ideas_id',
    ).map(normalizeRehearsalIdea),
    text_bank_references: normalizeTextBankReferences(post.text_bank_references),
  };
}

function normalizeBook(book: Book): Book {
  const relationTags = normalizeScopedTaxonomies(normalizeManyToMany<Taxonomy>(book.tag_refs, 'tags_id'), [
    'books',
    'global',
  ]);
  const legacyTags = normalizeStringTags(book.tags).map((name) => ({ name }));

  return {
    ...book,
    category: book.category_ref?.name || book.category,
    tag_refs: relationTags,
    tags: relationTags.length > 0 ? relationTags : legacyTags,
  };
}

function normalizeStaging(staging: Staging): Staging {
  return {
    ...staging,
    play: staging.play ? normalizePlay(staging.play) : undefined,
    photos: normalizeStagingPhotos(staging.photos),
  };
}

function sortPlaysChronologically(plays: Play[]): Play[] {
  return [...plays].sort((first, second) => {
    const firstTime = first.event_date ? new Date(first.event_date).getTime() : Number.NEGATIVE_INFINITY;
    const secondTime = second.event_date ? new Date(second.event_date).getTime() : Number.NEGATIVE_INFINITY;
    if (Number.isFinite(firstTime) && Number.isFinite(secondTime) && firstTime !== secondTime) {
      return secondTime - firstTime;
    }
    if (Number.isFinite(firstTime) !== Number.isFinite(secondTime)) {
      return Number.isFinite(secondTime) ? 1 : -1;
    }
    return first.title.localeCompare(second.title, 'tr');
  });
}

function normalizeRehearsalIdea(idea: RehearsalIdea): RehearsalIdea {
  return {
    ...idea,
    tags: normalizeScopedTaxonomies(normalizeTags(idea.tags), ['rehearsal_ideas', 'global']),
  };
}

function normalizeManyToMany<T extends object>(
  value: unknown,
  relationKey:
    | 'genres_id'
    | 'tags_id'
    | 'plays_id'
    | 'books_id'
    | 'related_blog_posts_id'
    | 'rehearsal_ideas_id',
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

function normalizeStringTags(value: Book['tags']): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((tag) => (typeof tag === 'string' ? tag : tag.name))
      .map((tag) => String(tag || '').trim())
      .filter(Boolean);
  }

  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeTextBankReferences(value: unknown): TextBankReference[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const reference = item as TextBankReference;
      return reference.source && reference.source_id ? reference : null;
    })
    .filter(Boolean) as TextBankReference[];
}

function parseTextBankSourceId(value?: string): TextBankReference | undefined {
  const cleaned = value?.trim();
  if (!cleaned) return undefined;

  if (/^https?:\/\//i.test(cleaned)) return parseTextBankUrl(cleaned);

  const prefixed = cleaned.match(/^([a-z_ -]+):(.*)$/i);
  if (prefixed) {
    const source = normalizeTextBankSource(prefixed[1]);
    const sourceId = prefixed[2]?.trim();
    if (source && sourceId) {
      return {
        source,
        source_id: sourceId,
        source_url: inferTextBankSourceUrl(source, sourceId),
      };
    }
  }

  if (/^\d+$/.test(cleaned)) {
    return {
      source: 'concord_theatricals',
      source_id: cleaned,
      source_url: inferTextBankSourceUrl('concord_theatricals', cleaned),
    };
  }

  return undefined;
}

function parseTextBankUrl(value: string): TextBankReference | undefined {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, '');

    if (hostname === 'concordtheatricals.com') {
      const sourceId = url.pathname.match(/\/p\/([^/]+)/)?.[1];
      return sourceId
        ? {
            source: 'concord_theatricals',
            source_id: sourceId,
            source_url: value,
          }
        : undefined;
    }

    if (hostname === 'dramaonlinelibrary.com') {
      const sourceId = url.searchParams.get('tocid') || url.searchParams.get('docid') || undefined;
      return sourceId
        ? {
            source: 'drama_online_library',
            source_id: sourceId,
            source_url: value,
          }
        : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function normalizeTextBankSource(value?: string): string | undefined {
  const cleaned = value?.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (!cleaned) return undefined;
  if (cleaned === 'concord' || cleaned === 'concord_theatricals') return 'concord_theatricals';
  if (cleaned === 'drama' || cleaned === 'drama_online' || cleaned === 'drama_online_library') {
    return 'drama_online_library';
  }
  return undefined;
}

function normalizeSourceId(value?: string): string | undefined {
  const cleaned = value?.trim();
  if (!cleaned || /^https?:\/\//i.test(cleaned) || /^([a-z_ -]+):(.*)$/i.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function inferTextBankSourceUrl(source?: string, sourceId?: string): string | undefined {
  if (!source || !sourceId) return undefined;
  if (source === 'concord_theatricals') return `https://www.concordtheatricals.com/p/${sourceId}`;
  return undefined;
}

function normalizeStagingPhotos(value: unknown): StagingPhoto[] {
  if (!Array.isArray(value)) return [];

  const photos = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      return item as StagingPhoto;
    })
    .filter((item): item is StagingPhoto => Boolean(item));

  return photos.sort((first, second) => (first.sort_order ?? 0) - (second.sort_order ?? 0));
}

function legacyStagingFromPlay(play: Play): Staging[] {
  if (!play.event_date && !play.event_venue) return [];

  return [
    {
      title: play.title,
      slug: 'ana-sahneleme',
      play,
      date: play.event_date,
      venue: play.event_venue,
      summary: play.summary,
      cover_image: play.home_card_image || play.cover_image,
      is_published: true,
    },
  ];
}

function normalizeTags(value: RehearsalIdea['tags']): Taxonomy[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return { name: item };
        return item;
      })
      .filter(Boolean) as Taxonomy[];
  }

  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function normalizeScopedTaxonomies(items: Taxonomy[], allowedScopes: TagScope[]): Taxonomy[] {
  return items.filter((item) => {
    const scope = item.category?.scope || item.scope;
    return !scope || allowedScopes.includes(scope);
  });
}
