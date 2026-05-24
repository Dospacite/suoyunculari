#!/usr/bin/env node

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error('Set DIRECTUS_URL and DIRECTUS_TOKEN before running this script.');
  process.exit(1);
}

const contentCollections = [
  'plays',
  'stagings',
  'books',
  'rehearsal_ideas',
  'blog_posts',
  'authors',
  'genres',
  'tags',
  'languages',
  'periods',
  'pages',
  'homepage_sections',
  'contact_items',
  'club_resources',
  'plays_genres',
  'plays_tags',
  'blog_posts_plays',
  'blog_posts_books',
  'blog_posts_text_bank_references',
  'staging_photos',
];

const publicFields = {
  plays: [
    'id',
    'title',
    'slug',
    'original_title',
    'summary',
    'short_description',
    'cover_image',
    'poster_image',
    'author',
    'year_written',
    'language',
    'duration_minutes',
    'cast',
    'min_cast_size',
    'max_cast_size',
    'female_roles',
    'male_roles',
    'neutral_roles',
    'genres',
    'tags',
    'period',
    'setting',
    'themes',
    'rights_status',
    'rights_notes',
    'script_url',
    'is_published',
    'display_on_home',
    'is_newcomer_play',
    'home_sort_order',
    'event_date',
    'event_venue',
    'home_card_image',
    'text_bank_source',
    'text_bank_source_id',
    'text_bank_source_url',
    'stagings',
  ],
  stagings: [
    'id',
    'title',
    'slug',
    'play',
    'date',
    'venue',
    'summary',
    'body',
    'director',
    'cast_notes',
    'production_notes',
    'ticket_url',
    'video_url',
    'cover_image',
    'photos',
    'sort_order',
    'is_published',
  ],
  staging_photos: [
    'id',
    'staging',
    'image',
    'caption',
    'alt_text',
    'sort_order',
  ],
  books: [
    'id',
    'title',
    'slug',
    'author',
    'translator',
    'publisher',
    'publication_year',
    'category',
    'language',
    'location',
    'notes',
    'tags',
    'cover_image',
    'is_available',
    'is_published',
  ],
  rehearsal_ideas: [
    'id',
    'title',
    'slug',
    'summary',
    'body',
    'tags',
    'difficulty',
    'is_published',
    'created_at',
    'updated_at',
  ],
  blog_posts: [
    'id',
    'title',
    'slug',
    'excerpt',
    'body',
    'cover_image',
    'author_name',
    'published_at',
    'related_plays',
    'related_books',
    'text_bank_references',
    'is_published',
  ],
  homepage_sections: [
    'id',
    'section_key',
    'heading',
    'subheading',
    'body',
    'image',
    'button_text',
    'button_url',
    'sort_order',
    'is_visible',
  ],
  contact_items: [
    'id',
    'label',
    'value',
    'type',
    'href',
    'sort_order',
    'is_visible',
  ],
  club_resources: [
    'id',
    'title',
    'slug',
    'resource_type',
    'description',
    'value',
    'href',
    'color_value',
    'file',
    'sort_order',
    'is_visible',
  ],
};

const editableFields = {
  plays: publicFields.plays,
  stagings: publicFields.stagings,
  staging_photos: publicFields.staging_photos,
  books: publicFields.books,
  rehearsal_ideas: publicFields.rehearsal_ideas,
  blog_posts: publicFields.blog_posts,
  homepage_sections: publicFields.homepage_sections,
  contact_items: publicFields.contact_items,
  club_resources: publicFields.club_resources,
};

const publicPolicy = await findPolicyByName('$t:public_label');
if (!publicPolicy) {
  throw new Error('Directus public policy was not found.');
}

const contentEditorRole = await ensureRole('Content Editor', 'Can edit published website content.');
const contributorRole = await ensureRole('Contributor', 'Can draft play and blog records.');
const contentEditorPolicy = await ensurePolicy('Content Editor', true);
const contributorPolicy = await ensurePolicy('Contributor', true);

await ensureAccess(contentEditorRole.id, contentEditorPolicy.id);
await ensureAccess(contributorRole.id, contributorPolicy.id);

await ensurePermission(publicPolicy.id, 'plays', 'read', {
  permissions: { is_published: { _eq: true } },
  fields: publicFields.plays,
});
await ensurePermission(publicPolicy.id, 'stagings', 'read', {
  permissions: { is_published: { _eq: true } },
  fields: publicFields.stagings,
});
await ensurePermission(publicPolicy.id, 'staging_photos', 'read', {
  permissions: { staging: { is_published: { _eq: true } } },
  fields: publicFields.staging_photos,
});
await ensurePermission(publicPolicy.id, 'books', 'read', {
  permissions: { is_published: { _eq: true } },
  fields: publicFields.books,
});
await ensurePermission(publicPolicy.id, 'blog_posts', 'read', {
  permissions: { is_published: { _eq: true } },
  fields: publicFields.blog_posts,
});
await ensurePermission(publicPolicy.id, 'rehearsal_ideas', 'read', {
  permissions: { is_published: { _eq: true } },
  fields: publicFields.rehearsal_ideas,
});
await ensurePermission(publicPolicy.id, 'homepage_sections', 'read', {
  permissions: { is_visible: { _eq: true } },
  fields: publicFields.homepage_sections,
});
await ensurePermission(publicPolicy.id, 'contact_items', 'read', {
  permissions: { is_visible: { _eq: true } },
  fields: publicFields.contact_items,
});
await ensurePermission(publicPolicy.id, 'club_resources', 'read', {
  permissions: { is_visible: { _eq: true } },
  fields: publicFields.club_resources,
});
await ensurePermission(publicPolicy.id, 'directus_files', 'read', {
  fields: ['id', 'title', 'filename_disk', 'filename_download', 'type', 'modified_on'],
});

for (const collection of ['authors', 'genres', 'tags', 'languages', 'periods', 'pages']) {
  await ensurePermission(publicPolicy.id, collection, 'read', { fields: ['*'] });
}

for (const collection of ['plays_genres', 'plays_tags']) {
  await ensurePermission(publicPolicy.id, collection, 'read', {
    permissions: { plays_id: { is_published: { _eq: true } } },
    fields: ['*'],
  });
}

await ensurePermission(publicPolicy.id, 'blog_posts_plays', 'read', {
  permissions: { blog_posts_id: { is_published: { _eq: true } } },
  fields: ['*'],
});
await ensurePermission(publicPolicy.id, 'blog_posts_books', 'read', {
  permissions: { blog_posts_id: { is_published: { _eq: true } } },
  fields: ['*'],
});
await ensurePermission(publicPolicy.id, 'blog_posts_text_bank_references', 'read', {
  permissions: { blog_posts_id: { is_published: { _eq: true } } },
  fields: ['*'],
});

for (const collection of contentCollections) {
  await ensurePermission(contentEditorPolicy.id, collection, 'read', { fields: ['*'] });
  await ensurePermission(contentEditorPolicy.id, collection, 'create', { fields: ['*'] });
  await ensurePermission(contentEditorPolicy.id, collection, 'update', { fields: ['*'] });
}

for (const collection of ['plays_genres', 'plays_tags', 'blog_posts_plays', 'blog_posts_books', 'blog_posts_text_bank_references', 'staging_photos']) {
  await ensurePermission(contentEditorPolicy.id, collection, 'delete', { fields: ['*'] });
}

for (const collection of ['plays', 'stagings', 'staging_photos', 'books', 'blog_posts', 'rehearsal_ideas', 'contact_items', 'club_resources']) {
  const fields = (editableFields[collection] ?? ['*']).filter(
    (field) => field !== 'is_published',
  );

  await ensurePermission(contributorPolicy.id, collection, 'read', { fields: ['*'] });
  await ensurePermission(contributorPolicy.id, collection, 'create', {
    fields,
    presets: publicFields[collection]?.includes('is_published') ? { is_published: false } : null,
  });
  await ensurePermission(contributorPolicy.id, collection, 'update', { fields });
}

for (const collection of ['genres', 'tags']) {
  await ensurePermission(contributorPolicy.id, collection, 'read', { fields: ['*'] });
}

for (const collection of ['plays_genres', 'plays_tags']) {
  await ensurePermission(contributorPolicy.id, collection, 'read', { fields: ['*'] });
  await ensurePermission(contributorPolicy.id, collection, 'create', { fields: ['*'] });
  await ensurePermission(contributorPolicy.id, collection, 'update', { fields: ['*'] });
  await ensurePermission(contributorPolicy.id, collection, 'delete', { fields: ['*'] });
}

for (const collection of ['directus_files', 'directus_folders']) {
  await ensurePermission(contentEditorPolicy.id, collection, 'read', { fields: ['*'] });
  await ensurePermission(contentEditorPolicy.id, collection, 'create', { fields: ['*'] });
  await ensurePermission(contentEditorPolicy.id, collection, 'update', { fields: ['*'] });
  await ensurePermission(contributorPolicy.id, collection, 'read', { fields: ['*'] });
  await ensurePermission(contributorPolicy.id, collection, 'create', { fields: ['*'] });
}

console.log('Directus roles and permissions setup complete.');

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

async function findRoleByName(name) {
  const payload = await request('GET', `/roles?filter[name][_eq]=${encodeURIComponent(name)}`);
  return payload.data?.[0] ?? null;
}

async function ensureRole(name, description) {
  const existing = await findRoleByName(name);
  if (existing) {
    console.log(`role exists: ${name}`);
    return existing;
  }

  const created = await request('POST', '/roles', { name, description });
  console.log(`role created: ${name}`);
  return created.data;
}

async function findPolicyByName(name) {
  const payload = await request('GET', `/policies?filter[name][_eq]=${encodeURIComponent(name)}`);
  return payload.data?.[0] ?? null;
}

async function ensurePolicy(name, appAccess) {
  const existing = await findPolicyByName(name);
  if (existing) {
    console.log(`policy exists: ${name}`);
    return existing;
  }

  const created = await request('POST', '/policies', {
    name,
    admin_access: false,
    app_access: appAccess,
    enforce_tfa: false,
  });
  console.log(`policy created: ${name}`);
  return created.data;
}

async function ensureAccess(role, policy) {
  const payload = await request(
    'GET',
    `/access?filter[role][_eq]=${encodeURIComponent(role)}&filter[policy][_eq]=${encodeURIComponent(policy)}`,
  );

  if (payload.data?.length) {
    console.log(`access exists: ${role} -> ${policy}`);
    return;
  }

  await request('POST', '/access', { role, policy });
  console.log(`access created: ${role} -> ${policy}`);
}

async function ensurePermission(policy, collection, action, options = {}) {
  const payload = await request(
    'GET',
    `/permissions?filter[policy][_eq]=${encodeURIComponent(policy)}&filter[collection][_eq]=${encodeURIComponent(collection)}&filter[action][_eq]=${encodeURIComponent(action)}`,
  );

  const body = {
    policy,
    collection,
    action,
    permissions: options.permissions ?? {},
    validation: options.validation ?? null,
    presets: options.presets ?? null,
    fields: options.fields ?? ['*'],
  };

  if (payload.data?.[0]) {
    await request('PATCH', `/permissions/${payload.data[0].id}`, body);
    console.log(`permission updated: ${collection}.${action}`);
    return;
  }

  await request('POST', '/permissions', body);
  console.log(`permission created: ${collection}.${action}`);
}
