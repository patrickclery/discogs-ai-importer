# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-18
**Phase:** 01-foundation
**Areas discussed:** Launch command, Data folder layout, Secret storage, Job queue semantics, App shell
**Mode:** `--auto` — all areas auto-selected; recommended option chosen for each.

---

## Launch command

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm dev / pnpm start bound to 127.0.0.1 | One command, localhost only | ✓ |
| Docker compose | Extra tooling for a local tool | |
| Packaged desktop app | Out of scope | |

## Data folder layout

| Option | Description | Selected |
|--------|-------------|----------|
| `./data` default, `DATA_DIR` override, relative paths in DB | Portable by copying one folder | ✓ |
| OS app-data directory | Harder to find/copy | |

## Secret storage

| Option | Description | Selected |
|--------|-------------|----------|
| Gitignored `secrets.json` outside `data/`, env override | Copying data never leaks keys | ✓ |
| In SQLite settings table | Simplest, but data folder carries secrets | |
| `.env.local` only | No settings-page save | |

## Job queue semantics

| Option | Description | Selected |
|--------|-------------|----------|
| SQLite jobs table + globalThis singleton worker from instrumentation.ts | Durable, no extra infra | ✓ |
| BullMQ/Redis | Extra service | |
| Separate worker process | Two processes to run | |

## App shell

| Option | Description | Selected |
|--------|-------------|----------|
| Top nav (Upload / Spines / Settings) + status indicator | Minimal | ✓ |
| Sidebar layout | More chrome than needed | |

## Claude's Discretion

- Settings/shell visual layout, migration tooling, test structure, Biome config, port.

## Deferred Ideas

- Backup/export UI (v2 DATA-03); Discogs connection test (Phase 3).
