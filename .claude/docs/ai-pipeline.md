# AI Pipeline

## Text Generation — Gemini 2.5 Pro

Location: `src/lib/server/ai/text.ts` (planned)

Uses `@google-cloud/vertexai` SDK or direct AI Studio API with `GOOGLE_API_KEY`.

### Prompt Chains

#### 1. Story Expansion
- **Input**: synopsis + genre + character names + chapter count
- **System**: "You are a professional manhwa scriptwriter..."
- **Output**: Detailed story with chapter breakdowns
- **Credits**: 1

#### 2. Character Description Generation
- **Input**: character name + role + story context
- **Output**: `{ description, visual_description, image_prompt }`
- The `visual_description` contains appearance details (hair, eyes, build, clothing)
- The `image_prompt` is ready for image generation (includes "character reference sheet, multiple angles" etc.)
- **Credits**: 1

#### 3. Location Description Generation
- Same pattern as characters but for environments/scenes
- **Credits**: 1

#### 4. Section Image Prompt Generation
- **Input**: story summary, chapter script, section narrative, section dialogue, characters in scene (with visual descriptions), location details, art style, previous section prompt (for continuity)
- **System**: Must incorporate exact character visual descriptions, maintain visual consistency, focus on composition/camera angle/mood/lighting/action
- **Output**: Single detailed image generation prompt
- **Credits**: 1

## Image Generation — Imagen 3

Location: `src/lib/server/ai/image.ts` + `src/lib/server/ai/image-batch.ts` (planned)

### Single Generation
For character sheets, location references, and regenerations. Synchronous API call.

### Batch Generation
For bulk panel generation (entire chapters). Uses Vertex AI Batch Prediction:
1. Write prompts to JSONL on GCS
2. Submit batch prediction job
3. Store operation IDs in `generation_job.google_operation_ids`
4. Poll for completion via node-cron (every 30 seconds)

### Image Prompt Assembly
The final prompt sent to Imagen is built from:
```
[style_prompt_prefix OR style_preset.prompt_prefix]
+ [section.image_prompt]
+ [character visual descriptions for characters in scene]
+ [location visual description]
```
Stored in `section.image_prompt_full`.

## Character Consistency Strategy

This is the hardest technical problem. Approach for v1:

1. **Detailed prompts + seed locking** — Always include full character visual descriptions in every prompt. Try to reuse seeds. ~60% consistency.
2. **Reference image injection** — Feed approved character reference sheet as image-to-image reference (Imagen 3 supports this to some degree).

Future (v2+):
3. Post-processing with inpainting for face/detail matching
4. LoRA fine-tuning per character (requires Flux/SD, not Imagen)

## Job Lifecycle

```
User triggers generation
  → Reserve credits (credit_ledger, negative amount)
  → Create generation_job (status: pending)
  → Submit to Google API (status: submitted → processing)
  → node-cron polls every 30s for completion
  → On success: download images → upload to R2 → update DB → consume credits
  → On failure: mark failed items → refund reserved credits
  → On partial: complete successful items, allow retry of failed ones
```

## Polling (node-cron)

Location: `src/lib/server/jobs/poll-generations.ts` (planned)

```
*/30 * * * * *  →  Check all generation_jobs WHERE status = 'processing'
                   For each: check Google operation status
                   Complete/fail as appropriate
```

Upgrade path: When >50 concurrent users, migrate to BullMQ + Redis worker process.
For production resilience, consider external cron trigger (e.g., Cloudflare Workers Cron) hitting `/api/cron/poll-jobs` instead of in-process node-cron.

## Cost Tracking

Every API call logs to `api_usage_log`:
- `api_type`: text_generation | image_generation
- `model_name`: gemini-2.5-pro | imagen-3
- `cost_usd`: actual Google API cost
- `request_duration_ms`: latency tracking

Use this data to build internal margin dashboard: actual spend per user vs credits consumed.
