#!/usr/bin/env node

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error('Set DIRECTUS_URL and DIRECTUS_TOKEN before running this script.');
  process.exit(1);
}

const contentCollections = [
  'plays',
  'blog_posts',
  'authors',
  'genres',
  'tags',
  'languages',
  'periods',
  'pages',
  'homepage_sections',
  'plays_genres',
  'plays_tags',
];

const publicFields = {
  plays: [
    'id',
    'title',
    'slug',
    'original_title',
    'summary',
    'cover_image',
    'author',
    'year_written',
    'language',
    'duration_minutes',
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
    'difficulty',
    'rights_status',
    'rights_notes',
    'script_url',
    'is_published',
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
};

const editableFields = {
  plays: publicFields.plays,
  blog_posts: publicFields.blog_posts,
  homepage_sections: publicFields.homepage_sections,
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
await ensurePermission(publicPolicy.id, 'blog_posts', 'read', {
  permissions: { is_published: { _eq: true } },
  fields: publicFields.blog_posts,
});
await ensurePermission(publicPolicy.id, 'homepage_sections', 'read', {
  permissions: { is_visible: { _eq: true } },
  fields: publicFields.homepage_sections,
});

for (const collection of ['authors', 'genres', 'tags', 'languages', 'periods', 'pages']) {
  await ensurePermission(publicPolicy.id, collection, 'read', { fields: ['*'] });
}

for (const collection of contentCollections) {
  await ensurePermission(contentEditorPolicy.id, collection, 'read', { fields: ['*'] });
  await ensurePermission(contentEditorPolicy.id, collection, 'create', { fields: ['*'] });
  await ensurePermission(contentEditorPolicy.id, collection, 'update', { fields: ['*'] });
}

for (const collection of ['plays', 'blog_posts']) {
  const fields = (editableFields[collection] ?? ['*']).filter(
    (field) => field !== 'is_published',
  );

  await ensurePermission(contributorPolicy.id, collection, 'read', { fields: ['*'] });
  await ensurePermission(contributorPolicy.id, collection, 'create', {
    fields,
    presets: { is_published: false },
  });
  await ensurePermission(contributorPolicy.id, collection, 'update', { fields });
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
