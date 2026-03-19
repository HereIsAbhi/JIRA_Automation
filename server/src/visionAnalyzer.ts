// ── Gemini Vision Analyzer ───────────────────────────────────
// Uses Google Gemini API to analyze images and videos.
// Gemini natively supports video input — no FFmpeg needed.
// Returns a detailed text description of the issue shown in the media.

import { config } from './config';
import { Attachment } from './transformer';
import fs from 'fs';

// ── Gemini vision prompt ─────────────────────────────────────

const VISION_PROMPT = `You are a senior QA engineer at Whatfix, a Digital Adoption Platform company.

Analyze the provided image(s) or video carefully. This shows a software bug, issue, or behavior that needs to be reported as a Jira ticket.

Your job is to extract a DETAILED text description of the issue by observing:

1. **What application/screen is shown** — identify the product, page, UI elements visible
2. **What is happening** — describe the actual behavior shown (errors, broken UI, incorrect data, unexpected state)
3. **What steps led to this** — if a video, describe the sequence of user actions step by step
4. **Any error messages** — transcribe any error text, toast messages, console errors, alert dialogs visible
5. **Expected behavior** — what should have happened instead (infer from context)
6. **Environment clues** — browser (Chrome/Firefox/Safari), OS, URL bar content, staging/production indicators
7. **Whatfix product context** — if this involves any Whatfix product (Flows, Smart Tips, Self Help, Editor, Quick Capture, Analytics, Beacons, Launchers, Task List, Pop-ups, Mirror, Product Analytics, DAP Script), identify it

Output a detailed description in plain text (NOT JSON). Be specific and thorough. Include:
- A one-line summary of the issue
- Detailed description of what you see
- Steps to reproduce (numbered, if video shows a sequence)
- Expected vs actual behavior
- Any error messages verbatim
- Environment details if visible

If the user also provided text along with the media, incorporate that context into your analysis.`;

// ── Supported media types ────────────────────────────────────

function isImage(mimetype: string): boolean {
  return mimetype.startsWith('image/');
}

function isVideo(mimetype: string): boolean {
  return mimetype.startsWith('video/');
}

export function hasVisualMedia(attachments: Attachment[]): boolean {
  return attachments.some(a => isImage(a.mimetype) || isVideo(a.mimetype));
}

// ── Map mimetype to Gemini-supported mime types ──────────────

function geminiMimeType(mimetype: string): string {
  // Gemini supports these image types
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
  // Gemini supports these video types
  const videoTypes = ['video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 'video/x-flv',
    'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp', 'video/quicktime'];

  if (imageTypes.includes(mimetype)) return mimetype;
  if (videoTypes.includes(mimetype)) return mimetype;

  // Fallback mappings
  if (mimetype.startsWith('image/')) return 'image/png';
  if (mimetype === 'video/quicktime') return 'video/mp4';
  if (mimetype.startsWith('video/')) return 'video/mp4';

  return mimetype;
}

// ── Upload file to Gemini File API (required for video) ──────

async function uploadToGeminiFileAPI(filePath: string, mimetype: string, displayName: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const fileSizeBytes = fileBuffer.length;
  const mimeType = geminiMimeType(mimetype);

  console.log(`[vision] Uploading ${displayName} (${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB) to Gemini File API...`);

  // Step 1: Start resumable upload
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${config.geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSizeBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    },
  );

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`Gemini File API start failed: ${startRes.status} — ${err}`);
  }

  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('No upload URL returned from Gemini File API');

  // Step 2: Upload the file bytes
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Length': String(fileSizeBytes),
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Gemini File API upload failed: ${uploadRes.status} — ${err}`);
  }

  const uploadData = (await uploadRes.json()) as any;
  const fileUri = uploadData.file?.uri;
  if (!fileUri) throw new Error('No file URI returned from Gemini File API');

  console.log(`[vision] Uploaded to Gemini: ${fileUri}`);

  // Step 3: Wait for file to be processed (ACTIVE state)
  let state = uploadData.file?.state || 'PROCESSING';
  let attempts = 0;
  while (state === 'PROCESSING' && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000)); // wait 2s
    const checkRes = await fetch(
      `${fileUri}?key=${config.geminiApiKey}`,
    );
    if (checkRes.ok) {
      const checkData = (await checkRes.json()) as any;
      state = checkData.state || 'PROCESSING';
      console.log(`[vision] File state: ${state} (attempt ${attempts + 1})`);
    }
    attempts++;
  }

  if (state !== 'ACTIVE') {
    throw new Error(`Gemini file not ready after ${attempts} attempts. State: ${state}`);
  }

  return fileUri;
}

// ── Analyze media with Gemini ────────────────────────────────

export async function analyzeMediaWithGemini(
  attachments: Attachment[],
  userText: string = '',
): Promise<string> {
  if (!config.geminiApiKey) {
    console.warn('[vision] No GEMINI_API_KEY set — skipping visual analysis');
    return '';
  }

  const visualAttachments = attachments.filter(a =>
    (isImage(a.mimetype) || isVideo(a.mimetype)) && a.localPath && fs.existsSync(a.localPath),
  );

  if (visualAttachments.length === 0) {
    console.log('[vision] No visual media with local files found');
    return '';
  }

  console.log(`[vision] Analyzing ${visualAttachments.length} visual attachment(s) with Gemini...`);

  try {
    // Build content parts for Gemini
    const parts: any[] = [];

    for (const att of visualAttachments) {
      if (isVideo(att.mimetype)) {
        // Videos must be uploaded via File API first
        const fileUri = await uploadToGeminiFileAPI(att.localPath!, att.mimetype, att.name);
        parts.push({
          fileData: {
            mimeType: geminiMimeType(att.mimetype),
            fileUri: fileUri,
          },
        });
      } else {
        // Images can be sent inline as base64
        const fileBuffer = fs.readFileSync(att.localPath!);
        const base64Data = fileBuffer.toString('base64');
        parts.push({
          inlineData: {
            mimeType: geminiMimeType(att.mimetype),
            data: base64Data,
          },
        });
      }
    }

    // Add the text prompt
    let prompt = VISION_PROMPT;
    if (userText && userText.trim()) {
      prompt += `\n\nThe user also provided this context: "${userText}"`;
    }
    parts.push({ text: prompt });

    // Call Gemini API
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[vision] Gemini API error ${res.status}:`, errText);
      throw new Error(`Gemini API ${res.status}`);
    }

    const data = (await res.json()) as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      console.warn('[vision] Gemini returned empty response');
      return '';
    }

    console.log(`[vision] Gemini analysis complete (${text.length} chars)`);
    console.log(`[vision] Preview: ${text.substring(0, 200)}...`);
    return text;
  } catch (err) {
    console.error('[vision] Gemini analysis failed:', err);
    return '';
  }
}
