# Stories Maker (MangaForge)

SaaS for AI-assisted manga/manhwa creation. Users define stories and characters, AI expands them into scripts, generates panel images, and assembles manga pages.

## Quick Reference

- **Stack**: SvelteKit (SSR, Node adapter) + Svelte 5 + TypeScript + TailwindCSS v4 + DaisyUI v5
- **DB**: PostgreSQL + Drizzle ORM
- **Auth**: Better Auth with Polar.sh billing plugin
- **AI**: Gemini 2.5 Pro (text) + Imagen 3 (images) via Google Cloud
- **Storage**: Cloudflare R2 (S3-compatible)
- **i18n**: Paraglide JS (inlang)
- **Testing**: Vitest (unit) + Playwright (e2e)

## Commands

```bash
npm run dev            # Start dev server
npm run build          # Production build
npm run check          # Type checking (svelte-check)
npm run lint           # Prettier check
npm run format         # Prettier write
npm run test:unit      # Vitest
npm run test:e2e       # Playwright
npm run test           # Unit + e2e
npm run db:push        # Push schema to DB (no migration files)
npm run db:generate    # Generate migration SQL
npm run db:migrate     # Run migrations
npm run db:studio      # Drizzle Studio GUI
npm run auth:schema    # Regenerate Better Auth schema types
```

## Project Structure

```
src/
  app.d.ts                          # SvelteKit types (session/user on locals)
  hooks.server.ts                   # Paraglide i18n + Better Auth session handler
  hooks.ts                          # Paraglide URL rerouting
  lib/
    server/
      auth.ts                       # Better Auth config
      db/
        index.ts                    # Drizzle client (postgres.js driver)
        schema.ts                   # App tables (re-exports auth.schema)
        auth.schema.ts              # Auto-generated Better Auth tables
    paraglide/                      # Generated i18n runtime
  routes/
    (auth)/                         # Login/register (planned)
    (app)/                          # Authenticated app routes (planned)
    (public)/                       # Public reader/browse (planned)
    api/                            # API routes (planned)
```

## Key Conventions

- **Svelte 5 runes**: Use `$state`, `$derived`, `$effect` — no legacy stores
- **Soft deletes**: All core entities use `deleted_at` column. Always filter `WHERE deleted_at IS NULL`
- **Schema**: App tables in `src/lib/server/db/schema.ts`, auth tables auto-generated via `npm run auth:schema`
- **Server code**: All server-only code lives under `src/lib/server/`
- **Environment variables**: Access via `$env/dynamic/private` (server) or `$env/dynamic/public` (client)
- **CSS**: TailwindCSS v4 with DaisyUI v5 components
- **Formatting**: Prettier with svelte + tailwindcss plugins

## Detailed Documentation

- [Architecture & Patterns](.claude/docs/architecture.md) — tech stack details, route structure, caching
- [Database Schema](.claude/docs/database.md) — all tables, relationships, credit system
- [AI Pipeline](.claude/docs/ai-pipeline.md) — text/image generation, prompt chains, consistency strategies
