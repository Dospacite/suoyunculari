#!/usr/bin/env node

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error('Set DIRECTUS_URL and DIRECTUS_TOKEN before running this script.');
  process.exit(1);
}

const collectionDefinitions = [
  { collection: 'authors', icon: 'person', display: '{{name}}' },
  { collection: 'genres', icon: 'category', display: '{{name}}' },
  { collection: 'tags', icon: 'sell', display: '{{name}}' },
  { collection: 'languages', icon: 'translate', display: '{{name}}' },
  { collection: 'periods', icon: 'history_edu', display: '{{name}}' },
  { collection: 'plays', icon: 'theater_comedy', display: '{{title}}' },
  { collection: 'stagings', icon: 'event_seat', display: '{{title}}' },
  { collection: 'books', icon: 'local_library', display: '{{title}}' },
  { collection: 'rehearsal_ideas', icon: 'edit_note', display: '{{title}}' },
  { collection: 'blog_posts', icon: 'article', display: '{{title}}' },
  { collection: 'pages', icon: 'web', display: '{{key}}' },
  { collection: 'homepage_sections', icon: 'view_agenda', display: '{{section_key}}' },
  { collection: 'contact_items', icon: 'contact_mail', display: '{{label}}' },
  { collection: 'plays_genres', icon: 'link', hidden: true },
  { collection: 'plays_tags', icon: 'link', hidden: true },
  { collection: 'blog_posts_plays', icon: 'link', hidden: true },
  { collection: 'blog_posts_books', icon: 'link', hidden: true },
  { collection: 'blog_posts_text_bank_references', icon: 'link', display: '{{title}}' },
  { collection: 'staging_photos', icon: 'photo_library', display: '{{caption}}' },
];

const fields = {
  authors: [
    stringField('name', { required: true, width: 'full' }),
    stringField('slug', { required: true, unique: true }),
    integerField('birth_year'),
    integerField('death_year'),
    stringField('country'),
    textField('bio'),
  ],
  genres: [
    stringField('name', { required: true }),
    stringField('slug', { required: true, unique: true }),
    textField('description'),
  ],
  tags: [
    stringField('name', { required: true }),
    stringField('slug', { required: true, unique: true }),
  ],
  languages: [
    stringField('name', { required: true }),
    stringField('code', { required: true, unique: true, maxLength: 16 }),
  ],
  periods: [
    stringField('name', { required: true }),
    stringField('slug', { required: true, unique: true }),
    textField('description'),
  ],
  plays: [
    stringField('title', { required: true, width: 'full' }),
    stringField('slug', { required: true, unique: true }),
    stringField('original_title'),
    textField('summary', { interfaceName: 'input-rich-text-md' }),
    textField('short_description', { interfaceName: 'input-rich-text-md' }),
    fileField('cover_image'),
    fileField('poster_image', {
      note: 'A3 portrait poster used on play detail pages. This is separate from cover and home card images.',
    }),
    m2oField('author'),
    integerField('year_written'),
    m2oField('language'),
    integerField('duration_minutes'),
    textField('cast', { width: 'full' }),
    integerField('min_cast_size'),
    integerField('max_cast_size'),
    integerField('female_roles'),
    integerField('male_roles'),
    integerField('neutral_roles'),
    aliasM2mField('genres'),
    aliasM2mField('tags'),
    m2oField('period'),
    textField('setting'),
    textField('themes'),
    selectField(
      'rights_status',
      ['unknown', 'public_domain', 'licensed', 'permission_required', 'original_club_work'],
      'unknown',
    ),
    textField('rights_notes'),
    fileField('script_file'),
    stringField('script_url', { maxLength: 1024 }),
    booleanField('is_published', false),
    booleanField('display_on_home', false),
    booleanField('is_newcomer_play', false),
    integerField('home_sort_order'),
    dateTimeField('event_date'),
    stringField('event_venue'),
    fileField('home_card_image'),
    stringField('text_bank_source'),
    stringField('text_bank_source_id'),
    stringField('text_bank_source_url', { maxLength: 1024, width: 'full' }),
    aliasO2mField('stagings'),
  ],
  stagings: [
    stringField('title', { required: true, width: 'full' }),
    stringField('slug', { required: true }),
    m2oField('play'),
    dateTimeField('date'),
    stringField('venue'),
    textField('summary', { interfaceName: 'input-rich-text-md' }),
    textField('body', { interfaceName: 'input-rich-text-md' }),
    stringField('director'),
    textField('cast_notes'),
    textField('production_notes', { interfaceName: 'input-rich-text-md' }),
    stringField('ticket_url', { maxLength: 1024, width: 'full' }),
    stringField('video_url', { maxLength: 1024, width: 'full' }),
    fileField('cover_image'),
    aliasO2mField('photos'),
    integerField('sort_order'),
    booleanField('is_published', false),
  ],
  books: [
    stringField('title', { required: true, width: 'full' }),
    stringField('slug', { required: true, unique: true }),
    stringField('author'),
    stringField('translator'),
    stringField('publisher'),
    integerField('publication_year'),
    stringField('category'),
    stringField('language'),
    stringField('location'),
    textField('notes', { interfaceName: 'input-rich-text-md' }),
    textField('tags'),
    fileField('cover_image'),
    booleanField('is_available', true),
    booleanField('is_published', false),
  ],
  rehearsal_ideas: [
    stringField('title', { required: true, width: 'full' }),
    stringField('slug', { required: true, unique: true }),
    textField('summary'),
    textField('body', { interfaceName: 'input-rich-text-md' }),
    textField('tags'),
    selectField('difficulty', ['easy', 'medium', 'hard', 'unknown'], 'unknown'),
    booleanField('is_published', false),
    dateTimeField('created_at'),
    dateTimeField('updated_at'),
  ],
  blog_posts: [
    stringField('title', { required: true, width: 'full' }),
    stringField('slug', { required: true, unique: true }),
    textField('excerpt'),
    textField('body', { interfaceName: 'input-rich-text-md' }),
    fileField('cover_image'),
    stringField('author_name'),
    dateTimeField('published_at'),
    aliasM2mField('related_plays'),
    aliasM2mField('related_books'),
    aliasO2mField('text_bank_references'),
    booleanField('is_published', false),
  ],
  pages: [
    stringField('key', { required: true, unique: true }),
    stringField('title'),
    textField('content', { interfaceName: 'input-rich-text-md' }),
  ],
  homepage_sections: [
    stringField('section_key', { required: true }),
    stringField('heading'),
    stringField('subheading'),
    textField('body'),
    fileField('image'),
    stringField('button_text'),
    stringField('button_url', { maxLength: 1024 }),
    integerField('sort_order'),
    booleanField('is_visible', true),
  ],
  contact_items: [
    stringField('label', { required: true }),
    stringField('value', { required: true, width: 'full' }),
    selectField('type', ['email', 'phone', 'address', 'map', 'instagram', 'youtube', 'tiktok', 'website', 'other'], 'other'),
    stringField('href', { maxLength: 1024, width: 'full' }),
    integerField('sort_order'),
    booleanField('is_visible', true),
  ],
  plays_genres: [m2oField('plays_id'), m2oField('genres_id')],
  plays_tags: [m2oField('plays_id'), m2oField('tags_id')],
  blog_posts_plays: [m2oField('blog_posts_id'), m2oField('plays_id')],
  blog_posts_books: [m2oField('blog_posts_id'), m2oField('books_id')],
  blog_posts_text_bank_references: [
    m2oField('blog_posts_id'),
    stringField('source', { required: true }),
    stringField('source_id', { required: true }),
    stringField('title', { required: true, width: 'full' }),
    stringField('source_url', { maxLength: 1024, width: 'full' }),
  ],
  staging_photos: [
    m2oField('staging'),
    fileField('image'),
    stringField('caption', { width: 'full' }),
    stringField('alt_text', { width: 'full' }),
    integerField('sort_order'),
  ],
};

const relations = [
  relation('plays', 'author', 'authors'),
  relation('plays', 'language', 'languages'),
  relation('plays', 'period', 'periods'),
  relation('plays', 'cover_image', 'directus_files'),
  relation('plays', 'poster_image', 'directus_files'),
  relation('plays', 'script_file', 'directus_files'),
  relation('plays', 'home_card_image', 'directus_files'),
  relation('stagings', 'play', 'plays', {
    one_field: 'stagings',
    one_deselect_action: 'nullify',
  }),
  relation('stagings', 'cover_image', 'directus_files'),
  relation('books', 'cover_image', 'directus_files'),
  relation('blog_posts', 'cover_image', 'directus_files'),
  relation('homepage_sections', 'image', 'directus_files'),
  relation('plays_genres', 'plays_id', 'plays', {
    one_field: 'genres',
    junction_field: 'genres_id',
    one_deselect_action: 'delete',
  }),
  relation('plays_genres', 'genres_id', 'genres'),
  relation('plays_tags', 'plays_id', 'plays', {
    one_field: 'tags',
    junction_field: 'tags_id',
    one_deselect_action: 'delete',
  }),
  relation('plays_tags', 'tags_id', 'tags'),
  relation('blog_posts_plays', 'blog_posts_id', 'blog_posts', {
    one_field: 'related_plays',
    junction_field: 'plays_id',
    one_deselect_action: 'delete',
  }),
  relation('blog_posts_plays', 'plays_id', 'plays'),
  relation('blog_posts_books', 'blog_posts_id', 'blog_posts', {
    one_field: 'related_books',
    junction_field: 'books_id',
    one_deselect_action: 'delete',
  }),
  relation('blog_posts_books', 'books_id', 'books'),
  relation('blog_posts_text_bank_references', 'blog_posts_id', 'blog_posts', {
    one_field: 'text_bank_references',
    one_deselect_action: 'delete',
  }),
  relation('staging_photos', 'staging', 'stagings', {
    one_field: 'photos',
    one_deselect_action: 'delete',
  }),
  relation('staging_photos', 'image', 'directus_files'),
];

const fieldsToDelete = [
  { collection: 'plays', field: 'director' },
];

const fieldUpdates = [
  { collection: 'plays', field: aliasM2mField('genres') },
  { collection: 'plays', field: aliasM2mField('tags') },
  { collection: 'plays', field: textField('short_description', { interfaceName: 'input-rich-text-md' }) },
  {
    collection: 'plays',
    field: fileField('poster_image', {
      note: 'A3 portrait poster used on play detail pages. This is separate from cover and home card images.',
    }),
  },
];

for (const definition of collectionDefinitions) {
  await ensureCollection(definition);
}

for (const item of fieldsToDelete) {
  await deleteFieldIfExists(item.collection, item.field);
}

for (const [collection, collectionFields] of Object.entries(fields)) {
  for (const field of collectionFields) {
    await ensureField(collection, field);
  }
}

for (const item of fieldUpdates) {
  await updateField(item.collection, item.field);
}

for (const item of relations) {
  await ensureRelation(item);
}

console.log('Directus schema setup complete.');

async function request(method, path, body) {
  const response = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.errors?.map((error) => error.message).join('; ') || response.statusText;
    const error = new Error(`${method} ${path}: ${message}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function exists(path) {
  try {
    await request('GET', path);
    return true;
  } catch (error) {
    if (error.status === 404 || error.status === 403) return false;
    throw error;
  }
}

async function ensureCollection({ collection, icon, display, hidden = false }) {
  if (await exists(`/collections/${collection}`)) {
    console.log(`collection exists: ${collection}`);
    return;
  }

  await request('POST', '/collections', {
    collection,
    meta: {
      icon,
      display_template: display,
      hidden,
    },
    schema: {},
    fields: [primaryKeyField()],
  });

  console.log(`collection created: ${collection}`);
}

async function ensureField(collection, field) {
  if (await exists(`/fields/${collection}/${field.field}`)) {
    console.log(`field exists: ${collection}.${field.field}`);
    return;
  }

  await request('POST', `/fields/${collection}`, field);
  console.log(`field created: ${collection}.${field.field}`);
}

async function updateField(collection, field) {
  if (!(await exists(`/fields/${collection}/${field.field}`))) return;

  const body = {
    meta: field.meta,
    ...(field.schema ? { schema: field.schema } : {}),
  };
  await request('PATCH', `/fields/${collection}/${field.field}`, body);
  console.log(`field updated: ${collection}.${field.field}`);
}

async function deleteFieldIfExists(collection, field) {
  if (!(await exists(`/fields/${collection}/${field}`))) return;

  await request('DELETE', `/fields/${collection}/${field}`);
  console.log(`field deleted: ${collection}.${field}`);
}

async function ensureRelation(item) {
  const all = await request('GET', '/relations');
  const found = all.data?.find(
    (relationItem) =>
      relationItem.collection === item.collection && relationItem.field === item.field,
  );

  if (found) {
    await request('PATCH', `/relations/${item.collection}/${item.field}`, item);
    console.log(`relation updated: ${item.collection}.${item.field}`);
    return;
  }

  await request('POST', '/relations', item);
  console.log(`relation created: ${item.collection}.${item.field}`);
}

function primaryKeyField() {
  return {
    field: 'id',
    type: 'integer',
    meta: {
      hidden: true,
      interface: 'input',
      readonly: true,
    },
    schema: {
      is_primary_key: true,
      has_auto_increment: true,
    },
  };
}

function stringField(
  field,
  { required = false, unique = false, maxLength = 255, width = 'half' } = {},
) {
  return {
    field,
    type: 'string',
    meta: {
      interface: 'input',
      required,
      width,
    },
    schema: {
      is_nullable: !required,
      is_unique: unique,
      max_length: maxLength,
    },
  };
}

function textField(field, { interfaceName = 'input-multiline' } = {}) {
  return {
    field,
    type: 'text',
    meta: {
      interface: interfaceName,
      width: 'full',
    },
    schema: {
      is_nullable: true,
    },
  };
}

function integerField(field) {
  return {
    field,
    type: 'integer',
    meta: {
      interface: 'input',
      width: 'half',
    },
    schema: {
      is_nullable: true,
    },
  };
}

function booleanField(field, defaultValue) {
  return {
    field,
    type: 'boolean',
    meta: {
      interface: 'boolean',
      width: 'half',
    },
    schema: {
      default_value: defaultValue,
      is_nullable: false,
    },
  };
}

function selectField(field, choices, defaultValue) {
  return {
    field,
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: choices.map((choice) => ({ text: choice.replaceAll('_', ' '), value: choice })),
      },
      width: 'half',
    },
    schema: {
      default_value: defaultValue,
      is_nullable: false,
      max_length: 255,
    },
  };
}

function dateTimeField(field) {
  return {
    field,
    type: 'dateTime',
    meta: {
      interface: 'datetime',
      width: 'half',
    },
    schema: {
      is_nullable: true,
    },
  };
}

function fileField(field, { note } = {}) {
  return {
    field,
    type: 'uuid',
    meta: {
      interface: 'file-image',
      special: ['file'],
      width: 'half',
      note,
    },
    schema: {
      is_nullable: true,
    },
  };
}

function m2oField(field) {
  return {
    field,
    type: 'integer',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      width: 'half',
    },
    schema: {
      is_nullable: true,
    },
  };
}

function aliasM2mField(field) {
  return {
    field,
    type: 'alias',
    meta: {
      interface: 'list-m2m',
      special: ['m2m'],
      width: 'full',
    },
  };
}

function aliasO2mField(field) {
  return {
    field,
    type: 'alias',
    meta: {
      interface: 'list-o2m',
      special: ['o2m'],
      width: 'full',
    },
  };
}

function relation(collection, field, related_collection, meta = {}) {
  return {
    collection,
    field,
    related_collection,
    meta: {
      many_collection: collection,
      many_field: field,
      one_collection: related_collection,
      ...meta,
    },
    schema: {
      on_delete: meta.one_deselect_action === 'delete' ? 'CASCADE' : 'SET NULL',
    },
  };
}
