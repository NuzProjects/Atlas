# Deploy your own Atlas

Atlas comes with its **own Wisp server**! The website and relay run together, so you do not need a separate relay, API key, or connection to a maintainer-hosted server. You host your own instance and its traffic on your own machine or hosting account.

## 1. Get Atlas

Install [Docker with Docker Compose](https://docs.docker.com/compose/install/), then run:

```bash
git clone https://github.com/NuzProjects/Atlas.git
cd Atlas
cp .env.example .env
docker compose up -d --build
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp` if needed.

Open **http://localhost:8080**. Atlas and its built-in Wisp relay are ready! The local port is bound to your machine only.

## 2. Put it on your own domain

Use a server that supports Docker and incoming connections on ports **80** and **443**. Create an **A record** pointing your chosen hostname to **your server's public IPv4 address**. Start with DNS-only mode if your DNS provider offers proxying.

Edit these two values in `.env`, replacing the example hostname with your own:

```dotenv
PUBLIC_ORIGIN=https://atlas.example.com
ATLAS_DOMAIN=atlas.example.com
```

Then enable automatic HTTPS:

```bash
docker compose --profile https up -d --build
```

Open your new HTTPS address. Caddy obtains and renews the certificate, and the bundled Wisp relay uses **`wss://your-hostname/wisp/`** automatically. Leave **Wisp Config** blank in Atlas settings to use it.

> [!NOTE]
> Use your own domain and server IP. No public deployment uses the maintainer's VPS or relay. Hosting and bandwidth are provided by your chosen host. Static-only hosts such as GitHub Pages cannot run Atlas's Node server or Wisp connections.

## 3. Update or stop Atlas

```bash
# Update your instance
git pull --ff-only
docker compose --profile https up -d --build

# View logs
docker compose logs --tail=100 atlas caddy

# Stop your instance
docker compose --profile https down
```

For local-only use, leave out `--profile https`. Named Docker volumes retain the server's URL-encryption keys, cache, and HTTPS certificates between updates. Back up those volumes before moving servers; avoid `down -v` unless you intend to erase them. Browser history and settings remain in each user's browser.

## Prefer Node.js?

Install **Node.js 24**, clone the repository, and run:

```bash
cp .env.example .env
npm ci
npm run build:prod
npm start
```

Open **http://localhost:8080**. For public access, set `PUBLIC_ORIGIN` to your HTTPS origin and put a WebSocket-capable HTTPS reverse proxy in front of port **8080**. Keep `.cache` writable and persistent. The Node server includes Wisp at **`/wisp/`**; no separate Wisp process is needed.

## Limits

Atlas limits how much each visitor can use so one person or script cannot exhaust your server. The defaults are generous enough for many people sharing one network, such as a school. To change them, add any of these to `.env` (Docker users also add them under `environment:` in `compose.yaml`):

| Variable | Default | What it limits |
| --- | --- | --- |
| `ATLAS_SOCKETS_PER_CLIENT` | 200 | Open relay connections per visitor |
| `ATLAS_SOCKETS_TOTAL` | 1000 | Open relay connections in total |
| `ATLAS_SOCKET_OPENS_PER_MINUTE` | 300 | New relay connections per visitor per minute |
| `ATLAS_REQUESTS_PER_MINUTE` | 3000 | API and page requests per visitor per minute |
| `ATLAS_SUGGESTIONS_PER_MINUTE` | 1200 | Search suggestions per visitor per minute |
| `ATLAS_BUFFER_BUDGET_MB` | 96 | Memory used for pages being processed at once |

Visitors over a limit get an HTTP 429 response and can retry shortly. Behind Caddy or Cloudflare, Atlas uses the visitor's real address.

## Build from source

You need **Node.js 24** (the version in `.nvmrc`) and Git.

```bash
git clone https://github.com/NuzProjects/Atlas.git
cd Atlas
npm ci
npm run build:prod
npm start
```

`npm run build:prod` bundles the Wisp client and server into `dist/` and the browser URL-encryption helper into `public/atlas-url-crypto.js`. Without a `.env` file, `npm start` runs Atlas in development mode on **http://localhost:8080**, listening on your machine only. Copy `.env.example` to `.env` to run it in production mode.

Useful scripts while working on Atlas:

| Command | What it does |
| --- | --- |
| `npm run dev` | Rebuilds the bundles whenever a source file changes |
| `npm run check` | Checks JavaScript syntax, inline scripts, and committed secrets |
| `npm run lint` | Runs ESLint |
| `npm test` | Runs the unit tests |
| `npm run format` | Formats the code with Prettier (`npm run format:check` only checks) |
| `npm run icons` | Regenerates the Lucide icons after adding or renaming one |

To build the Docker image on its own, run `docker build -t atlas .`.
