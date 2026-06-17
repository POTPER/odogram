# odogram

Cursor-style Mermaid editor. Diagrams are saved to **your own GitHub repository** — the site is only the editor.

## Features

- Live Mermaid preview with Cursor dark theme
- GitHub OAuth login
- Save diagrams to `{username}/odogram-diagrams/diagrams/*.mmd`
- Share public links at `/view/{username}/{id}`
- Download SVG, copy source, load example

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- Cloudflare account
- GitHub account (for OAuth App)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a GitHub OAuth App

Go to [GitHub Developer Settings → OAuth Apps → New](https://github.com/settings/applications/new):

| Field | Value |
|-------|-------|
| Application name | odogram (or any name) |
| Homepage URL | `http://localhost:8787` (update after deploy) |
| Authorization callback URL | `http://localhost:8787/auth/callback` |

After creating the app, note the **Client ID** and generate a **Client Secret**.

For production, add a second callback URL:

```
https://odogram.<your-subdomain>.workers.dev/auth/callback
```

### 3. Configure secrets

Create a random session secret (32+ characters):

```bash
# PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Or openssl
openssl rand -base64 32
```

Set secrets for local dev and production:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
```

For **local development**, create `.dev.vars` in the project root (do not commit):

```env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
SESSION_SECRET=your_random_secret
```

### 4. Run locally

```bash
npm run dev
```

Open `http://localhost:8787`, click **Login with GitHub**, authorize, then edit and save.

### 5. Deploy

```bash
npm run deploy
```

Update your GitHub OAuth App:

- Homepage URL → your Workers URL
- Callback URL → `https://odogram.<subdomain>.workers.dev/auth/callback`

Re-run `wrangler secret put` if secrets were only in `.dev.vars`.

## Project structure

```
public/           Static assets (editor UI)
  index.html
  app.js
  theme.js
  style.css
  diagrams/example.mmd
src/
  worker.js       Route handler
  auth.js         GitHub OAuth + session cookie
  github.js       GitHub Contents API
wrangler.jsonc    Cloudflare Worker config
```

## How saving works

1. User logs in via GitHub OAuth (`repo` scope).
2. On first save, odogram creates a public repo `{username}/odogram-diagrams` if it doesn't exist.
3. Each diagram is committed as `diagrams/{id}.mmd` via the GitHub Contents API.
4. Share links read from the public raw URL — no diagram data is stored on Cloudflare.

## API routes

| Route | Auth | Description |
|-------|------|-------------|
| `GET /auth/login` | — | Start GitHub OAuth |
| `GET /auth/callback` | — | OAuth callback |
| `GET /auth/logout` | — | Clear session |
| `GET /auth/me` | cookie | Current user |
| `POST /api/save` | required | Save diagram to GitHub |
| `GET /api/load?id=` | required | Load diagram from GitHub |
| `GET /api/list` | required | List user's diagrams |
| `GET /api/official-roadmap` | public | Official oproduct roadmap from GitHub Project |
| `GET /view/:user/:id` | public | Read-only share page |

## Official roadmap (GitHub Project)

The default product map (`oproduct-欢迎.oprd`) can sync its **Roadmap** view from a maintainer-owned GitHub Project. Tree and Journey stay in the static `.oprd` file; if the API is unavailable, Roadmap falls back to the handwritten `milestone` / `deliver` blocks.

### Setup

1. Create a **Project v2** on the odogram source repo (not user `odogram-diagrams` repos), e.g. `odogram Roadmap`.
2. Use **Status** (Todo / In Progress / Done) and **Iteration** fields. Iteration names map to milestones (`P1.5`, `P2`, etc.).
3. Prefer **Draft issues** for roadmap cards. Real issues are included only when labeled `odogram:roadmap`; issues labeled `odogram:diagram` are always excluded.
4. Create a PAT with `read:project` scope and configure:

```bash
npx wrangler secret put GITHUB_OFFICIAL_TOKEN
```

In `wrangler.jsonc` vars (or `.dev.vars` for local dev):

```env
OFFICIAL_PROJECT_OWNER=your-github-login
OFFICIAL_PROJECT_NUMBER=1
```

5. Ensure `public/diagrams/oproduct-欢迎.oprd` frontmatter includes `roadmap_source: github`.

If `GITHUB_OFFICIAL_TOKEN` or project vars are missing, the site silently uses the static roadmap in the `.oprd` file.

## License

MIT
