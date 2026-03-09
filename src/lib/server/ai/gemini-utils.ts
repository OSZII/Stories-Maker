/**
 * Utility for parsing Gemini API responses that contain inline image data.
 */

interface GeminiCandidate {
	content?: {
		parts?: Array<{
			text?: string;
			inlineData?: {
				mimeType: string;
				data: string;
			};
		}>;
	};
}

/**
 * Extract the first image part from a Gemini response candidate.
 * Returns the decoded buffer and MIME type, or null if no image is found.
 */
export function extractImageFromGeminiResponse(
	candidate: GeminiCandidate
): { buffer: Buffer; mimeType: string } | null {
	const parts = candidate?.content?.parts;
	if (!parts) return null;

	for (const part of parts) {
		if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
			return {
				buffer: Buffer.from(part.inlineData.data, 'base64'),
				mimeType: part.inlineData.mimeType
			};
		}
	}

	return null;
}
