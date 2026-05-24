import type {
  Author,
  BlogPost,
  Book,
  ContactItem,
  HomepageSection,
  Page,
  Play,
  RehearsalIdea,
  Staging,
} from '@/lib/directus';

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
    cast: 'Kadro bilgisi Directus oyun kaydından yönetilir.',
    min_cast_size: 12,
    max_cast_size: 24,
    genres: [{ name: 'Comedy', slug: 'comedy' }],
    tags: [
      { name: 'Ensemble', slug: 'ensemble' },
      { name: 'Classic', slug: 'classic' },
    ],
    language: { name: 'English', code: 'en' },
    rights_status: 'public_domain',
    is_published: true,
    display_on_home: true,
    home_sort_order: 1,
    event_date: '2026-06-04T19:30:00.000Z',
    event_venue: 'Sabancı Gösteri Merkezi',
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
    cast: 'Kadro bilgisi Directus oyun kaydından yönetilir.',
    min_cast_size: 10,
    max_cast_size: 14,
    genres: [{ name: 'Drama', slug: 'drama' }],
    tags: [
      { name: 'Realism', slug: 'realism' },
      { name: 'Workshop', slug: 'workshop' },
    ],
    language: { name: 'Russian', code: 'ru' },
    rights_status: 'public_domain',
    is_published: true,
    display_on_home: true,
    home_sort_order: 2,
    event_date: '2026-06-12T20:00:00.000Z',
    event_venue: 'SUOyuncuları Sahnesi',
  },
  {
    title: 'Waiting for Godot',
    slug: 'waiting-for-godot',
    summary:
      'A minimal two-act play built around repetition, silence, timing, and the weight of waiting.',
    author: { name: 'Samuel Beckett', slug: 'samuel-beckett', country: 'Ireland' },
    year_written: 1949,
    duration_minutes: 110,
    cast: 'Kadro bilgisi Directus oyun kaydından yönetilir.',
    min_cast_size: 5,
    max_cast_size: 5,
    genres: [{ name: 'Absurdist', slug: 'absurdist' }],
    tags: [{ name: 'Minimal staging', slug: 'minimal-staging' }],
    language: { name: 'French', code: 'fr' },
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

export const fallbackBooks: Book[] = [
  {
    title: 'Boş Mekan',
    slug: 'bos-mekan',
    author: 'Peter Brook',
    translator: 'Ülker İnce',
    publisher: 'Afa Yayınları',
    publication_year: 1990,
    category: 'Tiyatro Kuramı',
    language: 'Türkçe',
    location: 'Kulüp Kitaplığı',
    notes: 'Sahne, oyunculuk ve seyirci ilişkisi üzerine temel bir tiyatro kitabı.',
    tags: ['kuram', 'sahneleme', 'okuma listesi'],
    is_available: true,
    is_published: true,
  },
  {
    title: 'Bir Aktör Hazırlanıyor',
    slug: 'bir-aktor-hazirlaniyor',
    author: 'Konstantin Stanislavski',
    publisher: 'Mitos-Boyut',
    category: 'Oyunculuk',
    language: 'Türkçe',
    location: 'Kulüp Kitaplığı',
    notes: 'Oyunculuk çalışmaları ve prova süreçleri için başvuru kitabı.',
    tags: ['oyunculuk', 'prova', 'metot'],
    is_available: true,
    is_published: true,
  },
];

export const fallbackStagings: Staging[] = [
  {
    title: 'Sabancı Gösteri Merkezi',
    slug: 'sabanci-gosteri-merkezi',
    play: fallbackPlays[0],
    date: '2026-06-04T19:30:00.000Z',
    venue: 'Sabancı Gösteri Merkezi',
    summary: 'Kampüs sezonu için ana sahne gösterimi.',
    director: 'SUOyuncuları',
    production_notes: 'Prova, afiş, fotoğraf ve bilet bilgileri Directus sahneleme kaydından yönetilir.',
    is_published: true,
    sort_order: 1,
  },
  {
    title: 'SUOyuncuları Sahnesi',
    slug: 'su-oyunculari-sahnesi',
    play: fallbackPlays[1],
    date: '2026-06-12T20:00:00.000Z',
    venue: 'SUOyuncuları Sahnesi',
    summary: 'Atölye odaklı sezon gösterimi.',
    director: 'SUOyuncuları',
    production_notes: 'Fotoğraflar ve ayrıntılı sahneleme notları Directus üzerinden eklenebilir.',
    is_published: true,
    sort_order: 1,
  },
];

export const fallbackBlogPosts: BlogPost[] = [
  {
    title: 'Yeni Sezon Hazırlıkları',
    slug: 'yeni-sezon-hazirliklari',
    excerpt: 'Kulüp provaları, oyun okumaları ve yeni ekip toplantıları için sezon notları.',
    body: 'Yeni sezon için okuma listesi, prova takvimi ve ekip dağılımı Directus üzerinden yayına alınacak.',
    author_name: 'SUOyuncuları',
    published_at: '2026-05-21T00:00:00.000Z',
    is_published: true,
  },
];

export const fallbackPages: Page[] = [
  {
    key: 'about',
    title: 'Hakkımızda',
    content:
      'SUOyuncuları, Sabancı Üniversitesi Tiyatro Kulübü olarak tiyatroya ilgi duyan öğrencileri oyun okuma, sahneleme, atölye, prova ve ekip üretimi etrafında bir araya getirir. Kulüp, üyelerine oyunculuk, yönetmenlik, dramaturji, dekor, ışık, ses, kostüm ve organizasyon alanlarında deneyim kazanabilecekleri üretim ortamı sunar.',
  },
  {
    key: 'contact',
    title: 'İletişim',
    content: 'Prova, gösterim, iş birliği ve arşiv soruları için bize ulaşabilirsiniz.',
  },
];

export const fallbackContactItems: ContactItem[] = [
  {
    label: 'E-posta',
    value: 'contact@suoyunculari.com',
    type: 'email',
    href: 'mailto:contact@suoyunculari.com',
    sort_order: 1,
    is_visible: true,
  },
  {
    label: 'Adres',
    value: 'Sabancı Üniversitesi, Orta Mahalle, Üniversite Caddesi No:27, 34956 Tuzla/İstanbul',
    type: 'address',
    href: 'https://www.google.com/maps/search/?api=1&query=Sabanc%C4%B1%20G%C3%B6steri%20Merkezi',
    sort_order: 2,
    is_visible: true,
  },
  {
    label: 'Instagram',
    value: '@suoyunculari',
    type: 'instagram',
    href: 'https://www.instagram.com/suoyunculari/',
    sort_order: 3,
    is_visible: true,
  },
  {
    label: 'YouTube',
    value: '@suo-yunculari',
    type: 'youtube',
    href: 'https://www.youtube.com/@suo-yunculari',
    sort_order: 4,
    is_visible: true,
  },
  {
    label: 'TikTok',
    value: '@suoyuncularii',
    type: 'tiktok',
    href: 'https://www.tiktok.com/@suoyuncularii',
    sort_order: 5,
    is_visible: true,
  },
];

export const fallbackHomepageSections: HomepageSection[] = [
  {
    section_key: 'hero',
    heading: 'Sahneye, metne, ekibe.',
    subheading: 'Sabancı University theatre club archive and publishing home.',
    body: 'Find plays, notes, announcements, and production material in one maintained public site.',
    button_text: 'Explore plays',
    button_url: '/plays',
    sort_order: 1,
    is_visible: true,
  },
];
