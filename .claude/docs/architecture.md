# Architecture & Patterns

## Core Pipeline (User Flow)

```
DEFINE → REFINE → SCRIPT → GENERATE → ASSEMBLE
```

1. **Define** — User inputs title, genre, synopsis, characters, locations, art style
2. **Refine** — AI expands synopsis into detailed story, generates character/location descriptions + reference images
3. **Script** — Story split into chapters → sections (panels). AI writes scripts + image prompts per section
4. **Generate** — Bulk image generation, polling for results, images stored on R2
5. **Assemble** (v2) — Panel layout editor, speech bubbles, PDF/image export

## Tech Stack Details

| Layer | Choice | Notes |
|---|---|---|
| Framework | SvelteKit (Node adapter) | SSR + API routes, deployed on Vercel/Railway/Fly |
| UI | Svelte 5 + TailwindCSS v4 + DaisyUI v5 | Runes-only (`$state`, `$derived`, `$effect`) |
| Auth | Better Auth | Email/password + GitHub OAuth, Polar.sh plugin for billing |
| DB | PostgreSQL + Drizzle ORM | postgres.js driver, connection via `DATABASE_URL` |
| AI Text | Gemini 2.5 Pro | Via Google Cloud Vertex AI or AI Studio |
| AI Image | Imagen 3 | Via Vertex AI, supports batch prediction |
| Storage | Cloudflare R2 | S3-compatible, `@aws-sdk/client-s3` |
| i18n | Paraglide JS (inlang) | Messages in `messages/en.json` |
| Scheduling | node-cron (v1) | Migrate to BullMQ + Redis at scale |

## Route Structure (Planned)

```
src/routes/
  (auth)/login/, register/
  (app)/
    dashboard/                      # Story list, credits, stats
    story/new/                      # Create story wizard
    story/[storyId]/                # Story overview
      edit/                         # Edit synopsis, settings, style
      characters/, locations/       # CRUD + reference sheet generation
      refine/                       # AI expansion phase
      chapters/[chapterId]/         # Chapter script + sections
        sections/, generate/        # Section editor, bulk image gen
      generate/                     # Generation dashboard
      reader/                       # Private preview (vertical scroll)
    style-presets/                   # Browse/manage art style presets
    billing/                        # Subscription, credit history
    settings/
  (public)/
    browse/                         # Public gallery (genre, rating, new)
    read/[storyId]/[chapterId]/     # Public cached reader
    share/[shareToken]/             # Unlisted sharing
  api/
    ai/                             # expand-story, generate-character, generate-prompts, generate-images
    auth/[...all]/                  # Better Auth catch-all (+ Polar webhooks)
    stories/[storyId]/rate/, comments/
    cron/poll-jobs/                 # Called by node-cron or external cron
```

## Cloudflare R2 File Paths

```
users/{userId}/stories/{storyId}/
  characters/{characterId}/{imageId}.png
  locations/{locationId}/{imageId}.png
  chapters/{chapterId}/sections/{sectionId}/{imageId}.png
```

Images served through Cloudflare CDN with `Cache-Control: public, max-age=31536000, immutable`.

## Caching Strategy

### Images
R2 images via Cloudflare CDN — immutable cache headers (new generations = new URLs).

### Story Data (public stories)
1. **v1**: In-memory LRU cache (`lru-cache`) keyed by `story:{storyId}`. Single-server only.
2. **v1.5**: Serialize reader payload to R2 JSON or Cloudflare KV on publish/update.
3. **v2**: Redis cache with TTL (when Redis added for BullMQ).

### Cache Invalidation Events
- Author edits story/characters/locations
- Author changes selected image for any section
- Author publishes/unpublishes a chapter
- Rating average changes (partial update only)

### Public Discovery
Materialized view or cached sorted list of public stories, refreshed every 5-10 min via cron.

## Auth Flow

Better Auth handles `user`, `session`, `account`, `verification` tables automatically.

- `hooks.server.ts` runs `auth.api.getSession()` on every request → populates `event.locals.session` and `event.locals.user`
- Polar.sh plugin handles subscriptions, checkout, and webhooks
- On Polar webhook (subscription renewal / top-up): add credits to `user.credits_remaining` + log in `credit_ledger`

## Important Technical Considerations

- **Rate limiting**: Per user, per endpoint — use `rate-limiter-flexible` or similar
- **Prompt injection**: Sanitize user story content before injecting into AI prompts
- **Image moderation**: Google API safety filters + own layer for flagged images
- **Credit locking**: Reserve credits BEFORE job starts, refund on failure. Never allow negative balance
- **Error recovery**: Partial failures (3/20 images fail) → retry only failed items
- **Job queue resilience**: node-cron dies on process restart. Use `process.on('SIGTERM')` for graceful shutdown. Consider external cron trigger for production.
- **Connection pooling**: Use pgBouncer or Neon pooler if deploying serverless