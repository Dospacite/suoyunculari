import type { Author, BlogPost, HomepageSection, Page, Play, RehearsalIdea } from '@/lib/directus';

export const fallbackAuthors: Author[] = [
  {
    name: 'William Shakespeare',
    slug: 'william-shakespeare',
    birth_year: 1564,
    death_year: 1616,
    country: 'England',
    bio: 'A central reference point for theatre repertories, adaptation work, and ensemble training.',
  },
  {
    name: 'Anton Chekhov',
    slug: 'anton-chekhov',
    birth_year: 1860,
    death_year: 1904,
    country: 'Russia',
    bio: 'Known for precise ensemble drama, subtext, and character-driven rehearsal work.',
  },
];

export const fallbackPlays: Play[] = [
  {
    title: "A Midsummer Night's Dream",
    slug: 'a-midsummer-nights-dream',
    original_title: "A Midsummer Night's Dream",
    summary:
      'A fast, playful ensemble comedy where mistaken identities, rehearsal chaos, and dream logic collide.',
    author: fallbackAuthors[0],
    year_written: 1595,
    duration_minutes: 120,
    min_cast_size: 12,
    max_cast_size: 24,
    genres: [{ name: 'Comedy', slug: 'comedy' }],
    tags: [
      { name: 'Ensemble', slug: 'ensemble' },
      { name: 'Classic', slug: 'classic' },
    ],
    language: { name: 'English', code: 'en' },
    difficulty: 'medium',
    rights_status: 'public_domain',
    is_published: true,
    display_on_home: true,
    home_sort_order: 1,
    event_date: '2026-06-04T19:30:00.000Z',
    event_venue: 'Sabanci Gosteri Merkezi',
  },
  {
    title: 'The Seagull',
    slug: 'the-seagull',
    original_title: 'Chayka',
    summary:
      'A quiet, demanding character study for actors interested in subtext, rhythm, and emotional restraint.',
    author: fallbackAuthors[1],
    year_written: 1895,
    duration_minutes: 135,
    min_cast_size: 10,
    max_cast_size: 14,
    genres: [{ name: 'Drama', slug: 'drama' }],
    tags: [
      { name: 'Realism', slug: 'realism' },
      { name: 'Workshop', slug: 'workshop' },
    ],
    language: { name: 'Russian', code: 'ru' },
    difficulty: 'hard',
    rights_status: 'public_domain',
    is_published: true,
    display_on_home: true,
    home_sort_order: 2,
    event_date: '2026-06-12T20:00:00.000Z',
    event_venue: 'SU Oyunculari Sahnesi',
  },
  {
    title: 'Waiting for Godot',
    slug: 'waiting-for-godot',
    summary:
      'A minimal two-act play built around repetition, silence, timing, and the weight of waiting.',
    author: { name: 'Samuel Beckett', slug: 'samuel-beckett', country: 'Ireland' },
    year_written: 1949,
    duration_minutes: 110,
    min_cast_size: 5,
    max_cast_size: 5,
    genres: [{ name: 'Absurdist', slug: 'absurdist' }],
    tags: [{ name: 'Minimal staging', slug: 'minimal-staging' }],
    language: { name: 'French', code: 'fr' },
    difficulty: 'hard',
    rights_status: 'permission_required',
    is_published: true,
    display_on_home: true,
    home_sort_order: 3,
    event_date: '2026-06-20T19:00:00.000Z',
    event_venue: 'Kampüs Açık Sahne',
  },
];

export const fallbackRehearsalIdeas: RehearsalIdea[] = [
  {
    title: 'Sessiz Sahne Çalışması',
    slug: 'sessiz-sahne-calismasi',
    summary:
      'Oyuncuların yalnızca bakış, mesafe ve ritimle ilişki kurduğu kısa bir odak egzersizi.',
    body: 'İki oyuncu sahnede konuşmadan bir hedef belirler. Üç dakikalık akıştan sonra ekip, ilişkinin nerede değiştiğini ve hangi fiziksel kararların anlam ürettiğini konuşur.',
    tags: ['beden', 'odak', 'ikili çalışma'],
    difficulty: 'easy',
    is_published: true,
  },
  {
    title: 'Alt Metin Değişimi',
    slug: 'alt-metin-degisimi',
    summary:
      'Aynı replikleri farklı niyetlerle oynayarak sahnenin gerilimini ve yönünü keşfetme çalışması.',
    body: 'Kısa bir diyalog seçilir. Her turda oyunculara gizli bir niyet verilir. Metin aynı kalır; tempo, vurgu ve fiziksel mesafe değişir.',
    tags: ['alt metin', 'replik', 'partner'],
    difficulty: 'medium',
    is_published: true,
  },
  {
    title: 'Koro Ritmi',
    slug: 'koro-ritmi',
    summary:
      'Kalabalık sahnelerde ortak tempo, nefes ve yön duygusunu kurmak için toplu prova fikri.',
    body: 'Ekip bir yürüyüş ritmi kurar, ardından tek tek oyuncular bu ritmi bozmadan yeni aksiyonlar ekler. Yönetmen, odak geçişlerini belirler.',
    tags: ['ensemble', 'ritim', 'kalabalık sahne'],
    difficulty: 'hard',
    is_published: true,
  },
];

export const fallbackBlogPosts: BlogPost[] = [
  {
    title: 'Yeni Sezon Hazirliklari',
    slug: 'yeni-sezon-hazirliklari',
    excerpt: 'Kulup provalari, oyun okumalari ve yeni ekip toplantilari icin sezon notlari.',
    body: 'Yeni sezon icin okuma listesi, prova takvimi ve ekip dagilimi Directus uzerinden yayina alinacak.',
    author_name: 'SU Oyunculari',
    published_at: '2026-05-21T00:00:00.000Z',
    is_published: true,
  },
];

export const fallbackPages: Page[] = [
  {
    key: 'about',
    title: 'About',
    content:
      'SU Oyunculari brings students together around rehearsal, play reading, production work, and performance.',
  },
  {
    key: 'contact',
    title: 'Contact',
    content:
      'For rehearsals, auditions, collaborations, and archive updates, reach the club through its official university channels.',
  },
];

export const fallbackHomepageSections: HomepageSection[] = [
  {
    section_key: 'hero',
    heading: 'Sahneye, metne, ekibe.',
    subheading: 'Sabanci University theatre club archive and publishing home.',
    body: 'Find plays, notes, announcements, and production material in one maintained public site.',
    button_text: 'Explore plays',
    button_url: '/plays',
    sort_order: 1,
    is_visible: true,
  },
];
