# odogram

Cursor-style Mermaid editor. Diagrams are saved to **your own GitHub repository** — the site is only the editor.

## Features

- Live Mermaid preview with Cursor dark theme
- GitHub OAuth login
- Save diagrams as GitHub Issues in `{username}/odogram-diagrams` (label `odogram:diagram`)
- Share public links at `/view/{username}/{folder}/{id}`
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
public/                 Static assets (editor UI)
  index.html
  app.js
  preview.js
  style.css             @imports styles/*.css
  styles/               base, sidebar, workbench, oproduct CSS
  diagrams/             Sidebar CRUD, autosave, examples (ES modules)
  oproduct/             oproduct DSL parser + renderers
  diagrams/example.mmd
  diagrams/oproduct-欢迎.oprd
src/
  worker.js             Route dispatcher
  api-handlers.js       /api/* and /view/* handlers
  view-pages.js         Share page HTML templates
  auth.js               GitHub OAuth + session cookie
  github.js             GitHub Issue storage (GraphQL + REST)
wrangler.jsonc          Cloudflare Worker config
```

## How saving works

1. User logs in via GitHub OAuth (`public_repo` scope).
2. On first save, odogram ensures a public repo `{username}/odogram-diagrams` exists.
3. Each diagram is stored as a GitHub Issue with label `odogram:diagram`; source lives in the issue body (YAML frontmatter + diagram text).
4. Share links are served by the Worker at `/view/...` — diagram content is read from GitHub at request time; no diagram data is stored on Cloudflare.

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
| `POST /api/rename` | required | Rename a diagram |
| `POST /api/delete` | required | Delete a diagram |
| `POST /api/move` | required | Move a diagram between folders |
| `GET /view/:user/:id` | public | Read-only share page (optional `/view/:user/:folder/:id`) |

## oproduct Roadmap drag editing

In the editor, you can drag milestones and deliverables in the oproduct **Roadmap** preview. Changes are written back to the `@view roadmap` section in the source.

## License

MIT
