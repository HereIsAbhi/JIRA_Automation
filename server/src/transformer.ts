import { config } from './config';

// ── Attachment type ──────────────────────────────────────────

export interface Attachment {
  name: string;
  mimetype: string;
  url: string;
  localPath?: string;
}

// ── Structured Issue with rich fields ────────────────────────

export type StructuredIssue = {
  summary: string;
  description: string;
  steps_to_reproduce: string;
  expected_behavior: string;
  actual_behavior: string;
  acceptance_criteria: string[];
  priority: 'Lowest' | 'Low' | 'Medium' | 'High' | 'Highest';
  labels: string[];
  components: string[];
  issue_type: 'Bug' | 'Task' | 'Story' | 'Improvement';
  triage: string;
  environment: string;
  estimated_effort: string;
  attachments: Attachment[];
};

// ── Claude system prompt ─────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior engineering project manager.
Given a raw, informal description of a software issue or feature request,
produce a well-structured Jira ticket in JSON format.

Return ONLY valid JSON with these exact fields:
{
  "summary": "short one-line title (max 120 chars)",
  "description": "detailed description with context, impact, and technical details",
  "steps_to_reproduce": "numbered step-by-step instructions to reproduce (for bugs). Use newline chars for steps. Leave empty string for non-bugs",
  "expected_behavior": "what should happen (for bugs). Leave empty string for non-bugs",
  "actual_behavior": "what actually happens (for bugs). Leave empty string for non-bugs",
  "acceptance_criteria": ["list of specific, testable acceptance criteria"],
  "priority": "one of: Lowest, Low, Medium, High, Highest",
  "labels": ["relevant labels like bug, frontend, backend, security, performance"],
  "components": ["affected system components"],
  "issue_type": "one of: Bug, Task, Story, Improvement",
  "triage": "one of: Needs Investigation, Confirmed, Cannot Reproduce, Duplicate",
  "environment": "environment info if mentioned (browser, OS, staging/production), or empty string",
  "estimated_effort": "estimated effort: S, M, L, or XL"
}

Rules:
- Infer priority from urgency cues (crash/500/data loss=High/Highest, cosmetic/typo=Low)
- Extract steps to reproduce from the text if it is a bug
- Separate expected vs actual behavior clearly
- Set triage to "Needs Investigation" by default for bugs, "Confirmed" for features/tasks
- Detect environment info from text (browser, OS, production/staging mentions)
- Keep summary concise but descriptive
- Return ONLY the JSON object, no markdown fences, no explanation`;

// ── Main transform function ──────────────────────────────────

export async function transformRawIssue(
  raw: string,
  attachments: Attachment[] = [],
): Promise<StructuredIssue> {
  let result: StructuredIssue;

  if (config.claudeApiKey) {
    console.log('[transformer] Using Claude API');
    result = await transformWithClaude(raw);
  } else if (config.openaiApiKey) {
    console.log('[transformer] Using OpenAI API');
    result = await transformWithOpenAI(raw);
  } else {
    console.log('[transformer] No LLM API key set — using mock transform');
    result = mockTransform(raw);
  }

  // Merge attachments
  result.attachments = attachments;

  // Append attachment refs to description
  if (attachments.length > 0) {
    const section = attachments
      .map((a) => {
        const icon = a.mimetype.startsWith('image/')
          ? '🖼️'
          : a.mimetype.startsWith('video/')
            ? '🎥'
            : '📎';
        return `${icon} [${a.name}](${a.url})`;
      })
      .join('\n');
    result.description += `\n\n---\n**Attachments (${attachments.length}):**\n${section}`;
  }

  return result;
}

// ── Claude API (raw fetch — no SDK needed) ───────────────────

async function transformWithClaude(raw: string): Promise<StructuredIssue> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: raw }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[transformer] Claude API error ${res.status}:`, errText);
      throw new Error(`Claude API ${res.status}`);
    }

    const data = (await res.json()) as any;
    const content = data.content?.[0]?.text || '';
    return parseLLMOutput(content, raw);
  } catch (err) {
    console.error('[transformer] Claude call failed, falling back to mock:', err);
    return mockTransform(raw);
  }
}

// ── OpenAI fallback ──────────────────────────────────────────

async function transformWithOpenAI(raw: string): Promise<StructuredIssue> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: raw },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API ${res.status}`);
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content || '';
    return parseLLMOutput(content, raw);
  } catch (err) {
    console.error('[transformer] OpenAI call failed, falling back to mock:', err);
    return mockTransform(raw);
  }
}

// ── Parse LLM JSON output ────────────────────────────────────

function parseLLMOutput(content: string, raw: string): StructuredIssue {
  try {
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.summary || !parsed.description) {
      throw new Error('Missing required fields');
    }

    return {
      summary: parsed.summary || '',
      description: parsed.description || '',
      steps_to_reproduce: parsed.steps_to_reproduce || '',
      expected_behavior: parsed.expected_behavior || '',
      actual_behavior: parsed.actual_behavior || '',
      acceptance_criteria: parsed.acceptance_criteria || [],
      priority: parsed.priority || 'Medium',
      labels: parsed.labels || [],
      components: parsed.components || [],
      issue_type: parsed.issue_type || 'Bug',
      triage: parsed.triage || 'Needs Investigation',
      environment: parsed.environment || '',
      estimated_effort: parsed.estimated_effort || 'M',
      attachments: [],
    };
  } catch (err) {
    console.error('[transformer] Failed to parse LLM output:', err);
    console.error('[transformer] Raw output:', content);
    return mockTransform(raw);
  }
}

// ── Mock transform (no LLM) ─────────────────────────────────

function mockTransform(raw: string): StructuredIssue {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const summary = lines.shift() || raw.slice(0, 80);
  const description = lines.join('\n') || summary;

  const lower = raw.toLowerCase();

  // Priority heuristic
  let priority: StructuredIssue['priority'] = 'Medium';
  if (lower.includes('crash') || lower.includes('500') || lower.includes('urgent') || lower.includes('critical')) {
    priority = 'High';
  } else if (lower.includes('cosmetic') || lower.includes('typo') || lower.includes('minor')) {
    priority = 'Low';
  }

  // Issue type heuristic
  let issue_type: StructuredIssue['issue_type'] = 'Bug';
  if (lower.includes('feature') || lower.includes('add') || lower.includes('new')) {
    issue_type = 'Story';
  } else if (lower.includes('improve') || lower.includes('refactor') || lower.includes('optimize')) {
    issue_type = 'Improvement';
  }

  // Extract steps / expected / actual from text
  let steps_to_reproduce = '';
  let expected_behavior = '';
  let actual_behavior = '';

  const stepsMatch = raw.match(/steps?\s*(?:to\s*reproduce)?[:\-]\s*(.*?)(?=expected|actual|$)/is);
  if (stepsMatch) steps_to_reproduce = stepsMatch[1].trim();

  const expectedMatch = raw.match(/expected[:\-]\s*(.*?)(?=actual|$)/is);
  if (expectedMatch) expected_behavior = expectedMatch[1].trim();

  const actualMatch = raw.match(/actual[:\-]\s*(.*?)$/is);
  if (actualMatch) actual_behavior = actualMatch[1].trim();

  // Environment detection
  let environment = '';
  const envTokens: string[] = [];
  if (lower.includes('chrome')) envTokens.push('Chrome');
  if (lower.includes('firefox')) envTokens.push('Firefox');
  if (lower.includes('safari')) envTokens.push('Safari');
  if (lower.includes('production')) envTokens.push('Production');
  if (lower.includes('staging')) envTokens.push('Staging');
  environment = envTokens.join(', ');

  return {
    summary,
    description,
    steps_to_reproduce,
    expected_behavior,
    actual_behavior,
    acceptance_criteria: [
      'Issue is clearly described with reproduction steps',
      'Expected vs actual behavior is documented',
      'Fix is verified in staging before merge',
    ],
    priority,
    labels: ['auto-generated'],
    components: [],
    issue_type,
    triage: issue_type === 'Bug' ? 'Needs Investigation' : 'Confirmed',
    environment,
    estimated_effort: 'M',
    attachments: [],
  };
}
