# Database Schema

Schema file: `src/lib/server/db/schema.ts` (Drizzle ORM)
Auth schema: `src/lib/server/db/auth.schema.ts` (auto-generated via `npm run auth:schema`)
Config: `drizzle.config.ts`

## Conventions

- **IDs**: Text UUIDs (`gen_random_uuid()`) as primary keys
- **Soft deletes**: `deleted_at` timestamp on core entities (story, character, location, chapter, section, story_comment). All queries MUST filter `WHERE deleted_at IS NULL`
- **Timestamps**: `created_at` and `updated_at` on most tables (defaults to `NOW()`)
- **JSONB**: Used for flexible metadata fields (`metadata`, `generation_params`, `error_log`, `google_operation_ids`)
- **Cascade**: `ON DELETE CASCADE` from user → story and parent → child relationships

## Entity Relationship Diagram

```
user (Better Auth, extended with credits_remaining)
 ├── credit_ledger
 └── story
      ├── style_preset (reusable art style templates)
      ├── character
      │    └── character_image (reference sheets, versioned)
      ├── location
      │    └── location_image (reference sheets, versioned)
      ├── chapter
      │    └── section
      │         ├── section_character (junction: characters in panel)
      │         ├── section_dialogue (per-bubble dialogue entries)
      │         └── section_image (generated panels, versioned)
      ├── story_rating (0-10, one per user, displayed as 0-5 half-stars)
      ├── story_comment (threaded, with spoiler tags)
      └── generation_job (bulk request tracking)
           └── api_usage_log (actual API costs)
```

## Tables

### Credits

- **user.credits_remaining** (INT) — added column on Better Auth user table
- **credit_ledger** — every credit change. Fields: `amount` (+/-), `balance_after`, `reason` (subscription_renewal | image_gen | text_gen | topup | refund), `reference_id` (links to job or Polar order)

### Style Presets

- **style_preset** — reusable art style templates. `user_id` NULL = system preset. Fields: `name`, `prompt_prefix` (prepended to all image prompts), `tags` (text array), `is_public`, `preview_image_url`

### Story

- **story** — main entity. Fields: `title`, `genre`, `art_style`, `style_preset_id`, `synopsis` (user input), `detailed_story` (AI expanded), `target_chapter_count`, `status` (draft → refining → scripting → generating → complete), `visibility` (private | unlisted | public), `share_token` (nanoid for unlisted), `style_prompt_prefix` (overrides preset), `metadata` (JSONB), `rating_avg` (cached decimal), `rating_count` (cached int)

### Characters & Locations

- **character** — `story_id`, `name`, `role` (main | supporting | antagonist | side), `description`, `visual_description`, `image_prompt`, `sort_order`, `metadata` (JSONB)
- **character_image** — `character_id`, `image_url`, `image_type` (reference | expression_sheet | pose_sheet), `version` (incremental), `is_primary`, `generation_job_id`, `generation_params` (JSONB)
- **location** / **location_image** — same pattern as character

### Chapters & Sections

- **chapter** — `story_id`, `chapter_number`, `title`, `summary`, `detailed_script`, `section_count`, `status` (draft → scripted → generating → complete), `sort_order`
- **section** — `chapter_id`, `section_number`, `narrative`, `image_prompt`, `image_prompt_full` (with style prefix + character refs injected), `panel_layout` (full | half | third | wide | tall), `location_id`, `status` (draft → prompt_ready → generating → complete)
- **section_character** — junction table. `section_id`, `character_id`, `costume_variant`, `emotion`. Unique on (section_id, character_id)
- **section_dialogue** — per-bubble entries. `section_id`, `character_id` (NULL for narration/SFX), `text`, `type` (speech | thought | narration | sfx | whisper | shout), `position_hint`, `sort_order`
- **section_image** — `section_id`, `image_url`, `version`, `is_selected` (user picks best), `generation_job_id`, `generation_params` (JSONB)

### Generation & Cost Tracking

- **generation_job** — `user_id`, `story_id`, `job_type` (character_sheet | location_sheet | section_panel | text_expansion), `status` (pending → submitted → processing → completed | failed | partial), `total_items`, `completed_items`, `failed_items`, `credits_reserved`, `credits_consumed`, `actual_cost_usd`, `google_operation_ids` (JSONB array), `error_log` (JSONB), `priority` (for future queue ordering)
- **api_usage_log** — per-request cost tracking. `generation_job_id`, `api_type` (text_generation | image_generation), `model_name`, `input_tokens`, `output_tokens`, `image_count`, `cost_usd`, `request_duration_ms`, `metadata`

### Social

- **story_rating** — `story_id`, `user_id`, `rating` (0-10 int, CHECK constraint). Unique on (story_id, user_id). Update `story.rating_avg` and `story.rating_count` on change.
- **story_comment** — `story_id`, `user_id`, `chapter_id` (optional), `parent_comment_id` (threading), `body`, `is_spoiler`. Soft delete.

## Credit Costs

| Action | Credits |
|---|---|
| AI story expansion (text) | 1 |
| Character/location description gen (text) | 1 |
| Image prompt generation (text) | 1 |
| Character reference sheet (1 image) | 5 |
| Location reference sheet (1 image) | 5 |
| Section panel image (1 image) | 3 |
| Panel regeneration | 3 |

## Subscription Tiers

| Plan | Price | Credits/mo | Limits |
|---|---|---|---|
| Free | $0 | 50 | 1 story, watermarked exports |
| Starter | $12/mo | 500 | 3 stories, no watermark |
| Pro | $29/mo | 1,500 | Unlimited stories, priority queue, bulk gen |
| Studio | $59/mo | 4,000 | Everything + API access, team sharing |

Top-ups: $5 = 200, $10 = 450, $25 = 1,200 credits (Polar.sh one-time products).
