// ── Claude Vision Analyzer ───────────────────────────────────
// Uses Claude API to analyze images and video frames.
// For videos, extract key frames and send as images.
// Returns a detailed text description of the issue shown in the media.

import { config } from './config';
import { Attachment } from './transformer';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

const VISION_PROMPT = `You are a senior QA engineer at Whatfix, a Digital Adoption Platform company.

Analyze the provided image(s) or video frames carefully. This shows a software bug, issue, or behavior that needs to be reported as a Jira ticket.

Your job is to extract a DETAILED text description of the issue by observing:
1. What application/screen is shown
2. What is happening (errors, broken UI, incorrect data, unexpected state)
3. What steps led to this (if video, describe sequence)
4. Any error messages (transcribe visible text)
5. Expected behavior
6. Environment clues (browser, OS, URL bar, staging/production)
7. Whatfix product context (Flows, Smart Tips, Self Help, Editor, Quick Capture, Analytics, etc.)

Output a detailed description in plain text. Include:
- One-line summary
- Detailed description
- Steps to reproduce (numbered)
- Expected vs actual behavior
- Error messages
- Environment details

If the user also provided text, incorporate it into your analysis.`;

function isImage(mimetype: string): boolean {
  return mimetype.startsWith('image/');
}

function isVideo(mimetype: string): boolean {
  return mimetype.startsWith('video/');
}

export function hasVisualMedia(attachments: Attachment[]): boolean {
  return attachments.some(a => isImage(a.mimetype) || isVideo(a.mimetype));
}

// ── Extract frames from video using ffmpeg ──────────────────
export async function extractFramesFromVideo(localPath: string, maxFrames = 6): Promise<string[]> {
  const frameDir = path.join(path.dirname(localPath), 'frames_' + Date.now());
  fs.mkdirSync(frameDir, { recursive: true });
  const framePattern = path.join(frameDir, 'frame_%03d.png');
  // 1 frame every 2 seconds, maxFrames total
  const cmd = `ffmpeg -i "${localPath}" -vf "fps=0.5" -frames:v ${maxFrames} "${framePattern}"`;
  child_process.execSync(cmd);
  // Collect frame files
  const frames = fs.readdirSync(frameDir)
    .filter(f => f.endsWith('.png'))
    .map(f => path.join(frameDir, f));
  return frames;
}

// ── Claude Vision API call ──────────────────────────────────
export async function analyzeMediaWithClaude(
  attachments: Attachment[],
  userText: string = '',
): Promise<string> {
  if (!config.claudeApiKey) {
    console.warn('[vision] No CLAUDE_API_KEY set — skipping visual analysis');
    return '';
  }

  // Prepare image parts
  const visualAttachments: Attachment[] = [];
  for (const att of attachments) {
    if (isImage(att.mimetype) && att.localPath && fs.existsSync(att.localPath)) {
      visualAttachments.push(att);
    } else if (isVideo(att.mimetype) && att.localPath && fs.existsSync(att.localPath)) {
      // Extract frames
      try {
        const framePaths = await extractFramesFromVideo(att.localPath);
        for (const fp of framePaths) {
          visualAttachments.push({
            name: path.basename(fp),
            mimetype: 'image/png',
            url: '',
            localPath: fp,
          });
        }
      } catch (err) {
        console.warn(`[vision] Failed to extract frames from video: ${att.name}`, err);
      }
    }
  }

  if (visualAttachments.length === 0) {
    console.log('[vision] No visual media with local files found');
    return '';
  }

  // Build Claude vision API payload
  const parts: any[] = [];
  for (const att of visualAttachments) {
    const fileBuffer = fs.readFileSync(att.localPath!);
    const base64Data = fileBuffer.toString('base64');
    parts.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: base64Data,
      },
    });
  }
  // Add text prompt
  let prompt = VISION_PROMPT;
  if (userText && userText.trim()) {
    prompt += `\n\nThe user also provided this context: "${userText}"`;
  }
  parts.push({ type: 'text', text: prompt });

  // Call Claude API
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.claudeApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 2048,
      temperature: 0.2,
      system: VISION_PROMPT,
      messages: [{ role: 'user', content: parts }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[vision] Claude API error ${res.status}:`, errText);
    return '';
  }

  const data = (await res.json()) as any;
  const text = data.content?.[0]?.text || '';

  if (!text) {
    console.warn('[vision] Claude returned empty response');
    return '';
  }

  console.log(`[vision] Claude analysis complete (${text.length} chars)`);
  console.log(`[vision] Preview: ${text.substring(0, 200)}...`);
  return text;
}
