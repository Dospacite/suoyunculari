# suoyunculari.com

Astro website for `suoyunculari.com`, built from published Directus content with a PostgreSQL-backed Concord play search.

## Development

```bash
npm install
npm run dev
```

Set `PUBLIC_DIRECTUS_URL=https://cms.suoyunculari.com` locally when building against the production CMS.

For the PostgreSQL-backed `Metin Bankası`, start the local app and database with Docker Compose:

```bash
cp .env.example .env
docker compose up -d --build
```

The app is available at `http://localhost:4321`.

## Concord Import

Scrape Concord data into JSON, then import the final JSON array into PostgreSQL:

```bash
node scripts/scrape-concord-plays.mjs
npm run db:import:concord
```

Useful importer options:

```bash
npm run db:import:concord -- --file /tmp/concord-scrape-test/concord-plays.json
npm run db:import:concord -- --truncate
npm run db:import:concord -- --dry-run
```

When running the importer from the host, `DATABASE_URL` should point at the exposed local database, for example `postgres://suo:suo_password@localhost:5432/suoyunculari`.

## Deployment

Merges to `main` run `.github/workflows/deploy.yml`, sync the project to `/opt/suoyunculari` on the VPS, write the production `.env`, and restart `docker compose`.

Required GitHub secrets:

- `PUBLIC_DIRECTUS_URL`
- `POSTGRES_PASSWORD`
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`

Concord imports are not run automatically during deployment. Run the importer explicitly after scraper output exists.

## Directus Setup

The CMS schema and baseline permissions are repeatable:

```bash
DIRECTUS_URL=https://cms.suoyunculari.com DIRECTUS_TOKEN=<admin-token> node scripts/setup-directus-schema.mjs
DIRECTUS_URL=https://cms.suoyunculari.com DIRECTUS_TOKEN=<admin-token> node scripts/setup-directus-permissions.mjs
```

The public policy can only read published/visible website content. Editor and contributor roles are created for handoff inside Directus.
