# MangaForge — Detailed Build Plan

## 1. Product Overview

MangaForge (or "YourStory") is a SaaS that guides users through a structured pipeline: **Define → Refine → Generate → Assemble**. Users define stories and characters, AI expands them into detailed scripts, then generates panel-by-panel image prompts, and finally produces manga/manhwa pages.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | SvelteKit (SSR + API routes) |
| Auth + Billing | Better Auth with Polar.sh plugin (handles user/session/account tables + subscriptions/checkout/webhooks) |
| DB | PostgreSQL |
| ORM | Drizzle ORM |
| AI Text | Gemini 2.5 Pro (via Google Cloud Vertex AI / AI Studio direct) |
| AI Image | Imagen 3 (Google's image model — "Nano Banana 2" doesn't exist as a public model name, so confirm your exact model access; Imagen 3 is Google's current best for generation) |
| Image Storage | Cloudflare R2 (S3-compatible) |
| Scheduling | node-cron inside SvelteKit process (v1), migrate to BullMQ + Redis later |
| Hosting | Vercel / Railway / Fly.io (Node adapter for SvelteKit) |

> **Important note on image model:** Double-check what model you actually have access to. Google's image generation model through Vertex AI is **Imagen 3**. "Nano Banana 2" isn't a publicly documented model name — you might be confusing it with an internal codename or a different provider. This matters because your entire product depends on consistent character generation, and not all models support character consistency well. You may need to look into reference image injection or IP-adapter style workflows if native consistency isn't sufficient.

---

## 3. Core Pipeline (User Flow)

```
┌─────────────────────────────────────────────────────────┐
│  PHASE 1: DEFINE                                        │
│  User inputs: title, genre, synopsis, characters,       │
│  locations, art style preferences                       │
├─────────────────────────────────────────────────────────┤
│  PHASE 2: REFINE                                        │
│  AI expands synopsis → full detailed story              │
│  User sets chapter count + pages per chapter             │
│  AI generates character descriptions + visual prompts   │
│  AI generates location/scene descriptions               │
│  User generates character reference sheets (images)     │
│  User generates scene reference sheets (images)         │
├─────────────────────────────────────────────────────────┤
│  PHASE 3: SCRIPT                                        │
│  Story is split into Chapters                           │
│  Each Chapter is split into Sections (panels/beats)     │
│  AI writes detailed script per section                  │
│  AI generates image prompt per section                  │
│  User reviews/edits prompts                             │
├─────────────────────────────────────────────────────────┤
│  PHASE 4: GENERATE                                      │
│  Bulk image generation requests fired                   │
│  Polling/webhooks collect results                       │
│  Images stored on Cloudflare R2                         │
│  User reviews, regenerates rejects                      │
├─────────────────────────────────────────────────────────┤
│  PHASE 5: ASSEMBLE (v2 feature)                         │
│  Arrange panels into manga page layouts                 │
│  Add speech bubbles / text overlays                     │
│  Export as PDF / image sequence                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema

Better Auth manages: `user`, `session`, `account`, `verification`. You don't touch those. Below are the application tables.

### 4.1 Schema Diagram

```
user (better-auth, extended with credits_remaining column)
 ├── credit_ledger (tracks every credit change)
 └── story
      ├── style_preset (reusable art style templates)
      ├── character
      │    └── character_image (reference sheets)
      ├── location
      │    └── location_image (reference sheets)
      ├── chapter
      │    └── section
      │         ├── section_character (junction: which characters appear)
      │         ├── section_dialogue (per-bubble dialogue entries)
      │         └── section_image (generated panels)
      ├── story_rating (user ratings 0-10, half-star)
      ├── story_comment (reader comments)
      └── generation_job (bulk request tracking)
           └── api_usage_log (actual Google API costs)
```

> **Soft deletes:** All core entities (story, character, location, chapter, section) use a `deleted_at` column instead of hard deletes. Queries must filter `WHERE deleted_at IS NULL`.

### 4.2 Table Definitions

```sql
-- ============================================
-- CREDITS (subscription/plan managed entirely by Better Auth + Polar.sh plugin)
-- ============================================

-- Credit balance lives directly on the user. Polar webhook fires on
-- subscription renewal or one-time top-up purchase → you add credits.
-- That's the only integration point with billing.

-- Add this column to the Better Auth "user" table via Drizzle migration:
-- ALTER TABLE "user" ADD COLUMN credits_remaining INT NOT NULL DEFAULT 0;

CREATE TABLE credit_ledger (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES "user"(id),
    amount INT NOT NULL,                      -- positive = credit added, negative = credit spent
    balance_after INT NOT NULL,
    reason TEXT NOT NULL,                     -- 'subscription_renewal' | 'image_gen' | 'text_gen' | 'topup' | 'refund'
    reference_id TEXT,                        -- links to generation_job.id or Polar order ID
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- STYLE PRESETS (reusable art style templates)
-- ============================================

CREATE TABLE style_preset (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT REFERENCES "user"(id),       -- NULL = system preset, non-null = user-created
    name TEXT NOT NULL,                        -- 'Dark Manhwa', 'Soft Watercolor Shojo', etc.
    description TEXT,                          -- human-readable description of the style
    prompt_prefix TEXT NOT NULL,               -- the actual prompt text prepended to all image prompts
    tags TEXT[] DEFAULT '{}',                  -- 'manhwa', 'shonen', 'realistic', 'chibi', etc.
    is_public BOOLEAN DEFAULT FALSE,           -- system presets are public, user presets are private by default
    preview_image_url TEXT,                    -- example image showing this style
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_style_preset_user ON style_preset(user_id);

-- ============================================
-- STORY
-- ============================================

CREATE TABLE story (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    genre TEXT,                               -- 'fantasy' | 'romance' | 'action' | 'horror' | etc.
    art_style TEXT,                           -- 'manhwa' | 'manga_shonen' | 'manga_seinen' | 'webtoon' | etc.
    style_preset_id TEXT REFERENCES style_preset(id), -- links to reusable style preset
    synopsis TEXT,                            -- user's initial short synopsis
    detailed_story TEXT,                      -- AI-expanded full story
    target_chapter_count INT,
    status TEXT DEFAULT 'draft',             -- 'draft' | 'refining' | 'scripting' | 'generating' | 'complete'
    visibility TEXT DEFAULT 'private',       -- 'private' | 'unlisted' | 'public'
    share_token TEXT,                         -- unique token for unlisted sharing (e.g. nanoid)
    style_prompt_prefix TEXT,                -- global style instructions prepended to all image prompts (overrides preset if set)
    metadata JSONB DEFAULT '{}',             -- flexible: themes, tone, setting era, etc.
    rating_avg DECIMAL(3,1) DEFAULT 0,       -- cached average rating (0.0 - 10.0) for fast reads
    rating_count INT DEFAULT 0,              -- cached total number of ratings
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP                     -- soft delete: NULL = active, set = deleted
);

CREATE INDEX idx_story_user ON story(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_story_public ON story(visibility, rating_avg DESC) WHERE deleted_at IS NULL AND visibility = 'public';
CREATE UNIQUE INDEX idx_story_share_token ON story(share_token) WHERE share_token IS NOT NULL;

-- ============================================
-- CHARACTER
-- ============================================

CREATE TABLE character (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'main',                -- 'main' | 'supporting' | 'antagonist' | 'side'
    description TEXT,                         -- AI-generated detailed personality/background
    visual_description TEXT,                  -- AI-generated appearance details (hair, eyes, build, clothing)
    image_prompt TEXT,                        -- the actual prompt used to generate reference sheet
    sort_order INT DEFAULT 0,
    metadata JSONB DEFAULT '{}',             -- age, abilities, relationships, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP                     -- soft delete
);

CREATE TABLE character_image (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id TEXT NOT NULL REFERENCES character(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,                  -- R2 URL
    image_type TEXT DEFAULT 'reference',     -- 'reference' | 'expression_sheet' | 'pose_sheet'
    version INT NOT NULL DEFAULT 1,          -- incremental version number for chronological ordering
    is_primary BOOLEAN DEFAULT FALSE,
    generation_job_id TEXT,
    generation_params JSONB DEFAULT '{}',    -- full generation config: prompt, seed, guidance_scale, aspect_ratio, model_version, negative_prompt
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- LOCATION / SCENE
-- ============================================

CREATE TABLE location (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,                         -- narrative description
    visual_description TEXT,                  -- visual/atmospheric details
    image_prompt TEXT,
    metadata JSONB DEFAULT '{}',             -- time of day variants, mood, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP                     -- soft delete
);

CREATE TABLE location_image (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id TEXT NOT NULL REFERENCES location(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type TEXT DEFAULT 'reference',     -- 'reference' | 'day' | 'night' | 'destroyed' etc.
    version INT NOT NULL DEFAULT 1,
    is_primary BOOLEAN DEFAULT FALSE,
    generation_job_id TEXT,
    generation_params JSONB DEFAULT '{}',    -- full generation config
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CHAPTER
-- ============================================

CREATE TABLE chapter (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
    chapter_number INT NOT NULL,
    title TEXT,
    summary TEXT,                             -- AI-generated chapter summary
    detailed_script TEXT,                     -- full chapter narrative
    section_count INT,                        -- how many panels/sections
    status TEXT DEFAULT 'draft',             -- 'draft' | 'scripted' | 'generating' | 'complete'
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP                     -- soft delete
);

CREATE INDEX idx_chapter_story ON chapter(story_id);

-- ============================================
-- SECTION (individual panel/beat within a chapter)
-- ============================================

CREATE TABLE section (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id TEXT NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
    section_number INT NOT NULL,
    narrative TEXT,                           -- what happens in this beat (story text)
    image_prompt TEXT,                        -- AI-generated prompt for image generation
    image_prompt_full TEXT,                   -- final prompt with style prefix + character refs injected
    panel_layout TEXT DEFAULT 'full',        -- 'full' | 'half' | 'third' | 'wide' | 'tall' (for future layout)
    location_id TEXT REFERENCES location(id),
    sort_order INT DEFAULT 0,
    status TEXT DEFAULT 'draft',             -- 'draft' | 'prompt_ready' | 'generating' | 'complete'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP                     -- soft delete
);

CREATE INDEX idx_section_chapter ON section(chapter_id);

-- Junction table: which characters appear in which section
-- Enables querying "all panels where Character X appears"
CREATE TABLE section_character (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id TEXT NOT NULL REFERENCES section(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL REFERENCES character(id) ON DELETE CASCADE,
    costume_variant TEXT,                    -- optional: 'battle_armor', 'casual', 'disguise' etc.
    emotion TEXT,                            -- optional: 'angry', 'sad', 'smiling', 'shocked'
    UNIQUE(section_id, character_id)
);

CREATE INDEX idx_section_char_character ON section_character(character_id);

-- Per-bubble dialogue entries for each section
-- Supports multiple speakers, narration, SFX per panel
CREATE TABLE section_dialogue (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id TEXT NOT NULL REFERENCES section(id) ON DELETE CASCADE,
    character_id TEXT REFERENCES character(id), -- NULL for narration / sound effects
    text TEXT NOT NULL,
    type TEXT DEFAULT 'speech',              -- 'speech' | 'thought' | 'narration' | 'sfx' | 'whisper' | 'shout'
    position_hint TEXT,                      -- 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_section_dialogue_section ON section_dialogue(section_id);

CREATE TABLE section_image (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id TEXT NOT NULL REFERENCES section(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,          -- incremental version for chronological ordering
    is_selected BOOLEAN DEFAULT FALSE,       -- user picks the best one
    generation_job_id TEXT,
    generation_params JSONB DEFAULT '{}',    -- full config: prompt, seed, guidance_scale, aspect_ratio, model_version
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- GENERATION JOB (bulk request tracking)
-- ============================================

CREATE TABLE generation_job (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES "user"(id),
    story_id TEXT NOT NULL REFERENCES story(id),
    job_type TEXT NOT NULL,                   -- 'character_sheet' | 'location_sheet' | 'section_panel' | 'text_expansion'
    status TEXT DEFAULT 'pending',           -- 'pending' | 'submitted' | 'processing' | 'completed' | 'failed' | 'partial'
    total_items INT DEFAULT 0,
    completed_items INT DEFAULT 0,
    failed_items INT DEFAULT 0,
    credits_reserved INT DEFAULT 0,          -- credits locked when job starts
    credits_consumed INT DEFAULT 0,          -- actual credits used
    actual_cost_usd DECIMAL(10,6) DEFAULT 0, -- real Google API cost for margin tracking
    google_operation_ids JSONB DEFAULT '[]', -- track Vertex AI async operation IDs
    error_log JSONB DEFAULT '[]',
    priority INT DEFAULT 0,                  -- (future) higher = processed first, for paid tier priority queuing
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_genjob_status ON generation_job(status);
CREATE INDEX idx_genjob_user ON generation_job(user_id);

-- Per-request API cost tracking for margin analysis
CREATE TABLE api_usage_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_job_id TEXT NOT NULL REFERENCES generation_job(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    api_type TEXT NOT NULL,                   -- 'text_generation' | 'image_generation'
    model_name TEXT NOT NULL,                 -- 'gemini-2.5-pro' | 'imagen-3' etc.
    input_tokens INT,                         -- for text models
    output_tokens INT,                        -- for text models
    image_count INT,                          -- for image models
    cost_usd DECIMAL(10,6) NOT NULL,         -- actual cost of this single API call
    request_duration_ms INT,                  -- how long the API call took
    metadata JSONB DEFAULT '{}',             -- any extra info: resolution, aspect_ratio, etc.
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user ON api_usage_log(user_id, created_at);
CREATE INDEX idx_api_usage_job ON api_usage_log(generation_job_id);

-- ============================================
-- RATINGS & COMMENTS (for public stories)
-- ============================================

-- Rating: 0 to 10 in integer steps, displayed as 0-5 stars in half-star increments
-- e.g. rating 7 = 3.5 stars, rating 10 = 5 stars
CREATE TABLE story_rating (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 0 AND rating <= 10), -- 0-10, displayed as 0-5 stars in 0.5 steps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(story_id, user_id)                -- one rating per user per story
);

CREATE INDEX idx_story_rating_story ON story_rating(story_id);

CREATE TABLE story_comment (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    chapter_id TEXT REFERENCES chapter(id),   -- optional: comment on a specific chapter (NULL = general comment)
    parent_comment_id TEXT REFERENCES story_comment(id), -- for threaded replies
    body TEXT NOT NULL,
    is_spoiler BOOLEAN DEFAULT FALSE,        -- user can mark comment as containing spoilers
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP                     -- soft delete
);

CREATE INDEX idx_story_comment_story ON story_comment(story_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_story_comment_parent ON story_comment(parent_comment_id);
```

---

## 5. Credit System & Pricing

### Cost Structure (estimate your actual API costs)

| Action | Credits | Approx Google Cost |
|---|---|---|
| AI story expansion (text, ~2k tokens out) | 1 | ~$0.005 |
| Character/location description gen (text) | 1 | ~$0.003 |
| Image prompt generation (text) | 1 | ~$0.003 |
| Character reference sheet (1 image) | 5 | ~$0.04 |
| Location reference sheet (1 image) | 5 | ~$0.04 |
| Section panel image (1 image) | 3 | ~$0.03 |
| Panel regeneration | 3 | ~$0.03 |

### Subscription Tiers

| Plan | Monthly Price | Credits/mo | Extras |
|---|---|---|---|
| Free | $0 | 50 | 1 story, watermarked exports |
| Starter | $12/mo | 500 | 3 stories, no watermark |
| Pro | $29/mo | 1,500 | Unlimited stories, priority queue, bulk gen |
| Studio | $59/mo | 4,000 | Everything + API access, team sharing |

Credit top-ups: $5 = 200 credits, $10 = 450, $25 = 1,200. (Set up as one-time products in Polar.sh)

> **Key business logic:** Always reserve credits BEFORE submitting generation jobs. If job fails, refund to ledger. This prevents overdraft.
> 
> **Polar.sh integration:** Better Auth's Polar plugin handles subscriptions, checkout, and webhooks. The only thing you do on your end is: when a Polar webhook fires (subscription renewal or one-time top-up purchase), add the corresponding credits to `user.credits_remaining` and log it in `credit_ledger`. That's it.

---

## 6. Google Cloud API Integration

### 6.1 Why Direct (not aggregator)

- **Batch API** — Vertex AI supports batch prediction. You can submit many prompts as a batch job and get results asynchronously. This is significantly cheaper (often 50% discount) and avoids rate limits.
- **Control** — you set your own quotas, retries, and can negotiate committed use discounts.

### 6.2 Text Generation (Gemini 2.5 Pro)

```typescript
// lib/server/ai/text.ts
import { VertexAI } from '@google-cloud/vertexai';

const vertex = new VertexAI({ project: 'your-project', location: 'us-central1' });
const model = vertex.getGenerativeModel({ model: 'gemini-2.5-pro' });

export async function expandStory(synopsis: string, genre: string, chapterCount: number) {
    const prompt = `You are a professional manga/manhwa story writer...
    [system instructions for structure, pacing, detail level]
    
    Genre: ${genre}
    Target chapters: ${chapterCount}
    Synopsis: ${synopsis}
    
    Write a detailed story outline...`;
    
    const result = await model.generateContent(prompt);
    return result.response.text();
}
```

### 6.3 Image Generation (Batch Strategy)

For bulk panel generation, use **Vertex AI Batch Prediction**:

```typescript
// lib/server/ai/image-batch.ts
import { PredictionServiceClient } from '@google-cloud/aiplatform';

export async function submitBatchImageJob(prompts: { id: string; prompt: string }[]) {
    // 1. Write prompts to a JSONL file on GCS
    // 2. Submit batch prediction job
    // 3. Store operation ID in generation_job.google_operation_ids
    // 4. Return job ID for polling
}
```

For single/small generations (character sheets, regenerations), use synchronous API calls.

### 6.4 Polling with node-cron

```typescript
// lib/server/jobs/poll-generations.ts
import cron from 'node-cron';

// Poll every 30 seconds for pending batch jobs
cron.schedule('*/30 * * * * *', async () => {
    const pendingJobs = await db.select()
        .from(generationJob)
        .where(eq(generationJob.status, 'processing'));
    
    for (const job of pendingJobs) {
        // Check Google operation status
        // If complete: download images → upload to R2 → update DB → update credits
        // If failed: mark failed items, refund reserved credits
    }
});
```

> **When to upgrade from node-cron:** When you have >50 concurrent users generating simultaneously, move to a separate worker process with BullMQ + Redis. For launch and early traction, node-cron inside SvelteKit is fine.

---

## 7. Cloudflare R2 Integration

```typescript
// lib/server/storage/r2.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY }
});

export async function uploadImage(buffer: Buffer, path: string): Promise<string> {
    await r2.send(new PutObjectCommand({
        Bucket: 'mangaforge-images',
        Key: path, // e.g. "users/{userId}/stories/{storyId}/characters/{charId}/ref-001.png"
        Body: buffer,
        ContentType: 'image/png',
    }));
    return `https://images.mangaforge.app/${path}`; // R2 custom domain
}
```

**File path convention:**

```
users/{userId}/stories/{storyId}/
    characters/{characterId}/{imageId}.png
    locations/{locationId}/{imageId}.png
    chapters/{chapterId}/sections/{sectionId}/{imageId}.png
```

---

## 8. Caching Strategy for Public Stories

Public stories will be read far more than they're written. Without caching, every reader hits PostgreSQL on every page load. The strategy:

### 8.1 Cloudflare CDN Layer (images)

R2 images served through a Cloudflare custom domain already get CDN caching. Set `Cache-Control: public, max-age=31536000, immutable` on all generated images since they never change (new generations get new URLs).

### 8.2 Application-Level Caching (story data)

For public stories, cache the full reader payload (story metadata + chapters + sections + selected images) as a single JSON blob. Options in order of complexity:

1. **SvelteKit in-memory cache (v1)** — Use a simple LRU cache (e.g., `lru-cache` npm package) in your SvelteKit server. Cache the full story reader response keyed by `story:{storyId}`. Invalidate on any edit. This works for a single server instance.

2. **Cloudflare KV or R2 JSON (v1.5)** — When a story is published/updated, serialize the entire reader payload to a JSON file on R2 or write it to Cloudflare KV. The reader route fetches from KV/R2 first, falls back to DB. Near-zero latency, pennies in cost.

3. **Redis (v2)** — When you add Redis for BullMQ, also use it for caching. Cache story reader payloads with a TTL. Invalidate on edits.

### 8.3 Cache Invalidation

Invalidation events (clear cache for story when any of these happen):
- Author edits story metadata, characters, locations
- Author changes selected image for any section
- Author publishes or unpublishes a chapter
- Rating average changes (update the cached rating_avg/rating_count only, not the full payload)

### 8.4 Public Story Listing / Discovery

For the public gallery/browse page, maintain a materialized view or cached sorted list of public stories with their `rating_avg`, `rating_count`, genre, and cover image. Refresh this every 5-10 minutes via cron rather than computing it on every page load.

---

## 9. Key AI Prompt Chains

### 9.1 Story Expansion

```
Input: synopsis + genre + character names + chapter count
System: "You are a professional manhwa scriptwriter..."
Output: Detailed story with chapter breakdowns
```

### 9.2 Character Description Generation

```
Input: character name + role + story context
System: "Generate a detailed visual character description for manga art..."
Output: {
    description: "personality, background...",
    visual_description: "5'8, silver hair in a low ponytail, sharp amber eyes,
                         lean athletic build, wears a black military coat with
                         gold epaulets...",
    image_prompt: "manga character reference sheet, silver-haired young man,
                   amber eyes, lean build, black military coat, gold epaulets,
                   multiple angles, full body front and side view, expression
                   variations, manhwa art style, clean linework, white background"
}
```

### 9.3 Section Image Prompt Generation

This is the critical chain — it must be context-aware:

```
Input: {
    story_summary: "...",
    chapter_script: "...",
    section_narrative: "...",
    section_dialogue: "...",
    characters_in_scene: [{ name, visual_description, image_prompt }],
    location: { name, visual_description },
    art_style: "manhwa, digital painting, dramatic lighting",
    previous_section_prompt: "..." // for visual continuity
}

System: "You generate image prompts for manga/manhwa panels. 
         You MUST incorporate the exact character visual descriptions provided.
         You MUST maintain visual consistency with previous panels.
         Focus on: composition, camera angle, mood, lighting, action.
         Output a single detailed image generation prompt."

Output: "dramatic wide shot, interior of a dimly lit throne room with tall
         gothic pillars, silver-haired young man (amber eyes, black military
         coat with gold epaulets) standing defiantly before a massive obsidian
         throne, a shadowed figure sitting on the throne, tension in the air,
         dramatic uplighting from floor torches, manhwa art style, detailed
         linework, cinematic composition, cold blue and warm orange contrast"
```

### 9.4 The Character Consistency Problem

**This is your biggest technical challenge.** Current text-to-image models (including Imagen) struggle to maintain character consistency across many images. Your options:

1. **Detailed prompts + seed locking** — always include full character visual descriptions, try to reuse seeds. Works ~60% of the time.
2. **Reference image injection** — if your chosen model supports image-to-image or style reference, feed the approved character sheet as a reference. Imagen 3 supports this to some degree.
3. **Post-processing with inpainting** — generate the scene, then inpaint faces/details to match reference.
4. **Hybrid approach (recommended for v2)** — use LoRA fine-tuning per character on a model that supports it (not available on Imagen natively — may need to consider Flux or SD for this specifically).

For v1, go with option 1+2 and accept some inconsistency. Users will understand this as an early product limitation.

---

## 10. SvelteKit Route Structure

```
src/routes/
├── (auth)/
│   ├── login/
│   └── register/
├── (app)/
│   ├── dashboard/                    -- list stories, credit balance, quick stats
│   ├── story/
│   │   ├── new/                      -- create story wizard (Phase 1: Define)
│   │   └── [storyId]/
│   │       ├── +page.svelte          -- story overview & status
│   │       ├── edit/                  -- edit synopsis, settings, style preset
│   │       ├── characters/
│   │       │   ├── +page.svelte      -- list characters
│   │       │   └── [characterId]/    -- edit character, generate sheets, view version history
│   │       ├── locations/
│   │       │   ├── +page.svelte
│   │       │   └── [locationId]/
│   │       ├── refine/               -- Phase 2: AI expansion, review
│   │       ├── chapters/
│   │       │   └── [chapterId]/
│   │       │       ├── +page.svelte  -- chapter script view
│   │       │       ├── sections/     -- section editor with prompts + dialogue bubbles
│   │       │       └── generate/     -- trigger bulk image gen
│   │       ├── generate/             -- bulk generation dashboard
│   │       └── reader/               -- private preview manga reader (vertical scroll)
│   ├── style-presets/                -- browse & manage style presets
│   ├── billing/                      -- subscription management, credit history
│   └── settings/
├── (public)/
│   ├── browse/                       -- public gallery: discover stories by genre, rating, new
│   ├── read/
│   │   └── [storyId]/               -- public manga reader (cached)
│   │       └── [chapterId]/         -- read specific chapter
│   └── share/
│       └── [shareToken]/            -- unlisted sharing via token
├── api/
│   ├── ai/
│   │   ├── expand-story/+server.ts
│   │   ├── generate-character/+server.ts
│   │   ├── generate-prompts/+server.ts
│   │   └── generate-images/+server.ts
│   ├── auth/
│   │   └── [...all]/+server.ts       -- Better Auth catch-all (handles Polar webhooks automatically)
│   ├── stories/
│   │   └── [storyId]/
│   │       ├── rate/+server.ts       -- POST rating (0-10)
│   │       └── comments/+server.ts   -- GET/POST comments
│   └── cron/
│       └── poll-jobs/+server.ts      -- called by node-cron or external cron
```

---

## 11. Things You're Missing / Should Consider

### 11.1 Must-haves for launch

- **Rate limiting** — per user, per endpoint. Use `rate-limiter-flexible` or similar. Without this, one user can drain your Google Cloud budget.
- **Prompt injection protection** — users will input story content that goes into AI prompts. Sanitize and sandbox. Don't let user content override system instructions.
- **Image moderation** — Google's API has built-in safety filters, but add your own layer. Store flagged images separately, don't serve them.
- **Optimistic credit locking** — deduct credits BEFORE job starts, refund on failure. Never let balance go negative.
- **Error recovery** — if image generation partially fails (3 of 20 images), let users retry just the failed ones without re-running everything.

### 11.2 Important for retention

- **Version history** — users will regenerate images many times. All images are stored with `version` numbers (see schema). Build a UI to compare versions side-by-side and switch selections.
- **Manual prompt editing** — always let users edit AI-generated prompts before image generation. Power users will want this.
- **Undo/revert** — at every phase. Users will want to go back and change a character description, which should cascade a warning about affected sections.
- **Export** — even basic PDF/image-zip export is critical for v1. Users want to take their work elsewhere.
- **Progress saving** — auto-save everything. Losing work = churn.

### 11.3 Technical considerations

- **Job queue resilience** — if your SvelteKit process restarts, node-cron jobs die. Use `process.on('SIGTERM')` to gracefully handle in-flight jobs. For production, strongly consider an external cron trigger (e.g., Cloudflare Workers Cron Trigger hitting your `/api/cron/poll-jobs` endpoint) instead of in-process node-cron.
- **Database connection pooling** — use connection pooling (e.g., Supabase pgBouncer, or Neon's pooler) if deploying serverless.
- **Image CDN** — serve R2 images through Cloudflare CDN with cache headers. Don't serve from R2 directly in hot paths.
- **Cascade considerations** — when a user edits a character description mid-way through, flag all sections containing that character as "stale" (queryable via `section_character` junction table) so they know to regenerate.
- **Margin monitoring** — use `api_usage_log` to build an internal dashboard tracking actual Google API spend per user vs credits consumed. Alert if margins drop below threshold.

### 11.4 Future features (v2+)

- **Panel layout editor** — drag-and-drop panels into manga page layouts with speech bubbles and text overlays.
- **Text-in-image** — either overlay text post-generation or use inpainting to add speech bubbles. The `section_dialogue` table already stores per-bubble data with position hints for this.
- **Collaborative editing** — multiple users on one story.
- **Community gallery enhancements** — featured stories, genre browsing, follow authors, reading lists.
- **Fine-tuned character models** — per-story LoRA training for perfect consistency (premium feature).
- **Translation** — auto-translate dialogue for multi-language publishing.
- **Job queue priority** — the `generation_job.priority` column is already in the schema. Implement priority-based processing when moving to BullMQ so Pro/Studio users get faster generation.
- **Google webhooks** — replace polling with Vertex AI completion callbacks as primary, keep polling as fallback.

---

## 12. Development Roadmap

| Phase | Duration | Deliverables |
|---|---|---|
| **Phase 0: Setup** | 1 week | SvelteKit scaffold, Better Auth + Polar.sh plugin, Drizzle + Postgres, R2 bucket, Google Cloud project + API keys |
| **Phase 1: Story + Characters** | 2 weeks | Story CRUD (with soft deletes), character/location CRUD, style preset system, AI story expansion, AI character/location description generation |
| **Phase 2: Scripting Engine** | 2 weeks | Chapter splitting logic, section breakdown, section_character + section_dialogue management, AI prompt generation chain, prompt editing UI |
| **Phase 3: Image Generation** | 2 weeks | Single image gen, batch job system, polling, R2 upload pipeline, generation dashboard, version history UI, generation_params + api_usage_log tracking |
| **Phase 4: Reader + Export** | 1 week | Vertical scroll manga reader, basic PDF export, image download |
| **Phase 5: Billing** | 3-4 days | Polar.sh plans + top-up products in dashboard, webhook handler to add credits, credit deduction logic, margin dashboard (api_usage_log) |
| **Phase 6: Public + Social** | 1-2 weeks | Story visibility/sharing, public reader with caching, browse/discovery page, ratings (0-10 half-star), comments with threading + spoiler tags |
| **Phase 7: Polish + Launch** | 1-2 weeks | Error handling, loading states, onboarding flow, landing page, cache invalidation testing, beta launch |

**Total: ~12-14 weeks solo developer.**

---

## 13. Estimated Monthly Infrastructure Costs (at 100 active users)

| Service | Estimated Cost |
|---|---|
| PostgreSQL (Neon/Supabase free → $25) | $0–25 |
| SvelteKit hosting (Railway/Fly) | $5–20 |
| Cloudflare R2 (10GB storage, 1M reads) | ~$1–3 |
| Google Cloud AI (variable, depends on usage) | $200–800 |
| Polar.sh fees (4% + $0.40 per transaction) | variable |
| Domain + misc | $15 |
| **Total** | **~$250–900** |

Your break-even at $29/mo Pro plan is roughly 10-30 paying users depending on their generation volume. The key lever is managing AI costs — batch prediction discounts and caching common prompts will be critical.

---

## 14. Final Advice

**Get Phase 1-3 working as fast as possible with a rough UI, and test the AI output quality before polishing anything.** If the image consistency or prompt quality isn't good enough, nothing else matters. Validate the core AI pipeline first.
