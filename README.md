# suoyunculari.com

Static Astro website for `suoyunculari.com`, built from published Directus content.

## Development

```bash
npm install
npm run dev
```

Set `PUBLIC_DIRECTUS_URL=https://cms.suoyunculari.com` locally when building against the production CMS.

## Deployment

Merges to `main` run `.github/workflows/deploy.yml`, build the static site, and sync `dist/` to `/var/www/suoyunculari.com` on the VPS.

## Directus Setup

The CMS schema and baseline permissions are repeatable:

```bash
DIRECTUS_URL=https://cms.suoyunculari.com DIRECTUS_TOKEN=<admin-token> node scripts/setup-directus-schema.mjs
DIRECTUS_URL=https://cms.suoyunculari.com DIRECTUS_TOKEN=<admin-token> node scripts/setup-directus-permissions.mjs
```

The public policy can only read published/visible website content. Editor and contributor roles are created for handoff inside Directus.
