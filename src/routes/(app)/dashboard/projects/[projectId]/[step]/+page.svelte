<!--
  Project detail / editor page — the main 4-phase manga creation workflow:

  Phase 1 (Define): Edit title, genre, art style, synopsis. Add/edit/delete characters and locations.
           AI actions: "Generate Cast" (auto-create characters + locations from synopsis).
  Phase 2 (Refine): AI-expand synopsis into detailed story. Generate character descriptions.
           Generate reference images for characters/locations (fast or batch mode).
  Phase 3 (Script): Generate chapter outline from story. Generate detailed scripts per chapter.
           Break chapters into panel sections with image prompts and dialogue.
  Phase 4 (Generate): Bulk-generate manga panel images (fast or batch mode).
           Poll generation status. View generated images per section.

  Uses SvelteKit form actions for CRUD, fetch() calls for AI generation endpoints,
  and polling for async job status updates.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { addToast } from '$lib/stores/toast.svelte';
	// import { page } from '$app/svelte';

	let { data, form } = $props();

	console.log(page.params.step, 'data');

	let activePhase = $state(1);
	let expandingStory = $state(false);
	let generatingChapters = $state(false);
	let generatingOutline = $state(false);
	let generatingChapterDetail = $state<Record<string, boolean>>({});
	let generatingChapterSections = $state<Record<string, boolean>>({});
	let generatingAllDetails = $state(false);
	let generatingAllSections = $state(false);
	let showAddCharacter = $state(false);
	let showAddLocation = $state(false);
	let generatingCast = $state(false);
	let editingCharacterId = $state<string | null>(null);
	let editingLocationId = $state<string | null>(null);

	// Per-character AI selection with custom input
	let characterAiInputs = $state<Record<string, string>>({});
	let activeCharModalId = $state<string | null>(null);
	let activeCharModalName = $state('');
	let charModalInput = $state('');
	let generatingCharDescs = $state(false);

	// Generate Cast modal
	let castModalInput = $state('');

	// Story Overview modal
	let storyOverviewModalInput = $state('');
	let storyOverviewDialog = $state<HTMLDialogElement | null>(null);

	// Generate Locations modal
	let locationsModalInput = $state('');
	let generatingLocations = $state(false);

	// Dialog refs
	let charAiDialog = $state<HTMLDialogElement | null>(null);
	let castDialog = $state<HTMLDialogElement | null>(null);
	let locationsDialog = $state<HTMLDialogElement | null>(null);

	let selectedCharCount = $derived(Object.keys(characterAiInputs).length);

	// Reference image generation state
	let generatingRefImage = $state<Record<string, boolean>>({});
	let refImageBatchQueue = $state<
		Array<{ entityType: 'character' | 'location'; entityId: string; editPrompt?: string }>
	>([]);
	let submittingRefBatch = $state(false);
	let editImageDialog = $state<HTMLDialogElement | null>(null);
	let editImageEntityType = $state<'character' | 'location'>('character');
	let editImageEntityId = $state('');
	let editImageEntityName = $state('');
	let editImagePrompt = $state('');
	let editImageMode = $state<'fast' | 'batch'>('fast');
	let charImageHistoryId = $state<string | null>(null);
	let locImageHistoryId = $state<string | null>(null);

	// Chapter generation modal (shared for outline, detail, sections)
	let chapterGenDialog = $state<HTMLDialogElement | null>(null);
	let chapterGenFeedback = $state('');
	let chapterGenAction = $state<'outline' | 'detail' | 'sections' | null>(null);
	let chapterGenTargetId = $state<string | null>(null);

	// Section image generation modal
	let sectionImageDialog = $state<HTMLDialogElement | null>(null);
	let sectionImageMode = $state<'fast' | 'batch'>('fast');
	let sectionImagePrompt = $state('');
	let sectionImageTargetId = $state('');
	let sectionImageTargetLabel = $state('');

	// Section image batch queue
	let sectionBatchQueue = $state<Array<{ sectionId: string }>>([]);
	let submittingSectionBatch = $state(false);

	/** Add an entity to the batch queue for reference image generation (if not already in it). */
	function addToRefBatch(entityType: 'character' | 'location', entityId: string) {
		if (refImageBatchQueue.some((i) => i.entityType === entityType && i.entityId === entityId))
			return;
		refImageBatchQueue = [...refImageBatchQueue, { entityType, entityId }];
	}

	/** Remove an entity from the batch queue. */
	function removeFromRefBatch(entityType: 'character' | 'location', entityId: string) {
		refImageBatchQueue = refImageBatchQueue.filter(
			(i) => !(i.entityType === entityType && i.entityId === entityId)
		);
	}

	/** Check if an entity is already in the batch queue. */
	function isInRefBatch(entityType: 'character' | 'location', entityId: string) {
		return refImageBatchQueue.some((i) => i.entityType === entityType && i.entityId === entityId);
	}

	/** Call the fast reference image generation API for a single entity. Shows toast on completion/error. */
	async function generateRefImageFast(
		entityType: 'character' | 'location',
		entityId: string,
		editPrompt?: string
	) {
		const key = `${entityType}-${entityId}`;
		generatingRefImage = { ...generatingRefImage, [key]: true };
		try {
			const res = await fetch('/api/ai/generate-reference-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					storyId: data.project.id,
					entityType,
					entityId,
					mode: 'fast',
					editPrompt
				})
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate image', 'error');
				}
				return;
			}
			await invalidateAll();
			addToast('Image generated!', 'success');
		} finally {
			const { [key]: _, ...rest } = generatingRefImage;
			generatingRefImage = rest;
		}
	}

	/** Submit all queued reference images for batch processing. Clears the queue on success. */
	async function submitRefBatch() {
		if (refImageBatchQueue.length === 0) return;
		submittingRefBatch = true;
		try {
			const res = await fetch('/api/ai/generate-reference-images-batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					storyId: data.project.id,
					items: refImageBatchQueue
				})
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to queue batch generation', 'error');
				}
				return;
			}
			const result = await res.json();
			refImageBatchQueue = [];
			await invalidateAll();
			addToast(`${result.queued} image(s) queued for batch processing`, 'success');
		} catch {
			addToast('Failed to queue batch generation', 'error');
		} finally {
			submittingRefBatch = false;
		}
	}

	/** Open the "edit image" dialog to provide modification instructions for regeneration. */
	function openEditImageModal(
		entityType: 'character' | 'location',
		entityId: string,
		entityName: string,
		mode: 'fast' | 'batch'
	) {
		editImageEntityType = entityType;
		editImageEntityId = entityId;
		editImageEntityName = entityName;
		editImagePrompt = '';
		editImageMode = mode;
		editImageDialog?.showModal();
	}

	/** Submit the edit image request — either fast (immediate) or add to batch queue. */
	async function submitEditImage() {
		editImageDialog?.close();
		if (editImageMode === 'fast') {
			await generateRefImageFast(editImageEntityType, editImageEntityId, editImagePrompt);
		} else {
			refImageBatchQueue = [
				...refImageBatchQueue.filter(
					(i) => !(i.entityType === editImageEntityType && i.entityId === editImageEntityId)
				),
				{
					entityType: editImageEntityType,
					entityId: editImageEntityId,
					editPrompt: editImagePrompt
				}
			];
		}
	}

	/** Get the primary (or first completed) image from an entity's image array. */
	function getPrimaryImage(
		images: Array<{
			imageId: string | null;
			isPrimary: boolean;
			version: number;
			prompt: string | null;
			status: string;
			createdAt: Date;
		}>
	) {
		const complete = images.filter((i) => i.status === 'complete' && i.imageId);
		return complete.find((i) => i.isPrimary) || complete[0] || null;
	}

	/** Check if any image in the array is still queued or being generated. */
	function hasQueuedOrGenerating(images: Array<{ status: string }>) {
		return images.some((i) => i.status === 'queued' || i.status === 'generating');
	}

	// Read mode toggle (script phase)
	let readMode = $state(false);

	// Image generation state
	let generatingImages = $state(false);
	let generationMode = $state<'batch' | 'fast' | null>(null);
	let activeJobId = $state<string | null>(null);
	let jobStatus = $state<{
		status: string;
		totalItems: number;
		completedItems: number;
		failedItems: number;
	} | null>(null);

	// Initialize from server data
	$effect(() => {
		const job = data.activeJob;
		if (job && !activeJobId) {
			activeJobId = job.id;
			generatingImages = true;
			jobStatus = {
				status: job.status,
				totalItems: job.totalItems,
				completedItems: job.completedItems,
				failedItems: job.failedItems
			};
		}
	});

	// Poll for generation status
	$effect(() => {
		if (!activeJobId) return;

		const interval = setInterval(async () => {
			const res = await fetch(`/api/ai/generation-status?jobId=${activeJobId}`);
			if (!res.ok) return;
			const { job } = await res.json();
			if (!job) return;

			jobStatus = {
				status: job.status,
				totalItems: job.totalItems,
				completedItems: job.completedItems,
				failedItems: job.failedItems
			};

			if (['completed', 'failed', 'partial'].includes(job.status)) {
				clearInterval(interval);
				generatingImages = false;
				generationMode = null;
				activeJobId = null;
				await invalidateAll();
			}
		}, 5000);

		return () => clearInterval(interval);
	});

	/** Start bulk panel image generation for all sections — kicks off the job and starts polling. */
	async function startImageGeneration(
		mode: 'batch' | 'fast',
		sectionIds?: string[],
		userInstructions?: Record<string, string>
	) {
		generatingImages = true;
		generationMode = mode;
		try {
			const res = await fetch('/api/ai/generate-images', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					storyId: data.project.id,
					mode,
					sectionIds: sectionIds || undefined,
					userInstructions: userInstructions || undefined
				})
			});
			if (!res.ok) {
				const err = await res.json();
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to start image generation. Please try again later.', 'error');
				}
				generatingImages = false;
				generationMode = null;
				return;
			}
			const result = await res.json();
			activeJobId = result.jobId;
			jobStatus = {
				status: 'processing',
				totalItems: result.totalImages,
				completedItems: 0,
				failedItems: 0
			};
		} catch {
			generatingImages = false;
			generationMode = null;
		}
	}

	// Determine which phases are available based on data
	let phase1Complete = $derived(
		!!data.project.title?.trim() && !!data.project.synopsis?.trim() && data.characters.length > 0
	);
	let hasDetailedStory = $derived(!!data.project.detailedStory?.trim());
	let hasChapters = $derived(data.chapters.length > 0);
	let hasScriptedChapters = $derived(
		data.chapters.some((ch: { detailedScript?: string | null }) => !!ch.detailedScript)
	);
	let hasChaptersWithSections = $derived(
		data.chapters.some((ch: { sections?: unknown[] }) => ch.sections && ch.sections.length > 0)
	);
	let phase2Complete = $derived(hasDetailedStory && hasChaptersWithSections);
	let phase3Complete = $derived(data.chapters.length > 0);

	const roles = ['main', 'supporting', 'antagonist', 'side'] as const;
	const genres = [
		'Action',
		'Romance',
		'Fantasy',
		'Sci-Fi',
		'Horror',
		'Comedy',
		'Drama',
		'Thriller',
		'Mystery',
		'Slice of Life',
		'Isekai',
		'Mecha'
	];
	const artStyles = [
		'Manga (B&W)',
		'Manhwa (Full Color)',
		'Webtoon',
		'Dark Fantasy',
		'Shojo',
		'Shonen',
		'Seinen',
		'Chibi',
		'Realistic',
		'Watercolor'
	];

	/** Call the AI story expansion API. On success, reloads data and moves to Phase 2. */
	async function expandStory(userInput?: string) {
		expandingStory = true;
		try {
			const res = await fetch(`/api/ai/expand-story`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: data.project.id, userInput: userInput || undefined })
			});
			if (!res.ok) {
				const err = await res.json();
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to expand story. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
			activePhase = 2;
		} finally {
			expandingStory = false;
		}
	}

	async function generateChapters() {
		generatingChapters = true;
		try {
			const res = await fetch(`/api/ai/generate-chapters`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: data.project.id })
			});
			if (!res.ok) {
				const err = await res.json();
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate chapters. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
			activePhase = 3;
		} finally {
			generatingChapters = false;
		}
	}

	/** Generate chapter outline (titles + summaries) from the detailed story. */
	async function generateChapterOutline(userInput?: string) {
		generatingOutline = true;
		try {
			const res = await fetch('/api/ai/generate-chapter-outline', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: data.project.id, userInput: userInput || undefined })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate chapter outline. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			generatingOutline = false;
		}
	}

	/** Generate a detailed script for a single chapter. */
	async function generateChapterDetail(chapterId: string, userInput?: string) {
		generatingChapterDetail = { ...generatingChapterDetail, [chapterId]: true };
		try {
			const res = await fetch('/api/ai/generate-chapter-detail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					storyId: data.project.id,
					chapterId,
					userInput: userInput || undefined
				})
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate chapter detail. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			const { [chapterId]: _, ...rest } = generatingChapterDetail;
			generatingChapterDetail = rest;
		}
	}

	/** Break a chapter's script into panel-by-panel sections with image prompts. */
	async function generateChapterSections(chapterId: string, userInput?: string) {
		generatingChapterSections = { ...generatingChapterSections, [chapterId]: true };
		try {
			const res = await fetch('/api/ai/generate-chapter-sections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					storyId: data.project.id,
					chapterId,
					userInput: userInput || undefined
				})
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate sections. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			const { [chapterId]: _, ...rest } = generatingChapterSections;
			generatingChapterSections = rest;
		}
	}

	/** Generate detailed scripts for all chapters that don't have one yet (sequential). */
	async function generateAllChapterDetails() {
		generatingAllDetails = true;
		try {
			for (const ch of data.chapters) {
				if (!ch.detailedScript) {
					await generateChapterDetail(ch.id);
				}
			}
		} finally {
			generatingAllDetails = false;
		}
	}

	/** Generate panel sections for all chapters that have scripts but no sections yet (sequential). */
	async function generateAllChapterSections() {
		generatingAllSections = true;
		try {
			for (const ch of data.chapters) {
				if (ch.detailedScript && (!ch.sections || ch.sections.length === 0)) {
					await generateChapterSections(ch.id);
				}
			}
		} finally {
			generatingAllSections = false;
		}
	}

	/** Call the AI cast generation API to auto-create characters + locations from the synopsis. */
	async function generateCast(userInput?: string) {
		generatingCast = true;
		try {
			const res = await fetch('/api/ai/generate-cast', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: data.project.id, userInput: userInput || undefined })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate characters & locations. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			generatingCast = false;
		}
	}

	/** Generate AI descriptions for all selected characters (batch text generation). */
	async function generateSelectedCharacters() {
		generatingCharDescs = true;
		try {
			const characters = Object.entries(characterAiInputs).map(([characterId, userInput]) => ({
				characterId,
				userInput: userInput || undefined
			}));
			const res = await fetch('/api/ai/generate-characters-batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: data.project.id, characters })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate character descriptions. Please try again later.', 'error');
				}
				return;
			}
			characterAiInputs = {};
			await invalidateAll();
		} finally {
			generatingCharDescs = false;
		}
	}

	/** Call the AI location generation API to create new locations for the story. */
	async function generateLocationsAi(userInput?: string) {
		generatingLocations = true;
		try {
			const res = await fetch('/api/ai/generate-locations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ storyId: data.project.id, userInput: userInput || undefined })
			});
			if (!res.ok) {
				if (res.status === 402) {
					addToast('No credits available', 'warning', {
						text: 'Please upgrade your plan or buy a credit pack',
						href: '/dashboard/billing'
					});
				} else {
					addToast('Failed to generate locations. Please try again later.', 'error');
				}
				return;
			}
			await invalidateAll();
		} finally {
			generatingLocations = false;
		}
	}

	/** Open the character AI generation modal with optional custom instructions. */
	function openCharAiModal(charId: string, charName: string) {
		activeCharModalId = charId;
		activeCharModalName = charName;
		charModalInput = characterAiInputs[charId] ?? '';
		charAiDialog?.showModal();
	}

	/** Save the character AI modal input and close dialog. */
	function saveCharAiModal() {
		if (activeCharModalId) {
			characterAiInputs = { ...characterAiInputs, [activeCharModalId]: charModalInput };
		}
		charAiDialog?.close();
	}

	function cancelCharAiModal() {
		charAiDialog?.close();
	}

	function openCastModal() {
		castModalInput = '';
		castDialog?.showModal();
	}

	function submitCastModal() {
		castDialog?.close();
		generateCast(castModalInput);
	}

	function openStoryOverviewModal() {
		storyOverviewModalInput = '';
		storyOverviewDialog?.showModal();
	}

	function submitStoryOverviewModal() {
		storyOverviewDialog?.close();
		expandStory(storyOverviewModalInput);
	}

	function openLocationsModal() {
		locationsModalInput = '';
		locationsDialog?.showModal();
	}

	function submitLocationsModal() {
		locationsDialog?.close();
		generateLocationsAi(locationsModalInput);
	}

	/** Open the chapter generation modal for a given action type. */
	function openChapterGenModal(action: 'outline' | 'detail' | 'sections', chapterId?: string) {
		chapterGenAction = action;
		chapterGenTargetId = chapterId ?? null;
		chapterGenFeedback = '';
		chapterGenDialog?.showModal();
	}

	/** Submit the chapter generation modal — dispatches to the correct generation function. */
	function submitChapterGenModal() {
		chapterGenDialog?.close();
		const feedback = chapterGenFeedback;
		if (chapterGenAction === 'outline') {
			generateChapterOutline(feedback);
		} else if (chapterGenAction === 'detail' && chapterGenTargetId) {
			generateChapterDetail(chapterGenTargetId, feedback);
		} else if (chapterGenAction === 'sections' && chapterGenTargetId) {
			generateChapterSections(chapterGenTargetId, feedback);
		}
	}

	/** Get title text for the chapter generation modal based on current action. */
	function chapterGenModalTitle(): string {
		switch (chapterGenAction) {
			case 'outline':
				return 'Generate Chapter Outline';
			case 'detail':
				return 'Generate Chapter Detail';
			case 'sections':
				return 'Generate Sections / Panels';
			default:
				return 'Generate';
		}
	}

	/** Open the section image generation modal — pre-fills with the section's current prompt. */
	function openSectionImageModal(
		sectionId: string,
		label: string,
		mode: 'fast' | 'batch',
		existingPrompt: string
	) {
		sectionImageTargetId = sectionId;
		sectionImageTargetLabel = label;
		sectionImageMode = mode;
		sectionImagePrompt = existingPrompt;
		sectionImageDialog?.showModal();
	}

	/** Save a section's image prompt to the DB via form action. */
	async function saveSectionPrompt(sectionId: string, imagePrompt: string) {
		const formData = new FormData();
		formData.set('sectionId', sectionId);
		formData.set('imagePrompt', imagePrompt);
		await fetch('?/updateSectionPrompt', { method: 'POST', body: formData });
	}

	/** Submit the section image modal — saves the (possibly edited) prompt, then generates/batches. */
	async function submitSectionImageModal() {
		sectionImageDialog?.close();

		// Save the edited prompt to DB
		await saveSectionPrompt(sectionImageTargetId, sectionImagePrompt);
		await invalidateAll();

		if (sectionImageMode === 'fast') {
			startImageGeneration('fast', [sectionImageTargetId]);
		} else {
			if (!sectionBatchQueue.some((q) => q.sectionId === sectionImageTargetId)) {
				sectionBatchQueue = [...sectionBatchQueue, { sectionId: sectionImageTargetId }];
			}
		}
	}

	/** Check if a section is already in the batch queue. */
	function isInSectionBatch(sectionId: string) {
		return sectionBatchQueue.some((q) => q.sectionId === sectionId);
	}

	/** Submit all queued section images as a batch. */
	async function submitSectionBatch() {
		if (sectionBatchQueue.length === 0) return;
		submittingSectionBatch = true;
		try {
			const sectionIds = sectionBatchQueue.map((q) => q.sectionId);
			await startImageGeneration('batch', sectionIds);
			sectionBatchQueue = [];
		} finally {
			submittingSectionBatch = false;
		}
	}

	const R2_BASE = 'https://stories-maker-bucket.ostojicstefan.com';

	/** Build the R2 public URL for a character's primary reference image. */
	function getCharacterImageUrl(character: {
		id: string;
		images: Array<{ imageId: string | null; isPrimary: boolean; status: string }>;
	}) {
		const img =
			character.images.find((i) => i.isPrimary && i.imageId && i.status === 'complete') ||
			character.images.find((i) => i.imageId && i.status === 'complete');
		if (!img?.imageId) return '';
		return `${R2_BASE}/stories/${data.project.id}/characters/${character.id}/${img.imageId}.jpg`;
	}

	/** Build the R2 public URL for a location's primary reference image. */
	function getLocationImageUrl(loc: {
		id: string;
		images: Array<{ imageId: string | null; isPrimary: boolean; status: string }>;
	}) {
		const img =
			loc.images.find((i) => i.isPrimary && i.imageId && i.status === 'complete') ||
			loc.images.find((i) => i.imageId && i.status === 'complete');
		if (!img?.imageId) return '';
		return `${R2_BASE}/stories/${data.project.id}/locations/${loc.id}/${img.imageId}.jpg`;
	}

	function getCharImageHistoryUrl(charId: string, imageId: string) {
		return `${R2_BASE}/stories/${data.project.id}/characters/${charId}/${imageId}.jpg`;
	}

	function getLocImageHistoryUrl(locId: string, imageId: string) {
		return `${R2_BASE}/stories/${data.project.id}/locations/${locId}/${imageId}.jpg`;
	}

	function getSectionImageUrl(section: any) {
		let selectedImage = section.images.find((image) => image.isSelected);

		if (!selectedImage) {
			return '';
		}

		let url = `${R2_BASE}/stories/${data.project.id}/sections/${section.id}/${selectedImage.imageId}.jpg`;
		return url;
	}

	// Image preview modal
	let previewImageUrl = $state<string | null>(null);
	let previewImageDialog = $state<HTMLDialogElement | null>(null);

	/** Open the full-size image preview modal for a given URL. */
	function openImagePreview(url: string) {
		previewImageUrl = null;
		// Wait a tick so the old image is cleared before showing the modal
		queueMicrotask(() => {
			previewImageUrl = url;
			previewImageDialog?.showModal();
		});
	}

	function gotoStep(step: string) {
		let url = page.url.pathname.replace(page.params.step ?? '', step);
		goto(url);
	}
</script>

<div class="max-w-5xl p-8">
	<!-- Header -->
	<div class="mb-6 flex items-center gap-3">
		<a href="/dashboard/projects" class="btn btn-square btn-ghost btn-sm" title="Back to projects">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</a>
		<div>
			<h1 class="text-2xl font-bold">{data.project.title}</h1>
			<span class="badge badge-ghost badge-sm">{data.project.status}</span>
		</div>
	</div>

	<!-- Phase Tabs -->
	<div class="tabs-box mb-8 tabs">
		<button class="tab {page.params.step === 'define' ? 'tab-active' : ''}" onclick={() => gotoStep('define')}>
			1. Define
		</button>
		<button
			class="tab {page.params.step === 'refine' ? 'tab-active' : ''}"
			onclick={() => gotoStep('refine')}
			disabled={!phase1Complete}
		>
			2. Refine
		</button>
		<button
			class="tab {page.params.step === 'script' ? 'tab-active' : ''}"
			onclick={() => gotoStep('script')}
			disabled={!phase2Complete}
		>
			3. Script
		</button>
	</div>

	<!-- ═══════════ PHASE 1: DEFINE ═══════════ -->
	{#if page.params.step === 'define'}
		<div class="space-y-6">
			<!-- Story Details -->
			<div class="card border border-base-300 bg-base-200">
				<div class="card-body">
					<h2 class="card-title text-lg">Story Details</h2>
					<form method="post" action="?/updateStory" use:enhance class="mt-2 space-y-4">
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<label class="form-control w-full">
								<div class="label"><span class="label-text">Title</span></div>
								<input
									type="text"
									name="title"
									value={data.project.title}
									class="input-bordered input w-full"
									required
								/>
							</label>
							<label class="form-control w-full">
								<div class="label"><span class="label-text">Genre</span></div>
								<select name="genre" class="select-bordered select w-full">
									<option value="">Select genre...</option>
									{#each genres as g}
										<option value={g} selected={data.project.genre === g}>{g}</option>
									{/each}
								</select>
							</label>
						</div>
						<label class="form-control w-full">
							<div class="label"><span class="label-text">Art Style</span></div>
							<select name="artStyle" class="select-bordered select w-full">
								<option value="">Select style...</option>
								{#each artStyles as s}
									<option value={s} selected={data.project.artStyle === s}>{s}</option>
								{/each}
							</select>
						</label>
						<label class="form-control w-full">
							<div class="label"><span class="label-text">Synopsis</span></div>
							<textarea
								name="synopsis"
								class="textarea-bordered textarea h-32 w-full"
								placeholder="Describe your story idea...">{data.project.synopsis ?? ''}</textarea
							>
						</label>
						<div class="flex justify-end">
							<button class="btn btn-sm btn-primary">Save Details</button>
						</div>
					</form>
				</div>
			</div>

			<!-- Generate Characters & Locations -->
			{#if data.characters.length === 0 && data.locations.length === 0}
				<div class="card border border-dashed border-base-300 bg-base-200">
					<div class="card-body items-center py-8 text-center">
						<h2 class="card-title text-lg">Auto-Generate Cast & Locations</h2>
						<p class="max-w-md text-sm text-base-content/50">
							Let AI create characters and locations based on your title, genre, and synopsis. You
							can edit them afterwards.
						</p>
						<button
							class="btn mt-3 gap-2 btn-sm btn-secondary"
							onclick={openCastModal}
							disabled={generatingCast || !data.project.synopsis?.trim()}
						>
							{#if generatingCast}
								<span class="loading loading-sm loading-spinner"></span>
								Generating...
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
									/>
								</svg>
								Generate with AI
							{/if}
						</button>
						{#if !data.project.synopsis?.trim()}
							<p class="mt-1 text-xs text-warning">Add a synopsis first</p>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Characters -->
			<div class="card border border-base-300 bg-base-200">
				<div class="card-body">
					<div class="flex items-center justify-between">
						<h2 class="card-title text-lg">
							Characters <span class="badge badge-sm">{data.characters.length}</span>
						</h2>
						<div class="flex gap-2">
							{#if data.characters.length > 0}
								<button
									class="btn gap-1 btn-ghost btn-sm"
									onclick={openCastModal}
									disabled={generatingCast || !data.project.synopsis?.trim()}
									title="Generate more characters & locations with AI"
								>
									{#if generatingCast}
										<span class="loading loading-xs loading-spinner"></span>
									{/if}
									AI Generate
								</button>
							{/if}
							<button
								class="btn btn-outline btn-sm"
								onclick={() => (showAddCharacter = !showAddCharacter)}
							>
								{showAddCharacter ? 'Cancel' : 'Add Character'}
							</button>
						</div>
					</div>

					{#if showAddCharacter}
						<form
							method="post"
							action="?/addCharacter"
							use:enhance={() =>
								async ({ update }) => {
									showAddCharacter = false;
									await update();
								}}
							class="mt-4 space-y-3 rounded-lg bg-base-300 p-4"
						>
							<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
								<input
									type="text"
									name="name"
									placeholder="Character name"
									class="input-bordered input input-sm w-full"
									required
								/>
								<select name="role" class="select-bordered select w-full select-sm">
									{#each roles as r}
										<option value={r}>{r}</option>
									{/each}
								</select>
							</div>
							<textarea
								name="description"
								placeholder="Brief description..."
								class="textarea-bordered textarea w-full textarea-sm"
							></textarea>
							<button class="btn btn-sm btn-primary">Add</button>
						</form>
					{/if}

					{#if data.characters.length > 0}
						<div class="mt-2 divide-y divide-base-300">
							{#each data.characters as char}
								{@const primaryImg = char.images ? getPrimaryImage(char.images) : null}
								{@const isGenChar = generatingRefImage[`character-${char.id}`]}
								{@const hasQueuedChar = char.images ? hasQueuedOrGenerating(char.images) : false}
								<div class="py-3">
									{#if editingCharacterId === char.id}
										<form
											method="post"
											action="?/updateCharacter"
											use:enhance={() =>
												async ({ update }) => {
													editingCharacterId = null;
													await update();
												}}
											class="space-y-3"
										>
											<input type="hidden" name="characterId" value={char.id} />
											<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
												<input
													type="text"
													name="name"
													value={char.name}
													class="input-bordered input input-sm w-full"
													required
												/>
												<select name="role" class="select-bordered select w-full select-sm">
													{#each roles as r}
														<option value={r} selected={char.role === r}>{r}</option>
													{/each}
												</select>
											</div>
											<textarea
												name="description"
												class="textarea-bordered textarea w-full textarea-sm"
												placeholder="Description...">{char.description ?? ''}</textarea
											>
											<textarea
												name="visualDescription"
												class="textarea-bordered textarea w-full textarea-sm"
												placeholder="Visual description (appearance, clothing, etc)..."
												>{char.visualDescription ?? ''}</textarea
											>
											<div class="flex gap-2">
												<button class="btn btn-sm btn-primary">Save</button>
												<button
													type="button"
													class="btn btn-ghost btn-sm"
													onclick={() => (editingCharacterId = null)}>Cancel</button
												>
											</div>
										</form>
									{:else}
										<div class="flex items-start gap-4">
											<!-- Character image on the left -->
											<div class="flex shrink-0 flex-col items-center gap-1">
												{#if primaryImg}
													<!-- svelte-ignore a11y_click_events_have_key_events -->
													<!-- svelte-ignore a11y_no_static_element_interactions -->
													<div
														class="relative h-24 w-24 cursor-pointer overflow-hidden rounded-lg border-2 border-base-300"
														onclick={() => openImagePreview(getCharacterImageUrl(char))}
													>
														<img
															src={getCharacterImageUrl(char)}
															alt={char.name}
															class="h-full w-full object-cover"
														/>
													</div>
													<div class="flex gap-0.5">
														<button
															class="btn btn-ghost btn-xs"
															title="Edit image (fast, 2 credits)"
															onclick={() =>
																openEditImageModal('character', char.id, char.name, 'fast')}
															disabled={true}>Edit</button
														>
														<button
															class="btn btn-ghost btn-xs"
															title="Edit image (batch, 1 credit)"
															onclick={() =>
																openEditImageModal('character', char.id, char.name, 'batch')}
															disabled={isGenChar}>Batch</button
														>
													</div>
													{#if char.images && char.images.length > 1}
														<button
															class="btn btn-ghost btn-xs"
															onclick={() =>
																(charImageHistoryId =
																	charImageHistoryId === char.id ? null : char.id)}
														>
															History ({char.images.length})
														</button>
													{/if}
												{:else if isGenChar}
													<div
														class="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-base-300"
													>
														<span class="loading loading-sm loading-spinner"></span>
													</div>
												{:else if hasQueuedChar}
													<div
														class="flex h-24 w-24 flex-col items-center justify-center rounded-lg border-2 border-dashed border-info/50 text-info/60"
													>
														<span class="loading loading-xs loading-dots"></span>
														<span class="mt-1 text-[10px]">Queued</span>
													</div>
												{:else}
													<div
														class="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-base-300 text-base-content/30"
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															class="h-8 w-8"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
															stroke-width="1.5"
															><path
																stroke-linecap="round"
																stroke-linejoin="round"
																d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
															/></svg
														>
													</div>
												{/if}
											</div>
											<!-- Character info -->
											<div class="flex-1">
												<div class="flex items-start justify-between gap-3">
													<div>
														<div class="flex items-center gap-2">
															<span class="font-medium">{char.name}</span>
															<span class="badge badge-outline badge-xs">{char.role}</span>
															{#if isInRefBatch('character', char.id)}
																<span class="badge badge-xs badge-info">queued</span>
															{/if}
														</div>
														{#if char.description}
															<p class="mt-1 text-sm text-base-content/60">{char.description}</p>
														{/if}
														{#if char.visualDescription}
															<p class="mt-1 text-xs text-base-content/40 italic">
																{char.visualDescription}
															</p>
														{/if}
													</div>
													<div class="flex shrink-0 flex-col gap-1">
														<div class="flex gap-1">
															<button
																class="btn btn-xs {char.id in characterAiInputs
																	? 'btn-accent'
																	: 'btn-ghost'}"
																title="Configure AI description generation"
																onclick={() => openCharAiModal(char.id, char.name)}>AI</button
															>
															<button
																class="btn btn-ghost btn-xs"
																onclick={() => (editingCharacterId = char.id)}>Edit</button
															>
															<form method="post" action="?/deleteCharacter" use:enhance>
																<input type="hidden" name="characterId" value={char.id} />
																<button class="btn text-error btn-ghost btn-xs">Del</button>
															</form>
														</div>
														<div class="flex gap-1">
															<button
																class="btn btn-xs btn-secondary"
																title="Generate image (2 credits)"
																onclick={() => generateRefImageFast('character', char.id)}
																disabled={true}
															>
																{#if isGenChar}<span class="loading loading-xs loading-spinner"
																	></span>{/if}
																Fast
															</button>
															<button
																class="btn btn-outline btn-xs"
																title="Add to batch (1 credit)"
																onclick={() => {
																	if (isInRefBatch('character', char.id)) {
																		removeFromRefBatch('character', char.id);
																	} else {
																		addToRefBatch('character', char.id);
																	}
																}}
																disabled={submittingRefBatch}
															>
																{isInRefBatch('character', char.id) ? 'Unqueue' : 'Batch'}
															</button>
														</div>
													</div>
												</div>
												<!-- Image history -->
												{#if charImageHistoryId === char.id && char.images && char.images.length > 1}
													<div class="mt-2 flex flex-wrap gap-2 rounded-lg bg-base-300 p-2">
														{#each char.images as img}
															{#if img.imageId && img.status === 'complete'}
																<!-- svelte-ignore a11y_click_events_have_key_events -->
																<!-- svelte-ignore a11y_no_static_element_interactions -->
																<div
																	class="relative h-16 w-16 cursor-pointer overflow-hidden rounded border-2 {img.isPrimary
																		? 'border-primary'
																		: 'border-base-content/10'}"
																	title="v{img.version}{img.prompt
																		? ` — ${img.prompt.substring(0, 80)}`
																		: ''}"
																	onclick={() =>
																		openImagePreview(getCharImageHistoryUrl(char.id, img.imageId!))}
																>
																	<img
																		src={getCharImageHistoryUrl(char.id, img.imageId!)}
																		alt="v{img.version}"
																		class="h-full w-full object-cover"
																	/>
																	{#if img.isPrimary}
																		<div class="absolute top-0 right-0">
																			<span class="badge badge-xs badge-primary">cur</span>
																		</div>
																	{/if}
																</div>
															{:else if img.status === 'queued' || img.status === 'generating'}
																<div
																	class="flex h-16 w-16 flex-col items-center justify-center rounded border-2 border-dashed border-info/30 text-info/50"
																>
																	<span class="loading loading-xs loading-dots"></span>
																	<span class="text-[8px]">{img.status}</span>
																</div>
															{:else if img.status === 'failed'}
																<div
																	class="flex h-16 w-16 items-center justify-center rounded border-2 border-dashed border-error/30 text-[8px] text-error/50"
																>
																	Failed
																</div>
															{/if}
														{/each}
													</div>
												{/if}
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
						{#if selectedCharCount > 0}
							<div class="mt-3 flex items-center gap-2 border-t border-base-300 pt-3">
								<button
									class="btn gap-1 btn-sm btn-primary"
									onclick={generateSelectedCharacters}
									disabled={generatingCharDescs}
								>
									{#if generatingCharDescs}
										<span class="loading loading-xs loading-spinner"></span>
										Generating...
									{:else}
										Generate Selected ({selectedCharCount})
									{/if}
								</button>
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => (characterAiInputs = {})}
									disabled={generatingCharDescs}
								>
									Clear
								</button>
							</div>
						{/if}
					{:else}
						<p class="mt-2 text-sm text-base-content/50">Add at least one character to continue.</p>
					{/if}
				</div>
			</div>

			<!-- Locations -->
			<div class="card border border-base-300 bg-base-200">
				<div class="card-body">
					<div class="flex items-center justify-between">
						<h2 class="card-title text-lg">
							Locations <span class="badge badge-sm">{data.locations.length}</span>
						</h2>
						<div class="flex gap-2">
							<button
								class="btn gap-1 btn-ghost btn-sm"
								onclick={openLocationsModal}
								disabled={generatingLocations || !data.project.synopsis?.trim()}
								title="Generate locations with AI"
							>
								{#if generatingLocations}
									<span class="loading loading-xs loading-spinner"></span>
								{/if}
								AI Generate
							</button>
							<button
								class="btn btn-outline btn-sm"
								onclick={() => (showAddLocation = !showAddLocation)}
							>
								{showAddLocation ? 'Cancel' : 'Add Location'}
							</button>
						</div>
					</div>

					{#if showAddLocation}
						<form
							method="post"
							action="?/addLocation"
							use:enhance={() =>
								async ({ update }) => {
									showAddLocation = false;
									await update();
								}}
							class="mt-4 space-y-3 rounded-lg bg-base-300 p-4"
						>
							<input
								type="text"
								name="name"
								placeholder="Location name"
								class="input-bordered input input-sm w-full"
								required
							/>
							<textarea
								name="description"
								placeholder="Description..."
								class="textarea-bordered textarea w-full textarea-sm"
							></textarea>
							<button class="btn btn-sm btn-primary">Add</button>
						</form>
					{/if}

					{#if data.locations.length > 0}
						<div class="mt-2 divide-y divide-base-300">
							{#each data.locations as loc}
								{@const primaryLocImg = loc.images ? getPrimaryImage(loc.images) : null}
								{@const isGenLoc = generatingRefImage[`location-${loc.id}`]}
								{@const hasQueuedLoc = loc.images ? hasQueuedOrGenerating(loc.images) : false}
								<div class="py-3">
									{#if editingLocationId === loc.id}
										<form
											method="post"
											action="?/updateLocation"
											use:enhance={() =>
												async ({ update }) => {
													editingLocationId = null;
													await update();
												}}
											class="space-y-3"
										>
											<input type="hidden" name="locationId" value={loc.id} />
											<input
												type="text"
												name="name"
												value={loc.name}
												class="input-bordered input input-sm w-full"
												required
											/>
											<textarea
												name="description"
												class="textarea-bordered textarea w-full textarea-sm"
												>{loc.description ?? ''}</textarea
											>
											<textarea
												name="visualDescription"
												class="textarea-bordered textarea w-full textarea-sm"
												placeholder="Visual description...">{loc.visualDescription ?? ''}</textarea
											>
											<div class="flex gap-2">
												<button class="btn btn-sm btn-primary">Save</button>
												<button
													type="button"
													class="btn btn-ghost btn-sm"
													onclick={() => (editingLocationId = null)}>Cancel</button
												>
											</div>
										</form>
									{:else}
										<div class="flex items-start gap-4">
											<!-- Location image on the left -->
											<div class="flex shrink-0 flex-col items-center gap-1">
												{#if primaryLocImg}
													<!-- svelte-ignore a11y_click_events_have_key_events -->
													<!-- svelte-ignore a11y_no_static_element_interactions -->
													<div
														class="relative h-24 w-24 cursor-pointer overflow-hidden rounded-lg border-2 border-base-300"
														onclick={() => openImagePreview(getLocationImageUrl(loc))}
													>
														<img
															src={getLocationImageUrl(loc)}
															alt={loc.name}
															class="h-full w-full object-cover"
														/>
													</div>
													<div class="flex gap-0.5">
														<button
															class="btn btn-ghost btn-xs"
															title="Edit image (fast, 2 credits)"
															onclick={() =>
																openEditImageModal('location', loc.id, loc.name, 'fast')}
															disabled={true}>Edit</button
														>
														<button
															class="btn btn-ghost btn-xs"
															title="Edit image (batch, 1 credit)"
															onclick={() =>
																openEditImageModal('location', loc.id, loc.name, 'batch')}
															disabled={isGenLoc}>Batch</button
														>
													</div>
													{#if loc.images && loc.images.length > 1}
														<button
															class="btn btn-ghost btn-xs"
															onclick={() =>
																(locImageHistoryId = locImageHistoryId === loc.id ? null : loc.id)}
														>
															History ({loc.images.length})
														</button>
													{/if}
												{:else if isGenLoc}
													<div
														class="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-base-300"
													>
														<span class="loading loading-sm loading-spinner"></span>
													</div>
												{:else if hasQueuedLoc}
													<div
														class="flex h-24 w-24 flex-col items-center justify-center rounded-lg border-2 border-dashed border-info/50 text-info/60"
													>
														<span class="loading loading-xs loading-dots"></span>
														<span class="mt-1 text-[10px]">Queued</span>
													</div>
												{:else}
													<div
														class="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-base-300 text-base-content/30"
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															class="h-8 w-8"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
															stroke-width="1.5"
															><path
																stroke-linecap="round"
																stroke-linejoin="round"
																d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
															/></svg
														>
													</div>
												{/if}
											</div>
											<!-- Location info -->
											<div class="flex-1">
												<div class="flex items-start justify-between gap-3">
													<div>
														<div class="flex items-center gap-2">
															<span class="font-medium">{loc.name}</span>
															{#if isInRefBatch('location', loc.id)}
																<span class="badge badge-xs badge-info">queued</span>
															{/if}
														</div>
														{#if loc.description}
															<p class="mt-1 text-sm text-base-content/60">{loc.description}</p>
														{/if}
													</div>
													<div class="flex shrink-0 flex-col gap-1">
														<div class="flex gap-1">
															<button
																class="btn btn-ghost btn-xs"
																onclick={() => (editingLocationId = loc.id)}>Edit</button
															>
															<form method="post" action="?/deleteLocation" use:enhance>
																<input type="hidden" name="locationId" value={loc.id} />
																<button class="btn text-error btn-ghost btn-xs">Del</button>
															</form>
														</div>
														<div class="flex gap-1">
															<button
																class="btn btn-xs btn-secondary"
																title="Generate image (2 credits)"
																onclick={() => generateRefImageFast('location', loc.id)}
																disabled={true}
															>
																{#if isGenLoc}<span class="loading loading-xs loading-spinner"
																	></span>{/if}
																Fast
															</button>
															<button
																class="btn btn-outline btn-xs"
																title="Add to batch (1 credit)"
																onclick={() => {
																	if (isInRefBatch('location', loc.id)) {
																		removeFromRefBatch('location', loc.id);
																	} else {
																		addToRefBatch('location', loc.id);
																	}
																}}
																disabled={submittingRefBatch}
															>
																{isInRefBatch('location', loc.id) ? 'Unqueue' : 'Batch'}
															</button>
														</div>
													</div>
												</div>
												<!-- Image history -->
												{#if locImageHistoryId === loc.id && loc.images && loc.images.length > 1}
													<div class="mt-2 flex flex-wrap gap-2 rounded-lg bg-base-300 p-2">
														{#each loc.images as img}
															{#if img.imageId && img.status === 'complete'}
																<!-- svelte-ignore a11y_click_events_have_key_events -->
																<!-- svelte-ignore a11y_no_static_element_interactions -->
																<div
																	class="relative h-16 w-16 cursor-pointer overflow-hidden rounded border-2 {img.isPrimary
																		? 'border-primary'
																		: 'border-base-content/10'}"
																	title="v{img.version}{img.prompt
																		? ` — ${img.prompt.substring(0, 80)}`
																		: ''}"
																	onclick={() =>
																		openImagePreview(getLocImageHistoryUrl(loc.id, img.imageId!))}
																>
																	<img
																		src={getLocImageHistoryUrl(loc.id, img.imageId!)}
																		alt="v{img.version}"
																		class="h-full w-full object-cover"
																	/>
																	{#if img.isPrimary}
																		<div class="absolute top-0 right-0">
																			<span class="badge badge-xs badge-primary">cur</span>
																		</div>
																	{/if}
																</div>
															{:else if img.status === 'queued' || img.status === 'generating'}
																<div
																	class="flex h-16 w-16 flex-col items-center justify-center rounded border-2 border-dashed border-info/30 text-info/50"
																>
																	<span class="loading loading-xs loading-dots"></span>
																	<span class="text-[8px]">{img.status}</span>
																</div>
															{:else if img.status === 'failed'}
																<div
																	class="flex h-16 w-16 items-center justify-center rounded border-2 border-dashed border-error/30 text-[8px] text-error/50"
																>
																	Failed
																</div>
															{/if}
														{/each}
													</div>
												{/if}
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<p class="mt-2 text-sm text-base-content/50">
							Locations are optional but help with scene consistency.
						</p>
					{/if}
				</div>
			</div>

			<!-- Batch Submit + Status -->
			{#if refImageBatchQueue.length > 0}
				<div class="card border border-base-300 bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<div>
								<h2 class="card-title text-lg">Batch Image Queue</h2>
								<p class="text-sm text-base-content/50">
									{refImageBatchQueue.length} item{refImageBatchQueue.length !== 1 ? 's' : ''} queued
									(1 credit each). Images will be processed within 15 minutes.
								</p>
							</div>
							<div class="flex gap-2">
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => (refImageBatchQueue = [])}
									disabled={submittingRefBatch}
								>
									Clear
								</button>
								<button
									class="btn btn-sm btn-primary"
									onclick={submitRefBatch}
									disabled={submittingRefBatch || refImageBatchQueue.length === 0}
								>
									{#if submittingRefBatch}
										<span class="loading loading-xs loading-spinner"></span>
									{/if}
									Submit Batch ({refImageBatchQueue.length})
								</button>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Phase 1 → 2 -->
			{#if phase1Complete}
				<div class="flex justify-end">
					<button class="btn gap-2 btn-primary" onclick={() => gotoStep('refine')}>
						Continue to Refine
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
						</svg>
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ═══════════ PHASE 2: REFINE ═══════════ -->
	{#if page.params.step === 'refine'}
		<div class="space-y-6">
			<!-- Step 1: Story Overview -->
			<div class="card border border-base-300 bg-base-200">
				<div class="card-body">
					<div class="flex items-center justify-between">
						<h2 class="card-title text-lg">Step 1 — Story Overview</h2>
						<div class="flex gap-2">
							{#if hasDetailedStory}
								<button
									class="btn gap-1 btn-outline btn-sm"
									onclick={openStoryOverviewModal}
									disabled={expandingStory}
								>
									{#if expandingStory}
										<span class="loading loading-xs loading-spinner"></span>
									{/if}
									Regenerate
								</button>
							{/if}
						</div>
					</div>
					{#if !hasDetailedStory}
						<p class="text-sm text-base-content/50">
							Generate a detailed story overview from your synopsis and characters.
						</p>
						<button
							class="btn mt-2 gap-2 btn-sm btn-primary"
							onclick={openStoryOverviewModal}
							disabled={expandingStory}
						>
							{#if expandingStory}
								<span class="loading loading-xs loading-spinner"></span>
								Generating...
							{:else}
								Generate Story Overview
							{/if}
						</button>
					{:else}
						<form method="post" action="?/updateDetailedStory" use:enhance class="mt-2">
							<textarea
								name="detailedStory"
								class="textarea-bordered textarea h-64 w-full font-mono text-sm"
								placeholder="The detailed story will appear here after AI expansion..."
								>{data.project.detailedStory ?? ''}</textarea
							>
							<div class="mt-3 flex justify-end">
								<button class="btn btn-sm btn-primary">Save Changes</button>
							</div>
						</form>
					{/if}
				</div>
			</div>

			<!-- Step 2: Chapter Outline -->
			{#if hasDetailedStory}
				<div class="card border border-base-300 bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<h2 class="card-title text-lg">Step 2 — Chapter Outline</h2>
							{#if hasChapters}
								<button
									class="btn gap-1 btn-outline btn-sm"
									onclick={() => openChapterGenModal('outline')}
									disabled={generatingOutline}
								>
									{#if generatingOutline}
										<span class="loading loading-xs loading-spinner"></span>
									{/if}
									Regenerate Outline
								</button>
							{/if}
						</div>
						{#if !hasChapters}
							<p class="text-sm text-base-content/50">
								Split your story overview into chapters. The AI will decide the appropriate number
								of chapters.
							</p>
							<button
								class="btn mt-2 gap-2 btn-sm btn-primary"
								onclick={() => openChapterGenModal('outline')}
								disabled={generatingOutline}
							>
								{#if generatingOutline}
									<span class="loading loading-xs loading-spinner"></span>
									Splitting into Chapters...
								{:else}
									Split into Chapters
								{/if}
							</button>
						{:else}
							<div class="mt-2 divide-y divide-base-300">
								{#each data.chapters as ch}
									<div class="py-3">
										<form method="post" action="?/updateChapter" use:enhance class="space-y-2">
											<input type="hidden" name="chapterId" value={ch.id} />
											<div class="flex items-center gap-2">
												<span class="badge badge-ghost badge-sm">Ch. {ch.chapterNumber}</span>
												<input
													type="text"
													name="title"
													value={ch.title ?? ''}
													class="input-bordered input input-sm flex-1"
													placeholder="Chapter title"
												/>
											</div>
											<textarea
												name="summary"
												class="textarea-bordered textarea w-full textarea-sm"
												rows="2"
												placeholder="Chapter summary...">{ch.summary ?? ''}</textarea
											>
											<input type="hidden" name="detailedScript" value={ch.detailedScript ?? ''} />
											<div class="flex justify-end">
												<button class="btn btn-xs btn-primary">Save</button>
											</div>
										</form>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Step 3: Chapter Details -->
			{#if hasChapters}
				<div class="card border border-base-300 bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<h2 class="card-title text-lg">Step 3 — Chapter Details</h2>
							<button
								class="btn gap-1 btn-outline btn-sm"
								onclick={generateAllChapterDetails}
								disabled={generatingAllDetails}
							>
								{#if generatingAllDetails}
									<span class="loading loading-xs loading-spinner"></span>
									Generating All...
								{:else}
									Generate All Details
								{/if}
							</button>
						</div>
						<p class="text-sm text-base-content/50">
							Generate the full detailed script for each chapter individually.
						</p>
						<div class="mt-2 divide-y divide-base-300">
							{#each data.chapters as ch}
								<div class="py-3">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-2">
											<span class="badge badge-ghost badge-sm">Ch. {ch.chapterNumber}</span>
											<span class="text-sm font-medium">{ch.title || 'Untitled'}</span>
											{#if ch.detailedScript}
												<span class="badge badge-xs badge-success">scripted</span>
											{:else}
												<span class="badge badge-xs badge-warning">pending</span>
											{/if}
										</div>
										<button
											class="btn gap-1 btn-sm {ch.detailedScript ? 'btn-ghost' : 'btn-primary'}"
											onclick={() => openChapterGenModal('detail', ch.id)}
											disabled={generatingChapterDetail[ch.id] || generatingAllDetails}
										>
											{#if generatingChapterDetail[ch.id]}
												<span class="loading loading-xs loading-spinner"></span>
												Generating...
											{:else}
												{ch.detailedScript ? 'Regenerate' : 'Generate Detail'}
											{/if}
										</button>
									</div>
									{#if ch.detailedScript}
										<details class="mt-2">
											<summary class="cursor-pointer text-xs text-base-content/50">
												Show script ({ch.detailedScript.length} chars)
											</summary>
											<pre
												class="mt-1 max-h-40 overflow-auto rounded bg-base-300 p-2 text-xs whitespace-pre-wrap">{ch.detailedScript}</pre>
										</details>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Step 4: Sections -->
			{#if hasScriptedChapters}
				<div class="card border border-base-300 bg-base-200">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<h2 class="card-title text-lg">Step 4 — Sections / Panels</h2>
							<button
								class="btn gap-1 btn-outline btn-sm"
								onclick={generateAllChapterSections}
								disabled={generatingAllSections}
							>
								{#if generatingAllSections}
									<span class="loading loading-xs loading-spinner"></span>
									Generating All...
								{:else}
									Generate All Sections
								{/if}
							</button>
						</div>
						<p class="text-sm text-base-content/50">
							Break each scripted chapter into manga panels/sections.
						</p>
						<div class="mt-2 divide-y divide-base-300">
							{#each data.chapters as ch}
								{#if ch.detailedScript}
									<div class="flex items-center justify-between py-3">
										<div class="flex items-center gap-2">
											<span class="badge badge-ghost badge-sm">Ch. {ch.chapterNumber}</span>
											<span class="text-sm font-medium">{ch.title || 'Untitled'}</span>
											{#if ch.sections && ch.sections.length > 0}
												<span class="badge badge-xs badge-success"
													>{ch.sections.length} sections</span
												>
											{:else}
												<span class="badge badge-xs badge-warning">no sections</span>
											{/if}
										</div>
										<button
											class="btn gap-1 btn-sm {ch.sections && ch.sections.length > 0
												? 'btn-ghost'
												: 'btn-primary'}"
											onclick={() => openChapterGenModal('sections', ch.id)}
											disabled={generatingChapterSections[ch.id] || generatingAllSections}
										>
											{#if generatingChapterSections[ch.id]}
												<span class="loading loading-xs loading-spinner"></span>
												Generating...
											{:else}
												{ch.sections && ch.sections.length > 0 ? 'Regenerate' : 'Generate Sections'}
											{/if}
										</button>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Phase 2 → 3 -->
			{#if hasChaptersWithSections}
				<div class="flex justify-end">
					<button class="btn gap-2 btn-primary" onclick={() => (gotoStep('script'))}>
						Continue to Script
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
						</svg>
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ═══════════ PHASE 3: SCRIPT ═══════════ -->
	{#if page.params.step === 'script'}
		<!-- Read Mode Toggle -->
		<div class="mb-6 flex justify-end">
			<label class="label cursor-pointer gap-3">
				<span class="label-text text-sm">Read Mode</span>
				<input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={readMode} />
			</label>
		</div>

		{#if readMode}
			<!-- ═══════ READ MODE ═══════ -->
			<div class="mx-auto max-w-3xl space-y-12">
				{#if data.chapters.length === 0}
					<p class="text-center text-base-content/50">No chapters generated yet.</p>
				{:else}
					{#each data.chapters as ch}
						<div>
							<h2 class="mb-6 border-b border-base-300 pb-3 text-center text-2xl font-bold">
								Chapter {ch.chapterNumber}: {ch.title || 'Untitled'}
							</h2>
							{#if ch.sections && ch.sections.length > 0}
								<div class="space-y-6">
									{#each ch.sections as sec}
										{@const imgUrl = getSectionImageUrl(sec)}
										<div class="space-y-2">
											{#if imgUrl}
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<div
													class="cursor-pointer overflow-hidden rounded-lg"
													onclick={() => openImagePreview(imgUrl)}
												>
													<img
														loading="lazy"
														src={imgUrl}
														alt="Panel {sec.sectionNumber}"
														class="w-full rounded-lg"
													/>
												</div>
											{:else if sec.status === 'generating' || sec.status === 'queued'}
												<div class="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-base-300">
													<span class="loading loading-md loading-spinner text-base-content/30"></span>
												</div>
											{/if}
											{#if sec.narrative}
												<p class="px-2 text-base leading-relaxed text-base-content/80">{sec.narrative}</p>
											{/if}
										</div>
									{/each}
								</div>
							{:else}
								<p class="text-center text-sm text-base-content/40">No panels for this chapter yet.</p>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		{:else}
		<!-- ═══════ EDIT MODE ═══════ -->
		<div class="space-y-6">
			<!-- Image Generation Controls -->
			{#if data.chapters.length > 0}
				<div class="card border border-base-300 bg-base-200">
					<div class="card-body">
						<h2 class="card-title text-lg">Image Generation</h2>

						{#if jobStatus && (generatingImages || activeJobId)}
							<div class="space-y-3">
								<div class="flex items-center gap-2">
									<span class="loading loading-sm loading-spinner"></span>
									<span class="text-sm">
										{jobStatus.status === 'submitted'
											? 'Waiting for batch to start...'
											: 'Generating images...'}
									</span>
								</div>
								<progress
									class="progress w-full progress-primary"
									value={jobStatus.completedItems + jobStatus.failedItems}
									max={jobStatus.totalItems}
								></progress>
								<p class="text-xs text-base-content/60">
									{jobStatus.completedItems}/{jobStatus.totalItems} completed
									{#if jobStatus.failedItems > 0}
										, {jobStatus.failedItems} failed
									{/if}
								</p>
							</div>
						{:else}
							<p class="text-sm text-base-content/50">
								Generate panel images for all sections that have image prompts.
							</p>
							<div class="mt-2 flex gap-3">
								<button
									class="btn btn-sm btn-primary"
									onclick={() => startImageGeneration('batch')}
									disabled={generatingImages}
								>
									Start Processing (1 credit/image)
								</button>
								<button
									class="btn btn-sm btn-secondary"
									onclick={() => startImageGeneration('fast')}
									disabled={true}
								>
									Fast (2 credits/image)
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Batch Queue Card -->
			{#if sectionBatchQueue.length > 0}
				<div class="card border border-warning bg-base-200">
					<div class="card-body py-4">
						<div class="flex items-center justify-between">
							<div>
								<h3 class="text-sm font-bold">Batch Queue</h3>
								<p class="text-xs text-base-content/60">
									{sectionBatchQueue.length} section(s) queued — {sectionBatchQueue.length} credit(s)
								</p>
							</div>
							<div class="flex gap-2">
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => (sectionBatchQueue = [])}
									disabled={submittingSectionBatch}
								>
									Clear
								</button>
								<button
									class="btn btn-sm btn-primary"
									onclick={submitSectionBatch}
									disabled={submittingSectionBatch || generatingImages}
								>
									{#if submittingSectionBatch}
										<span class="loading loading-xs loading-spinner"></span>
									{/if}
									Start Batch ({sectionBatchQueue.length})
								</button>
							</div>
						</div>
					</div>
				</div>
			{/if}

			{#if data.chapters.length === 0}
				<div class="card border border-base-300 bg-base-200">
					<div class="card-body items-center py-12 text-center">
						<p class="text-base-content/50">No chapters generated yet.</p>
						<button class="btn mt-3 btn-sm btn-primary" onclick={() => {
							console.log("page", page.url.pathname);
							
						}}>
							Go to Refine Phase
						</button>
					</div>
				</div>
			{:else}
				{#each data.chapters as ch}
					<div class="card border border-base-300 bg-base-200">
						<div class="card-body">
							<div class="flex items-center justify-between">
								<h2 class="card-title text-lg">
									Chapter {ch.chapterNumber}: {ch.title || 'Untitled'}
								</h2>
								<span class="badge badge-ghost badge-sm">{ch.status}</span>
							</div>

							<form method="post" action="?/updateChapter" use:enhance class="mt-2 space-y-3">
								<input type="hidden" name="chapterId" value={ch.id} />
								<label class="form-control w-full">
									<div class="label"><span class="label-text text-sm">Title</span></div>
									<input
										type="text"
										name="title"
										value={ch.title ?? ''}
										class="input-bordered input input-sm w-full"
									/>
								</label>
								<label class="form-control w-full">
									<div class="label"><span class="label-text text-sm">Summary</span></div>
									<textarea
										name="summary"
										class="textarea-bordered textarea h-20 w-full textarea-sm"
										>{ch.summary ?? ''}</textarea
									>
								</label>
								<label class="form-control w-full">
									<div class="label">
										<span class="label-text text-sm">Detailed Script</span>
									</div>
									<textarea
										name="detailedScript"
										class="textarea-bordered textarea h-40 w-full font-mono textarea-sm"
										placeholder="Chapter script with panel descriptions..."
										>{ch.detailedScript ?? ''}</textarea
									>
								</label>
								<div class="flex justify-end">
									<button class="btn btn-sm btn-primary">Save Chapter</button>
								</div>
							</form>

							<!-- Sections -->
							{#if ch.sections && ch.sections.length > 0}
								<div class="mt-4">
									<div class="mb-2 flex items-center justify-between">
										<h3 class="text-sm font-medium">
											Sections/Panels ({ch.sections.length})
										</h3>
										<div class="flex gap-1">
											<button
												class="btn btn-xs btn-primary"
												onclick={() =>
													startImageGeneration(
														'fast',
														ch.sections
															.filter((s: { imagePrompt?: string | null }) => s.imagePrompt)
															.map((s: { id: string }) => s.id)
													)}
												disabled={true}
											>
												Generate All
											</button>
											<button
												class="btn btn-outline btn-xs"
												onclick={() =>
													startImageGeneration(
														'batch',
														ch.sections
															.filter((s: { imagePrompt?: string | null }) => s.imagePrompt)
															.map((s: { id: string }) => s.id)
													)}
												disabled={generatingImages}
											>
												Batch All
											</button>
										</div>
									</div>
									<div class="space-y-2">
										{#each ch.sections as sec}
											<div class="rounded-lg bg-base-300 p-3">
												<div class="mb-1 flex items-center justify-between">
													<span class="text-xs font-medium">Panel {sec.sectionNumber}</span>
													<div class="flex items-center gap-1">
														<span class="badge badge-outline badge-xs">{sec.sectionType}</span>
														<span class="badge badge-ghost badge-xs">{sec.panelLayout}</span>
														{#if sec.status === 'generating'}
															<span class="badge badge-xs badge-warning">generating</span>
														{:else if sec.status === 'complete'}
															<span class="badge badge-xs badge-success">complete</span>
														{/if}
													</div>
												</div>
												{#if sec.narrative}
													<p class="text-sm text-base-content/70">{sec.narrative}</p>
												{/if}
												{#if sec.imagePrompt}
													<p class="mt-1 text-xs text-base-content/40 italic">
														Prompt: {sec.imagePrompt}
													</p>
													{#if sec.status !== 'generating' && sec.status !== 'complete'}
														<div class="mt-1 flex gap-1">
															<button
																class="btn btn-xs btn-primary"
																onclick={() =>
																	openSectionImageModal(
																		sec.id,
																		`Panel ${sec.sectionNumber}`,
																		'fast',
																		sec.imagePrompt ?? ''
																	)}
																disabled={true}
															>
																Generate
															</button>
															{#if !isInSectionBatch(sec.id)}
																<button
																	class="btn btn-outline btn-xs"
																	onclick={() =>
																		openSectionImageModal(
																			sec.id,
																			`Panel ${sec.sectionNumber}`,
																			'batch',
																			sec.imagePrompt ?? ''
																		)}
																	disabled={generatingImages}
																>
																	Add to Batch
																</button>
															{:else}
																<span class="badge badge-xs badge-info">In batch</span>
															{/if}
														</div>
													{/if}
												{/if}
												{#if sec.images && sec.images.length > 0}
													<div class="mt-2 flex flex-wrap gap-2">
														{#each sec.images as img}
															<div
																class="relative h-24 w-24 overflow-hidden rounded border-2 {img.isSelected
																	? 'border-primary'
																	: 'border-base-content/10'}"
															>
																<img
																	loading="lazy"
																	src={getSectionImageUrl(sec)}
																	alt="Panel {sec.sectionNumber} v{img.version}"
																	class="h-full w-full object-cover"
																/>
																{#if img.isSelected}
																	<div class="absolute top-0.5 right-0.5">
																		<span class="badge badge-xs badge-primary">selected</span>
																	</div>
																{/if}
															</div>
														{/each}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</div>
		{/if}
	{/if}
</div>

<!-- Modal A: Per-Character AI Input -->
<dialog bind:this={charAiDialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">AI Generation for {activeCharModalName}</h3>
		<p class="py-2 text-sm text-base-content/60">
			Add optional instructions to guide the AI when generating this character's description and
			visual details.
		</p>
		<textarea
			class="textarea-bordered textarea w-full"
			placeholder="e.g., She should have red hair and wear a school uniform..."
			bind:value={charModalInput}
			rows="3"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={cancelCharAiModal}>Cancel</button>
			<button class="btn btn-primary" onclick={saveCharAiModal}>Select for Generation</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Modal B: Generate Cast -->
<dialog bind:this={castDialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">Generate Characters & Locations</h3>
		<p class="py-2 text-sm text-base-content/60">
			{#if data.characters.length > 0 || data.locations.length > 0}
				Existing characters and locations will be preserved. The AI will only generate new ones.
			{:else}
				AI will create characters and locations based on your story details.
			{/if}
			Add optional instructions below.
		</p>
		<textarea
			class="textarea-bordered textarea w-full"
			placeholder="e.g., Add a mother character for the main character who is strict but caring..."
			bind:value={castModalInput}
			rows="3"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => castDialog?.close()}>Cancel</button>
			<button class="btn btn-primary" onclick={submitCastModal} disabled={generatingCast}>
				{#if generatingCast}
					<span class="loading loading-xs loading-spinner"></span>
					Generating...
				{:else}
					Generate
				{/if}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Modal: Story Overview -->
<dialog bind:this={storyOverviewDialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">Generate Story Overview</h3>
		<p class="py-2 text-sm text-base-content/60">
			{#if hasDetailedStory}
				The current story overview will be fed back to the AI as a base. Add optional instructions
				to guide changes or improvements.
			{:else}
				AI will generate a detailed story overview from your synopsis and characters. Add optional
				instructions below.
			{/if}
		</p>
		<textarea
			class="textarea-bordered textarea w-full"
			placeholder="e.g., Make the ending more dramatic, add a betrayal subplot, focus more on the romance..."
			bind:value={storyOverviewModalInput}
			rows="3"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => storyOverviewDialog?.close()}>Cancel</button>
			<button class="btn btn-primary" onclick={submitStoryOverviewModal} disabled={expandingStory}>
				{#if expandingStory}
					<span class="loading loading-xs loading-spinner"></span>
					Generating...
				{:else}
					Generate
				{/if}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Modal C: Generate Locations -->
<dialog bind:this={locationsDialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">Generate Locations with AI</h3>
		<p class="py-2 text-sm text-base-content/60">
			{#if data.locations.length > 0}
				Existing locations will be preserved. The AI will only generate new ones.
			{:else}
				AI will create locations based on your story and characters.
			{/if}
			Add optional instructions below.
		</p>
		<textarea
			class="textarea-bordered textarea w-full"
			placeholder="e.g., Add the city where the main character lives, a dark forest..."
			bind:value={locationsModalInput}
			rows="3"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => locationsDialog?.close()}>Cancel</button>
			<button class="btn btn-primary" onclick={submitLocationsModal} disabled={generatingLocations}>
				{#if generatingLocations}
					<span class="loading loading-xs loading-spinner"></span>
					Generating...
				{:else}
					Generate
				{/if}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Modal D: Edit Image -->
<dialog bind:this={editImageDialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">Edit Image — {editImageEntityName}</h3>
		<p class="py-2 text-sm text-base-content/60">
			Describe what you want AI to change in the current image.
			{#if editImageMode === 'fast'}
				This will generate immediately (2 credits).
			{:else}
				This will be added to the batch queue (1 credit).
			{/if}
		</p>
		<textarea
			class="textarea-bordered textarea w-full"
			placeholder="e.g., Make the hair longer, change the outfit to a red dress, add a scar on the left cheek..."
			bind:value={editImagePrompt}
			rows="3"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => editImageDialog?.close()}>Cancel</button>
			<button class="btn btn-primary" onclick={submitEditImage} disabled={!editImagePrompt.trim()}>
				{editImageMode === 'fast' ? 'Generate Now' : 'Add to Batch'}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Modal E: Image Preview -->
<dialog bind:this={previewImageDialog} class="modal">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-box max-w-5xl p-2" onclick={() => previewImageDialog?.close()}>
		{#if previewImageUrl}
			<img src={previewImageUrl} alt="Preview" class="max-h-[85vh] w-full rounded object-contain" />
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Modal F: Chapter Generation -->
<dialog bind:this={chapterGenDialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">{chapterGenModalTitle()}</h3>
		<p class="py-2 text-sm text-base-content/60">
			Add optional instructions to guide the AI generation.
		</p>
		<textarea
			class="textarea-bordered textarea w-full"
			placeholder="e.g., Make chapters shorter, focus on action scenes, include a cliffhanger..."
			bind:value={chapterGenFeedback}
			rows="3"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => chapterGenDialog?.close()}>Cancel</button>
			<button class="btn btn-primary" onclick={submitChapterGenModal}> Generate </button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<!-- Modal G: Section Image Generation -->
<dialog bind:this={sectionImageDialog} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">
			Generate Image — {sectionImageTargetLabel}
		</h3>
		<p class="py-2 text-sm text-base-content/60">
			{#if sectionImageMode === 'fast'}
				Generate immediately (2 credits/image).
			{:else}
				Add to batch queue (1 credit/image).
			{/if}
			Edit the prompt below — changes will be saved.
		</p>
		<textarea
			class="textarea-bordered textarea w-full font-mono textarea-sm"
			bind:value={sectionImagePrompt}
			rows="8"
		></textarea>
		<div class="modal-action">
			<button class="btn btn-ghost" onclick={() => sectionImageDialog?.close()}>Cancel</button>
			<button
				class="btn btn-primary"
				onclick={submitSectionImageModal}
				disabled={!sectionImagePrompt.trim()}
			>
				{sectionImageMode === 'fast' ? 'Generate Now' : 'Add to Batch'}
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
