export const R2_BASE = 'https://stories-maker-bucket.ostojicstefan.com';

export function getCharacterImageUrl(
	projectId: string,
	character: {
		id: string;
		images: Array<{ imageId: string | null; isPrimary: boolean; status: string }>;
	}
) {
	const img =
		character.images.find((i) => i.isPrimary && i.imageId && i.status === 'complete') ||
		character.images.find((i) => i.imageId && i.status === 'complete');
	if (!img?.imageId) return '';
	return `${R2_BASE}/stories/${projectId}/characters/${character.id}/${img.imageId}.jpg`;
}

export function getLocationImageUrl(
	projectId: string,
	loc: {
		id: string;
		images: Array<{ imageId: string | null; isPrimary: boolean; status: string }>;
	}
) {
	const img =
		loc.images.find((i) => i.isPrimary && i.imageId && i.status === 'complete') ||
		loc.images.find((i) => i.imageId && i.status === 'complete');
	if (!img?.imageId) return '';
	return `${R2_BASE}/stories/${projectId}/locations/${loc.id}/${img.imageId}.jpg`;
}

export function getCharImageHistoryUrl(projectId: string, charId: string, imageId: string) {
	return `${R2_BASE}/stories/${projectId}/characters/${charId}/${imageId}.jpg`;
}

export function getLocImageHistoryUrl(projectId: string, locId: string, imageId: string) {
	return `${R2_BASE}/stories/${projectId}/locations/${locId}/${imageId}.jpg`;
}

export function getSectionImageUrl(projectId: string, section: any) {
	let selectedImage = section.images.find((image: any) => image.isSelected);
	if (!selectedImage) return '';
	return `${R2_BASE}/stories/${projectId}/sections/${section.id}/${selectedImage.imageId}.jpg`;
}

export function getPrimaryImage(
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

export function hasQueuedOrGenerating(images: Array<{ status: string }>) {
	return images.some((i) => i.status === 'queued' || i.status === 'generating');
}
