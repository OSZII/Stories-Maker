# Google Gemini Batch Image Generation

How the batch request flow works in this project, with code examples and a ready-to-use AI prompt.

---

## How It Works

The project uses Google Gemini's Batch API to generate hundreds of images asynchronously. Instead of making one API call per image (slow, rate-limited), you submit all requests at once as a JSONL file, let Gemini process them in the background, then download all results when done.

**Flow: Build JSONL → Upload file → Create job → Poll → Download**

---

## Stage 1 — Build the JSONL Input File

Each image description becomes a JSON object on its own line. Every line has a unique `key` and a `request` payload in Gemini's content format.

```ts
// batchManager.ts — createBatchPrompts()
function createBatchPrompts(imageDescriptions: string[]): BatchRequest[] {
	return imageDescriptions.map((description) => ({
		key: `image-${crypto.randomUUID()}`,
		request: {
			contents: [{ parts: [{ text: generatePrompt(description) }] }]
		}
	}));
}

function writeBatchToJsonl(prompts: BatchRequest[], outputPath = 'batch_input.jsonl'): string {
	const jsonlContent = prompts.map((p) => JSON.stringify(p)).join('\n');
	fs.writeFileSync(outputPath, jsonlContent);
	return outputPath;
}
```

Resulting file (one JSON object per line, no trailing commas):

```jsonl
{"key":"image-abc123","request":{"contents":[{"parts":[{"text":"Generate an image based on: ..."}]}]}}
{"key":"image-def456","request":{"contents":[{"parts":[{"text":"Generate an image based on: ..."}]}]}}
```

---

## Stage 2 — Upload the JSONL to Gemini's File API (Resumable Upload)

Gemini requires a 2-step upload: first initiate to get an upload URL, then stream the file bytes to that URL.

```ts
// batchManager.ts — uploadFileToGemini()
async function uploadFileToGemini(filePath: string): Promise<string> {
	const fileContent = fs.readFileSync(filePath);
	const fileSizeBytes = fileContent.length;

	// Part A: Initiate — get the upload URL
	const initResponse = await fetch(
		`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
		{
			method: 'POST',
			headers: {
				'X-Goog-Upload-Protocol': 'resumable',
				'X-Goog-Upload-Command': 'start',
				'X-Goog-Upload-Header-Content-Length': fileSizeBytes.toString(),
				'X-Goog-Upload-Header-Content-Type': 'application/jsonl',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ file: { displayName: fileName } })
		}
	);
	const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL');

	// Part B: Upload the raw file bytes
	const uploadResponse = await fetch(uploadUrl, {
		method: 'POST',
		headers: {
			'X-Goog-Upload-Offset': '0',
			'X-Goog-Upload-Command': 'upload, finalize',
			'Content-Length': fileSizeBytes.toString()
		},
		body: fileContent
	});

	const uploadResult = await uploadResponse.json();
	return uploadResult.file.uri;
	// e.g. "https://generativelanguage.googleapis.com/v1beta/files/abc123"
}
```

---

## Stage 3 — Create the Batch Job

Pass the file URI to Gemini's batch endpoint.

**Critical gotcha**: the API only accepts the short-form path (`files/<name>`), not the full URI. Strip everything before and including `/v1beta/`.

```ts
// batchManager.ts — createBatchJob()
async function createBatchJob(fileUri: string, model = 'gemini-3-pro-image-preview') {
	// Strip full URI to just: "files/<name>"
	const relevantPartOfFileUrl = fileUri.split('/v1beta/').pop();

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent?key=${apiKey}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				batch: {
					display_name: 'my-batch-request-1',
					input_config: { file_name: relevantPartOfFileUrl }
				}
			})
		}
	);

	return response.json();
	// { name: "operations/batches/<id>", metadata: { state: "...", ... } }
}
```

---

## Stage 4 — Poll for Status, Then Download Results

The batch job is async. Poll `GET /v1beta/{job.name}` on an interval until `state === "BATCH_STATE_SUCCEEDED"`, then download the responses JSONL file.

```ts
// batchManager.ts — getBatchStatus()
async function getBatchStatus(batchJob) {
	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/${batchJob.name}?key=${apiKey}`
	);
	return response.json();
	// { done: true, metadata: { state: "BATCH_STATE_SUCCEEDED" }, response: { responsesFile: "files/responses-xyz" } }
}

// batchManager.ts — downloadBatchResponses()
async function downloadBatchResponses(batchJob) {
	const response = await fetch(
		`https://generativelanguage.googleapis.com/download/v1beta/${batchJob.response.responsesFile}:download?key=${apiKey}&alt=media`
	);
	// Stream response body to disk
	const writer = fs.createWriteStream('batch_download_responses.jsonl');
	await pipeline(response.body, writer);
}
```

Polling loop from `index.ts`:

```ts
// index.ts — handlePollingAction()
const pollForStatus = async () => {
	const status = await getBatchStatus(batchResult);

	if (status.metadata.state === 'BATCH_STATE_SUCCEEDED' && status.done) {
		await downloadBatchResponses(status);
	} else if (status.metadata.state === 'BATCH_STATE_FAILED') {
		process.exit(1);
	} else {
		setTimeout(pollForStatus, POLLING_INTERVAL); // retry after delay
	}
};
```

---

## Batch State Values

| State                   | Meaning                             |
| ----------------------- | ----------------------------------- |
| `BATCH_STATE_SUCCEEDED` | All requests completed successfully |
| `BATCH_STATE_FAILED`    | Job failed                          |
| `BATCH_STATE_CANCELLED` | Job was cancelled                   |
| `BATCH_STATE_EXPIRED`   | Job expired before completion       |

---

## CLI Usage (This Project)

```bash
# Step 1: Generate image descriptions and create the batch job
npx tsx index.ts --action batch

# Step 2: Poll until done and download results
npx tsx index.ts --action polling

# Step 3: Extract images from the JSONL responses
npx tsx index.ts --action write-images

# Step 4: Upscale generated images
npx tsx index.ts --action upscale

# Step 5: Generate metadata and CSV for Adobe Stock upload
npx tsx index.ts --action metadata
npx tsx index.ts --action generate-csv
```

---

## AI Prompt (Copy-Paste Ready)

Use this when asking an AI to implement the same pattern:

```
You are implementing Google Gemini's Batch API for async image generation.
The flow has 4 steps:

---

STEP 1 — Build a JSONL input file
Each item is a JSON object on its own line with a unique key and a Gemini-formatted request:

{"key":"image-<uuid>","request":{"contents":[{"parts":[{"text":"<prompt text>"}]}]}}

Write all items to a .jsonl file (one object per line, no trailing commas).

---

STEP 2 — Upload the JSONL using Gemini's resumable File API (2-part process):

Part A: Initiate the upload to get an upload URL
  POST https://generativelanguage.googleapis.com/upload/v1beta/files?key=<API_KEY>
  Headers:
    X-Goog-Upload-Protocol: resumable
    X-Goog-Upload-Command: start
    X-Goog-Upload-Header-Content-Length: <byte size of file>
    X-Goog-Upload-Header-Content-Type: application/jsonl
    Content-Type: application/json
  Body: { "file": { "displayName": "<filename>" } }
  Read the upload URL from response header: X-Goog-Upload-URL

Part B: Upload the file bytes to the upload URL
  POST <upload URL from Part A>
  Headers:
    X-Goog-Upload-Offset: 0
    X-Goog-Upload-Command: upload, finalize
    Content-Length: <byte size>
  Body: <raw file bytes>
  Response contains: { "file": { "uri": "https://.../v1beta/files/<name>", ... } }

---

STEP 3 — Create the batch job
  POST https://generativelanguage.googleapis.com/v1beta/models/<MODEL>:batchGenerateContent?key=<API_KEY>
  Headers: Content-Type: application/json
  Body:
    {
      "batch": {
        "display_name": "my-batch",
        "input_config": {
          "file_name": "<ONLY the short path: files/<name>, NOT the full URI>"
        }
      }
    }

  IMPORTANT: Strip the full URI down to just the path after /v1beta/, e.g.:
    "https://.../v1beta/files/abc123" → use "files/abc123"

  Response: { "name": "operations/batches/<id>", "metadata": { "state": "...", ... } }

---

STEP 4 — Poll for completion, then download results

  Poll:
  GET https://generativelanguage.googleapis.com/v1beta/<job.name>?key=<API_KEY>
  Check response.metadata.state:
    "BATCH_STATE_SUCCEEDED" + done: true  → proceed to download
    "BATCH_STATE_FAILED" / "BATCH_STATE_CANCELLED"  → handle error
    otherwise  → wait and retry (e.g. every 30 seconds)

  Download (when done):
  GET https://generativelanguage.googleapis.com/download/v1beta/<responsesFile>:download?key=<API_KEY>&alt=media
  Stream response body to a .jsonl file on disk.

---

State enum values: BATCH_STATE_SUCCEEDED | BATCH_STATE_FAILED | BATCH_STATE_CANCELLED | BATCH_STATE_EXPIRED
Environment variable needed: GOOGLE_API_KEY
```
