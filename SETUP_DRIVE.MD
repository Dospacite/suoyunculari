# Pingo Google Drive Setup

This feature lets Pingo search a connected Google Drive account for stage play scripts, cache the file locally, and return a download link that expires after one day.

## What is already implemented

- YK settings page OAuth login: `/settings`
- Pingo tool config: `/pingo` -> `Google Drive Scripts`
- OAuth callback: `/api/pingo/drive/oauth/callback`
- Public expiring file links: `/drive/:token`
- Default public download host: `https://assets.suoyunculari.com`
- Default local cache path in Docker: `/var/lib/pingo-drive-files`

## Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable the Google Drive API for that project.
3. Configure the OAuth consent screen.
   - User type can be `External` if the Drive account is a regular Google account.
   - Add the account that will connect Drive as a test user while the app is in testing.
   - The app requests `https://www.googleapis.com/auth/drive.readonly`, `openid`, `email`, and `profile`.
4. Create an OAuth client.
   - Application type: `Web application`
   - Authorized redirect URI: `https://yk.suoyunculari.com/api/pingo/drive/oauth/callback`
5. Put the client details in GitHub Actions secrets and/or the VPS `.env`:

```dotenv
PINGO_GOOGLE_DRIVE_CLIENT_ID=
PINGO_GOOGLE_DRIVE_CLIENT_SECRET=
PINGO_GOOGLE_DRIVE_REDIRECT_URI=https://yk.suoyunculari.com/api/pingo/drive/oauth/callback
PINGO_DRIVE_PUBLIC_BASE_URL=https://assets.suoyunculari.com
PINGO_DRIVE_STORAGE_DIR=/var/lib/pingo-drive-files
```

Google's OAuth server app flow requires a web OAuth client, an exact redirect URI match, and offline access to receive a refresh token. The implementation uses Google's REST OAuth endpoints and sends Drive API requests with `Authorization: Bearer`.

References:

- Google OAuth web server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- Google Drive API overview: https://developers.google.com/workspace/drive/api/guides/about-sdk

## VPS / assets host

`assets.suoyunculari.com` should route to the same Astro app as the YK dashboard. The app serves public download links from `/drive/:token`; those links check the hashed token in PostgreSQL and return `404` after `expires_at`.

The Docker compose file mounts a named volume:

```yaml
pingo_drive_files:/var/lib/pingo-drive-files
```

No script file is committed to git. Files are downloaded on first request and reused from local storage when possible.

## Connect Drive in YK

1. Deploy with the Google secrets configured.
2. Log in to the YK dashboard as an admin.
3. Open `/settings`.
4. In `Pingo Google Drive`, click `Connect Drive`.
5. Complete Google consent with the Drive account that owns or can read the script folders.
6. Confirm the settings panel shows the connected account email.

If Google does not return a refresh token, disconnect/reconnect and make sure the OAuth consent flow uses `prompt=consent`. Removing the app grant from the Google Account security page and reconnecting also forces a fresh refresh token.

## Limit Pingo to folders

1. Open `/pingo`.
2. Enable `Google Drive Scripts`.
3. Paste allowed Google Drive folder IDs into `Drive folder IDs`, comma-separated.
4. Keep `Alt klasörler` enabled if scripts may live below those folders.
5. Save the tool.

Folder IDs are the long ID segment in a Drive folder URL:

```text
https://drive.google.com/drive/folders/<folder-id>
```

The tool will not search all Drive content if no folder IDs are configured.

## WhatsApp behavior

When a user asks for a specific play script:

1. Pingo calls the Drive tool with the requested title.
2. If no matching file exists, Pingo says the script was not found.
3. If a file exists, Pingo first sends: `metni buldum, şimdi gönderiyorum.`
4. The app checks local storage.
5. If missing or stale by checksum, the app downloads the file from Drive.
6. Pingo sends a download link under `PINGO_DRIVE_PUBLIC_BASE_URL`.
7. The link expires after 24 hours.

Google Docs and Slides are exported as PDF. Binary files such as PDF, DOCX, TXT, RTF, and ODT are downloaded directly.
