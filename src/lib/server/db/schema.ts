/**
 * Application database schema (Drizzle ORM).
 *
 * Defines all app-specific tables, their columns, indexes, and Drizzle relations.
 * Auth tables are auto-generated in auth.schema.ts and re-exported here.
 *
 * Convention: core entities use soft deletes via `deleted_at` column.
 */
import {
	pgTable,
	text,
	integer,
	timestamp,
	jsonb,
	boolean,
	numeric,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { user } from './auth.schema';

export * from './auth.schema';

// ─── User Credits (extends Better Auth user) ────────────────────────────────

/** Tracks each user's credit balances — subscription (monthly, expiring) and purchased (permanent). */
export const userCredits = pgTable('user_credits', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	subscriptionCredits: integer('subscription_credits').notNull().default(50),
	purchasedCredits: integer('purchased_credits').notNull().default(0),
	planName: text('plan_name').notNull().default('Free'),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date())
});

export const userCreditsRelations = relations(userCredits, ({ one }) => ({
	user: one(user, { fields: [userCredits.userId], references: [user.id] })
}));

// ─── Credit Ledger ──────────────────────────────────────────────────────────

/** Append-only ledger recording every credit debit/credit with running balances. */
export const creditLedger = pgTable(
	'credit_ledger',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		amount: integer('amount').notNull(),
		creditType: text('credit_type').notNull(), // subscription | purchased
		balanceAfterSubscription: integer('balance_after_subscription').notNull(),
		balanceAfterPurchased: integer('balance_after_purchased').notNull(),
		reason: text('reason').notNull(), // subscription_renewal | subscription_expiry | image_gen | text_gen | topup | refund
		referenceId: text('reference_id'),
		expiresAt: timestamp('expires_at'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('credit_ledger_userId_idx').on(table.userId)]
);

// ─── Style Presets ──────────────────────────────────────────────────────────

/** Reusable art-style prompt prefixes (e.g. "dark manhwa", "soft watercolor shojo"). */
export const stylePreset = pgTable('style_preset', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	promptPrefix: text('prompt_prefix').notNull(),
	tags: text('tags').array(),
	isPublic: boolean('is_public').notNull().default(false),
	previewImageUrl: text('preview_image_url'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

// ─── Story ──────────────────────────────────────────────────────────────────

/** Top-level entity: a manga/manhwa project. Holds synopsis, AI-expanded narrative, and status. */
export const story = pgTable(
	'story',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		genre: text('genre'),
		artStyle: text('art_style'),
		stylePresetId: text('style_preset_id').references(() => stylePreset.id),
		synopsis: text('synopsis'),
		detailedStory: text('detailed_story'),
		targetChapterCount: integer('target_chapter_count').default(5),
		status: text('status').notNull().default('draft'), // draft | refining | scripting | generating | complete
		visibility: text('visibility').notNull().default('private'), // private | unlisted | public
		shareToken: text('share_token'),
		stylePromptPrefix: text('style_prompt_prefix'),
		metadata: jsonb('metadata'),
		ratingAvg: numeric('rating_avg'),
		ratingCount: integer('rating_count').default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp('deleted_at')
	},
	(table) => [index('story_userId_idx').on(table.userId)]
);

export const storyRelations = relations(story, ({ one, many }) => ({
	user: one(user, { fields: [story.userId], references: [user.id] }),
	stylePreset: one(stylePreset, { fields: [story.stylePresetId], references: [stylePreset.id] }),
	characters: many(character),
	locations: many(location),
	chapters: many(chapter)
}));

// ─── Character ──────────────────────────────────────────────────────────────

/** A character belonging to a story, with text descriptions and an AI image prompt. */
export const character = pgTable(
	'character',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		storyId: text('story_id')
			.notNull()
			.references(() => story.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		role: text('role').notNull().default('supporting'), // main | supporting | antagonist | side
		description: text('description'),
		visualDescription: text('visual_description'),
		imagePrompt: text('image_prompt'),
		sortOrder: integer('sort_order').notNull().default(0),
		metadata: jsonb('metadata'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp('deleted_at')
	},
	(table) => [index('character_storyId_idx').on(table.storyId)]
);

export const characterRelations = relations(character, ({ one, many }) => ({
	story: one(story, { fields: [character.storyId], references: [story.id] }),
	images: many(characterImage)
}));

/** Generated reference images for a character (multiple versions, one primary). */
export const characterImage = pgTable('character_image', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	characterId: text('character_id')
		.notNull()
		.references(() => character.id, { onDelete: 'cascade' }),
	imageId: text('image_id'),
	imageType: text('image_type').notNull().default('reference'), // reference | expression_sheet | pose_sheet
	prompt: text('prompt'),
	status: text('status').notNull().default('complete'), // queued | generating | complete | failed
	version: integer('version').notNull().default(1),
	isPrimary: boolean('is_primary').notNull().default(false),
	generationJobId: text('generation_job_id'),
	generationParams: jsonb('generation_params'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const characterImageRelations = relations(characterImage, ({ one }) => ({
	character: one(character, {
		fields: [characterImage.characterId],
		references: [character.id]
	})
}));

// ─── Location ───────────────────────────────────────────────────────────────

/** A story location/scene with text and visual descriptions. */
export const location = pgTable(
	'location',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		storyId: text('story_id')
			.notNull()
			.references(() => story.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		visualDescription: text('visual_description'),
		imagePrompt: text('image_prompt'),
		sortOrder: integer('sort_order').notNull().default(0),
		metadata: jsonb('metadata'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp('deleted_at')
	},
	(table) => [index('location_storyId_idx').on(table.storyId)]
);

export const locationRelations = relations(location, ({ one, many }) => ({
	story: one(story, { fields: [location.storyId], references: [story.id] }),
	images: many(locationImage)
}));

/** Generated reference images for a location (multiple versions, one primary). */
export const locationImage = pgTable('location_image', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	locationId: text('location_id')
		.notNull()
		.references(() => location.id, { onDelete: 'cascade' }),
	imageId: text('image_id'),
	imageType: text('image_type').notNull().default('reference'),
	prompt: text('prompt'),
	status: text('status').notNull().default('complete'), // queued | generating | complete | failed
	version: integer('version').notNull().default(1),
	isPrimary: boolean('is_primary').notNull().default(false),
	generationJobId: text('generation_job_id'),
	generationParams: jsonb('generation_params'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const locationImageRelations = relations(locationImage, ({ one }) => ({
	location: one(location, { fields: [locationImage.locationId], references: [location.id] })
}));

// ─── Chapter ────────────────────────────────────────────────────────────────

/** A chapter within a story. Contains a summary (from outline) and optionally a detailed script. */
export const chapter = pgTable(
	'chapter',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		storyId: text('story_id')
			.notNull()
			.references(() => story.id, { onDelete: 'cascade' }),
		chapterNumber: integer('chapter_number').notNull(),
		title: text('title'),
		summary: text('summary'),
		detailedScript: text('detailed_script'),
		sectionCount: integer('section_count').default(0),
		status: text('status').notNull().default('draft'), // draft | scripted | generating | complete
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp('deleted_at')
	},
	(table) => [index('chapter_storyId_idx').on(table.storyId)]
);

export const chapterRelations = relations(chapter, ({ one, many }) => ({
	story: one(story, { fields: [chapter.storyId], references: [story.id] }),
	sections: many(section)
}));

// ─── Section ────────────────────────────────────────────────────────────────

/** A single manga panel/section within a chapter. Has a narrative, image prompt, and panel layout. */
export const section = pgTable(
	'section',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		chapterId: text('chapter_id')
			.notNull()
			.references(() => chapter.id, { onDelete: 'cascade' }),
		sectionNumber: integer('section_number').notNull(),
		narrative: text('narrative'),
		imagePrompt: text('image_prompt'),
		imagePromptFull: text('image_prompt_full'),
		panelLayout: text('panel_layout').notNull().default('full'), // full | half | third | wide | tall
		sectionType: text('section_type').notNull().default('action'), // action | dialogue | establishing | transition | reaction | splash | montage
		locationId: text('location_id').references(() => location.id),
		status: text('status').notNull().default('draft'), // draft | prompt_ready | generating | complete
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date())
	},
	(table) => [index('section_chapterId_idx').on(table.chapterId)]
);

export const sectionRelations = relations(section, ({ one, many }) => ({
	chapter: one(chapter, { fields: [section.chapterId], references: [chapter.id] }),
	location: one(location, { fields: [section.locationId], references: [location.id] }),
	characters: many(sectionCharacter),
	dialogues: many(sectionDialogue),
	images: many(sectionImage)
}));

/** Many-to-many join: which characters appear in a section, with optional emotion/costume. */
export const sectionCharacter = pgTable(
	'section_character',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		sectionId: text('section_id')
			.notNull()
			.references(() => section.id, { onDelete: 'cascade' }),
		characterId: text('character_id')
			.notNull()
			.references(() => character.id, { onDelete: 'cascade' }),
		costumeVariant: text('costume_variant'),
		emotion: text('emotion')
	},
	(table) => [uniqueIndex('section_character_unique').on(table.sectionId, table.characterId)]
);

export const sectionCharacterRelations = relations(sectionCharacter, ({ one }) => ({
	section: one(section, { fields: [sectionCharacter.sectionId], references: [section.id] }),
	character: one(character, {
		fields: [sectionCharacter.characterId],
		references: [character.id]
	})
}));

/** Dialogue lines within a section — speech bubbles, thoughts, narration, SFX. */
export const sectionDialogue = pgTable(
	'section_dialogue',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		sectionId: text('section_id')
			.notNull()
			.references(() => section.id, { onDelete: 'cascade' }),
		characterId: text('character_id').references(() => character.id),
		text: text('text').notNull(),
		type: text('type').notNull().default('speech'), // speech | thought | narration | sfx | whisper | shout
		positionHint: text('position_hint'),
		sortOrder: integer('sort_order').notNull().default(0)
	},
	(table) => [index('section_dialogue_sectionId_idx').on(table.sectionId)]
);

export const sectionDialogueRelations = relations(sectionDialogue, ({ one }) => ({
	section: one(section, { fields: [sectionDialogue.sectionId], references: [section.id] }),
	character: one(character, { fields: [sectionDialogue.characterId], references: [character.id] })
}));

/** Generated panel images for a section (multiple versions, one selected). */
export const sectionImage = pgTable('section_image', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	sectionId: text('section_id')
		.notNull()
		.references(() => section.id, { onDelete: 'cascade' }),
	imageId: text('image_id'),
	status: text('status').notNull().default('complete'), // queued | generating | complete | failed
	prompt: text('prompt'),
	version: integer('version').notNull().default(1),
	isSelected: boolean('is_selected').notNull().default(false),
	generationJobId: text('generation_job_id'),
	generationParams: jsonb('generation_params'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const sectionImageRelations = relations(sectionImage, ({ one }) => ({
	section: one(section, { fields: [sectionImage.sectionId], references: [section.id] })
}));

// ─── Generation & Cost Tracking ─────────────────────────────────────────────

/** Tracks an image generation job (batch or fast). Stores status, progress, credits, and Google operation IDs. */
export const generationJob = pgTable('generation_job', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	status: text('status').notNull().default('pending'), // pending | submitted | processing | completed | failed | partial
	totalItems: integer('total_items').notNull().default(1),
	completedItems: integer('completed_items').notNull().default(0),
	failedItems: integer('failed_items').notNull().default(0),
	creditsReserved: integer('credits_reserved').notNull().default(0),
	creditsConsumed: integer('credits_consumed').notNull().default(0),
	actualCostUsd: numeric('actual_cost_usd'),
	googleOperationIds: jsonb('google_operation_ids'),
	errorLog: jsonb('error_log'),
	priority: integer('priority').notNull().default(0),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date())
});

/** Per-request API usage log — records model, token counts, image count, duration, and cost. */
export const apiUsageLog = pgTable('api_usage_log', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	generationJobId: text('generation_job_id').references(() => generationJob.id, {
		onDelete: 'cascade'
	}),
	apiType: text('api_type').notNull(), // text_generation | image_generation
	modelName: text('model_name').notNull(),
	inputTokens: integer('input_tokens'),
	outputTokens: integer('output_tokens'),
	imageCount: integer('image_count'),
	costUsd: numeric('cost_usd'),
	requestDurationMs: integer('request_duration_ms'),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});
