# Discogs AI Importer

A local web app that turns photos of DVD/CD shelves into Discogs collection entries. It runs on your own machine, listens on `127.0.0.1` only, and keeps all of its state in one data folder you can copy elsewhere.

## Requirements

- Node.js 24 (any Node >= 22 works)
- pnpm 12.14.0

The project pins both in `mise.toml` (and Node in `.nvmrc`). With [mise](https://mise.jdx.dev):

```sh
mise trust && mise install
```

If `pnpm` is missing, Node's bundled corepack provides the pinned version:

```sh
corepack enable pnpm
```

(Or prefix every command with `corepack`, e.g. `corepack pnpm start`.) Then install dependencies once:

```sh
pnpm install --frozen-lockfile
```

## Launch

```sh
pnpm start
```

This builds the app, then serves it at **http://127.0.0.1:3000**. The URL is printed in the terminal; no browser is opened, so open it yourself. Stop the app with `Ctrl+C`.

| Command | What it does |
|---------|--------------|
| `pnpm start` | Build, then serve (daily use) |
| `pnpm serve` | Serve the last build without rebuilding (faster when nothing changed) |
| `pnpm dev` | Development server with hot reload |
| `pnpm test` | Unit tests (Vitest) |

All three server commands bind `127.0.0.1` only, so other machines on your network cannot reach the app. A Host/Origin guard also refuses requests addressed to other hostnames and cross-site form posts.

**Restart `pnpm dev` after editing job handlers** (`src/server/jobs/**`). Hot reload updates pages and routes, but the running worker keeps the old code until the server restarts.

## Configuration

Settings come from environment variables, either in the shell or in a `.env.local` file (gitignored). `.env.example` lists every variable; all are optional.

- `PORT`: the port to listen on (default `3000`), e.g. `PORT=4000 pnpm start` serves at http://127.0.0.1:4000.
- `DATA_DIR`: the data folder (default `./data`). Relative paths resolve against the project root, e.g. `DATA_DIR=/mnt/discs/data pnpm start`.

### Secrets

Discogs keys are stored in `secrets.json` at the project root (path overridable with `SECRETS_FILE`), **outside** the data folder, so copying or sharing the data folder never leaks keys. `secrets.json` is gitignored. `DISCOGS_CONSUMER_KEY` and `DISCOGS_CONSUMER_SECRET` in the environment override saved values.

### Claude vision

Reading disc spines (a later phase) uses the local **Claude Code CLI** (`claude`) with your own Claude subscription. There is no Anthropic API key and no API billing. Install the CLI and log in once (`claude`); set `CLAUDE_BIN` if it is not on your `PATH`. The app removes `ANTHROPIC_API_KEY` from the CLI's environment so your subscription login is always used.

## Data folder

Everything the app knows lives in the data folder (default `./data`, gitignored):

```
data/
  app.db      SQLite database (WAL mode)
  photos/     uploaded shelf photos
  vision/     Claude vision results
  crops/      cropped spine images
  thumbs/     thumbnails
  backups/    database backups
```

The folder is created and the database migrated automatically on first launch, and migrated again on every launch, so an older copy upgrades itself.

### Copying or moving it

**Stop the app before copying the data folder.** A clean stop folds SQLite's write-ahead log back into `app.db`, so the folder is self-contained. After a crash, copy the whole folder (including any `app.db-wal` and `app.db-shm` files); SQLite replays them on the next start.

To take a backup while the app is running, use SQLite's `VACUUM INTO`, which writes a consistent copy of a live database (run it from the project root; the target file must not exist yet):

```sh
node -e "require('better-sqlite3')('data/app.db').exec(\"VACUUM INTO 'data/backups/app-backup.db'\")"
```

Then point a copy of the app at the copied folder with `DATA_DIR`, or drop the folder into another checkout as `data/`.
