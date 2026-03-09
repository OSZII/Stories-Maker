/**
 * Cloudflare R2 storage client (S3-compatible).
 * Provides upload, get, and delete operations for generated images.
 */
import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand
} from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

const r2 = new S3Client({
	region: 'auto',
	endpoint: env.R2_ENDPOINT,
	credentials: {
		accessKeyId: env.R2_ACCESS_KEY_ID!,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY!
	}
});

const bucket = env.R2_BUCKET_NAME!;
const publicBase = `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}`;

/** Upload an image buffer to R2. Returns the storage key. */
export async function uploadImage(buffer: Buffer, key: string, contentType = 'image/png') {
	await r2.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: buffer,
			ContentType: contentType
		})
	);
	return key;
}

/** Retrieve an image object from R2 by key. */
export async function getImage(key: string) {
	const response = await r2.send(
		new GetObjectCommand({
			Bucket: bucket,
			Key: key
		})
	);
	return response;
}

/** Delete an image from R2 by key. */
export async function deleteImage(key: string) {
	await r2.send(
		new DeleteObjectCommand({
			Bucket: bucket,
			Key: key
		})
	);
}
