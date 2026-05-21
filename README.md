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
