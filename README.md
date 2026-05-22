# suoyunculari.com

Astro website for `suoyunculari.com`, built from published Directus content with a PostgreSQL-backed Metin Bankası search.

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

## Metin Bankası Import

Scrape Concord and Drama Online data into JSON, then import the final normalized JSON arrays into PostgreSQL:

```bash
node scripts/scrape-concord-plays.mjs
node scripts/scrape-drama-online-plays.mjs
npm run db:import:text-bank
```

Useful importer options:

```bash
npm run db:import:text-bank -- --file /tmp/concord-scrape-test/concord-plays.json
npm run db:import:text-bank -- --truncate
npm run db:import:text-bank -- --dry-run
npm run db:import:concord
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

Deployments import the committed normalized scrape files in `scripts/scraped/concord/concord-plays.json` and `scripts/scraped/drama-online/drama-online-plays.json` into the VPS PostgreSQL database after the compose stack restarts.

## Directus Setup

The CMS schema and baseline permissions are repeatable:

```bash
DIRECTUS_URL=https://cms.suoyunculari.com DIRECTUS_TOKEN=<admin-token> node scripts/setup-directus-schema.mjs
DIRECTUS_URL=https://cms.suoyunculari.com DIRECTUS_TOKEN=<admin-token> node scripts/setup-directus-permissions.mjs
```

The public policy can only read published/visible website content. Editor and contributor roles are created for handoff inside Directus.
