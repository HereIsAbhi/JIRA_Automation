import { App, LogLevel } from '@slack/bolt';
import { config } from './config';
import { transformRawIssue, StructuredIssue, Attachment } from './transformer';
import { createConfluenceDraft } from './confluenceClient';
import { createJiraIssue, JiraIssueResponse } from './jiraClient';
import { buildReviewBlocks } from './slackBlocks';
import { executeAgent } from './agents/jiraAgent';
import fs from 'fs';
import path from 'path';

// ── In-memory draft store ────────────────────────────────────

interface Draft {
  issue: StructuredIssue;
  confluenceUrl: string;
  slackUserId: string;
  channelId: string;
  editing: boolean;          // true when user is in edit mode
  editingField?: string;     // which field is being edited
}

const drafts = new Map<string, Draft>();
let draftSeq = 0;

// Track which users are in edit mode and for which draft
const editingSessions = new Map<string, string>(); // userId → draftId

// ── Slack Bolt app (Socket Mode) ────────────────────────────

export const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  signingSecret: config.slackSigningSecret,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// ── Helper: download a Slack file ────────────────────────────

const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

async function downloadFile(url: string, dest: string): Promise<void> {
  // Slack redirects file URLs across origins, and fetch strips the
  // Authorization header on cross-origin redirects. Handle manually.
  let currentUrl = url;
  const maxRedirects = 5;

  for (let i = 0; i < maxRedirects; i++) {
    const res = await fetch(currentUrl, {
      headers: { Authorization: `Bearer ${config.slackBotToken}` },
      redirect: 'manual',           // don't auto-follow
    });

    // Follow redirect manually, keeping the auth header
    if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirect without Location header');
      currentUrl = location;
      continue;
    }

    if (!res.ok) {
      throw new Error(`Failed to download file: ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error(`Slack returned HTML instead of file data (auth issue?). Content-Type: ${contentType}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(dest, buffer);
    console.log(`📥 File saved: ${dest} (${buffer.length} bytes, type: ${contentType})`);
    return;
  }

  throw new Error(`Too many redirects downloading ${url}`);
}

// ── Extract attachments ──────────────────────────────────────

async function extractAttachments(files: any[] | undefined): Promise<Attachment[]> {
  if (!files || files.length === 0) return [];
  const attachments: Attachment[] = [];
  for (const f of files) {
    const localName = `${Date.now()}_${f.name}`;
    const localPath = path.join(UPLOAD_DIR, localName);
    try {
      // Prefer url_private_download (direct binary), fall back to url_private
      const downloadUrl = f.url_private_download || f.url_private;
      await downloadFile(downloadUrl, localPath);
      attachments.push({ name: f.name, mimetype: f.mimetype, url: f.url_private, localPath });
      console.log(`📥 Downloaded: ${f.name} → ${localPath}`);
    } catch (err) {
      console.warn(`⚠️  Failed to download ${f.name}:`, err);
      attachments.push({ name: f.name, mimetype: f.mimetype, url: f.url_private });
    }
  }
  return attachments;
}

// ── Detect: agent command vs new issue vs edit reply ─────────

const ISSUE_KEY_RE = /[A-Z]+-\d+/;
const AGENT_KEYWORDS =
  /^(get|show|fetch|update|change|set|edit|modify|move|transition|assign|reassign|comment|note|search|find|list|mark|what'?s)/i;

function isAgentCommand(text: string): boolean {
  if (!text) return false;
  if (AGENT_KEYWORDS.test(text.trim())) return true;
  if (ISSUE_KEY_RE.test(text) && text.length < 200) return true;
  return false;
}

// Editable field names (used for matching user edits)
const EDITABLE_FIELDS: Record<string, keyof StructuredIssue> = {
  summary: 'summary',
  description: 'description',
  desc: 'description',
  steps: 'steps_to_reproduce',
  'steps to reproduce': 'steps_to_reproduce',
  'steps_to_reproduce': 'steps_to_reproduce',
  reproduce: 'steps_to_reproduce',
  expected: 'expected_behavior',
  'expected behavior': 'expected_behavior',
  'expected_behavior': 'expected_behavior',
  actual: 'actual_behavior',
  'actual behavior': 'actual_behavior',
  'actual_behavior': 'actual_behavior',
  priority: 'priority',
  labels: 'labels',
  label: 'labels',
  components: 'components',
  component: 'components',
  type: 'issue_type',
  'issue type': 'issue_type',
  'issue_type': 'issue_type',
  triage: 'triage',
  environment: 'environment',
  env: 'environment',
  effort: 'estimated_effort',
  'estimated effort': 'estimated_effort',
  'estimated_effort': 'estimated_effort',
  acceptance: 'acceptance_criteria',
  'acceptance criteria': 'acceptance_criteria',
  'acceptance_criteria': 'acceptance_criteria',
  criteria: 'acceptance_criteria',
};

// ── Edit helper: parse "field: value" lines ──────────────────

function parseStrictEdits(text: string): Record<string, string> {
  const edits: Record<string, string> = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([a-z_ ]+?)\s*[:=]\s*(.+)/i);
    if (m) {
      const fieldInput = m[1].trim().toLowerCase();
      const value = m[2].trim();
      const fieldKey = EDITABLE_FIELDS[fieldInput];
      if (fieldKey) {
        edits[fieldKey] = value;
      }
    }
  }
  return edits;
}

// ── Smart edit: use Claude to interpret free-form edits ──────

const EDIT_PROMPT = `You are an assistant that interprets edit instructions for a Jira issue draft.
Given the current issue fields and a user's edit instruction in natural language,
determine which fields should be changed and what the new values should be.

The editable fields are:
- summary (string)
- description (string)
- steps_to_reproduce (string)
- expected_behavior (string)
- actual_behavior (string)
- acceptance_criteria (semicolon-separated list)
- priority (Lowest, Low, Medium, High, Highest)
- labels (comma-separated)
- components (comma-separated)
- issue_type (Bug, Task, Story, Improvement)
- triage (Needs Investigation, Confirmed, Cannot Reproduce, Duplicate)
- environment (string)
- estimated_effort (S, M, L, XL)

IMPORTANT:
- If the user says "add X to description" or "in description add X", APPEND the text to the existing description value.
- If the user says "change description to X", REPLACE the description entirely.
- Same logic for any field: "add to" = append, "change to" / "set to" = replace.
- Return ONLY valid JSON with field names as keys and new values as strings.
- Return EMPTY object {} if you cannot determine any edits.`;

async function parseSmartEdits(
  text: string,
  currentIssue: StructuredIssue,
): Promise<Record<string, string>> {
  if (!config.claudeApiKey) {
    return parseKeywordEdits(text, currentIssue);
  }

  try {
    const currentFields = JSON.stringify({
      summary: currentIssue.summary,
      description: currentIssue.description,
      steps_to_reproduce: currentIssue.steps_to_reproduce,
      expected_behavior: currentIssue.expected_behavior,
      actual_behavior: currentIssue.actual_behavior,
      acceptance_criteria: currentIssue.acceptance_criteria.join('; '),
      priority: currentIssue.priority,
      labels: currentIssue.labels.join(', '),
      components: currentIssue.components.join(', '),
      issue_type: currentIssue.issue_type,
      triage: currentIssue.triage,
      environment: currentIssue.environment,
      estimated_effort: currentIssue.estimated_effort,
    }, null, 2);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        temperature: 0,
        system: EDIT_PROMPT,
        messages: [{
          role: 'user',
          content: `Current issue:\n${currentFields}\n\nUser's edit instruction:\n"${text}"`,
        }],
      }),
    });

    if (!res.ok) {
      console.error('[smart-edit] Claude error:', res.status);
      return parseKeywordEdits(text, currentIssue);
    }

    const data = (await res.json()) as any;
    const content = data.content?.[0]?.text || '{}';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log('[smart-edit] Claude parsed edits:', parsed);
    return parsed;
  } catch (err) {
    console.error('[smart-edit] Claude failed, using keyword fallback:', err);
    return parseKeywordEdits(text, currentIssue);
  }
}

// ── Keyword-based edit fallback (no LLM) ─────────────────────

function parseKeywordEdits(
  text: string,
  currentIssue: StructuredIssue,
): Record<string, string> {
  const edits: Record<string, string> = {};
  const lower = text.toLowerCase();

  // Detect "add ... to <field>" or "in <field> add ..."
  const addToMatch = text.match(
    /(?:(?:in|to)\s+)?(description|details|summary|steps|expected|actual|environment|labels|components|acceptance|criteria)\s+(?:add|append|include)\s+(.+)/i,
  ) || text.match(
    /(?:add|append|include)\s+(.+?)\s+(?:to|in)\s+(description|details|summary|steps|expected|actual|environment|labels|components|acceptance|criteria)/i,
  );

  if (addToMatch) {
    let fieldName: string;
    let value: string;
    // Figure out which capture group has the field vs value
    if (/description|details|summary|steps|expected|actual|environment|labels|components|acceptance|criteria/i.test(addToMatch[1])) {
      fieldName = addToMatch[1].toLowerCase();
      value = addToMatch[2];
    } else {
      value = addToMatch[1];
      fieldName = addToMatch[2].toLowerCase();
    }

    // Map aliases
    if (fieldName === 'details') fieldName = 'description';
    if (fieldName === 'steps') fieldName = 'steps_to_reproduce';
    if (fieldName === 'expected') fieldName = 'expected_behavior';
    if (fieldName === 'actual') fieldName = 'actual_behavior';
    if (fieldName === 'acceptance' || fieldName === 'criteria') fieldName = 'acceptance_criteria';

    const fieldKey = EDITABLE_FIELDS[fieldName] || fieldName;
    const current = (currentIssue as any)[fieldKey] || '';

    if (fieldKey === 'labels' || fieldKey === 'components') {
      const existing = Array.isArray(current) ? current.join(', ') : current;
      edits[fieldKey] = existing ? existing + ', ' + value.trim() : value.trim();
    } else if (fieldKey === 'acceptance_criteria') {
      const existing = Array.isArray(current) ? current.join('; ') : current;
      edits[fieldKey] = existing ? existing + '; ' + value.trim() : value.trim();
    } else {
      edits[fieldKey] = current ? current + '\n' + value.trim() : value.trim();
    }
    return edits;
  }

  // Detect "change/set <field> to <value>"
  const changeMatch = text.match(
    /(?:change|set|update|make)\s+(?:the\s+)?(summary|description|details|priority|type|issue.type|labels?|components?|triage|environment|env|effort|steps|expected|actual|acceptance|criteria)\s+(?:to|=|as)\s+(.+)/i,
  );

  if (changeMatch) {
    let fieldName = changeMatch[1].toLowerCase();
    const value = changeMatch[2].trim();

    if (fieldName === 'details') fieldName = 'description';
    if (fieldName === 'steps') fieldName = 'steps_to_reproduce';
    if (fieldName === 'expected') fieldName = 'expected_behavior';
    if (fieldName === 'actual') fieldName = 'actual_behavior';
    if (fieldName === 'env') fieldName = 'environment';

    const fieldKey = EDITABLE_FIELDS[fieldName] || fieldName;
    edits[fieldKey] = value;
    return edits;
  }

  return edits;
}

function applyEdits(issue: StructuredIssue, edits: Record<string, string>): string[] {
  const applied: string[] = [];
  for (const [field, value] of Object.entries(edits)) {
    switch (field) {
      case 'summary':
      case 'description':
      case 'steps_to_reproduce':
      case 'expected_behavior':
      case 'actual_behavior':
      case 'triage':
      case 'environment':
      case 'estimated_effort':
        (issue as any)[field] = value;
        applied.push(field);
        break;
      case 'priority':
        const validPriorities = ['Lowest', 'Low', 'Medium', 'High', 'Highest'];
        const match = validPriorities.find((p) => p.toLowerCase() === value.toLowerCase());
        if (match) {
          issue.priority = match as StructuredIssue['priority'];
          applied.push('priority');
        }
        break;
      case 'issue_type':
        const validTypes = ['Bug', 'Task', 'Story', 'Improvement'];
        const typeMatch = validTypes.find((t) => t.toLowerCase() === value.toLowerCase());
        if (typeMatch) {
          issue.issue_type = typeMatch as StructuredIssue['issue_type'];
          applied.push('issue_type');
        }
        break;
      case 'labels':
        issue.labels = value.split(',').map((l) => l.trim()).filter(Boolean);
        applied.push('labels');
        break;
      case 'components':
        issue.components = value.split(',').map((c) => c.trim()).filter(Boolean);
        applied.push('components');
        break;
      case 'acceptance_criteria':
        issue.acceptance_criteria = value
          .split(/[;\n]/)
          .map((c) => c.trim())
          .filter(Boolean);
        applied.push('acceptance_criteria');
        break;
    }
  }
  return applied;
}

// ── Listen to all DM messages ────────────────────────────────

app.message(async ({ message, say }) => {
  if (message.subtype && message.subtype !== 'file_share') return;
  if ((message as any).bot_id) return;

  const rawText = (message as any).text || '';
  const slackFiles = (message as any).files;
  const userId = (message as any).user;
  const channelId = (message as any).channel;

  if (!rawText && (!slackFiles || slackFiles.length === 0)) return;

  console.log(`\n💬 Message from ${userId}: "${rawText}" (${slackFiles?.length || 0} files)`);

  // ── Check if user is in edit mode ──
  const editDraftId = editingSessions.get(userId);
  if (editDraftId) {
    const draft = drafts.get(editDraftId);

    if (rawText.toLowerCase().trim() === 'cancel') {
      editingSessions.delete(userId);
      await say(`↩️ Edit cancelled. Draft \`${editDraftId}\` unchanged.`);
      return;
    }

    if (rawText.toLowerCase().trim() === 'done') {
      editingSessions.delete(userId);
      if (draft) {
        const blocks = buildReviewBlocks(draft.issue, draft.confluenceUrl, editDraftId);
        await say({ blocks, text: `Updated draft: ${draft.issue.summary}` });
      }
      await say(`✅ Edits complete for \`${editDraftId}\`. Review the updated draft above.`);
      return;
    }

    if (!draft) {
      editingSessions.delete(userId);
      await say(`⚠️ Draft \`${editDraftId}\` not found.`);
      return;
    }

    // Parse field edits — try strict format first, then smart/LLM parsing
    const strictEdits = parseStrictEdits(rawText);
    let edits: Record<string, string>;
    let usedSmartParse = false;

    if (Object.keys(strictEdits).length > 0) {
      edits = strictEdits;
    } else {
      // Use Claude or keyword fallback to understand free-form edits
      await say('🧠 Interpreting your edit...');
      edits = await parseSmartEdits(rawText, draft.issue);
      usedSmartParse = true;
    }

    if (Object.keys(edits).length > 0) {
      const applied = applyEdits(draft.issue, edits);
      if (applied.length > 0) {
        await say(`✏️ Updated: *${applied.join(', ')}*\n\nSend more edits, or type \`done\` to finish, \`cancel\` to discard.`);
      } else {
        await say(`⚠️ Couldn't apply those edits. Try something like:\n> \`in description add ent id - 8888\`\n> \`change priority to High\`\n> \`summary: New title\`\n\nOr type \`done\` / \`cancel\`.`);
      }
    } else {
      await say(`⚠️ Couldn't understand that edit. Try:\n> \`in description add ent id - 8888\`\n> \`change priority to High\`\n> \`add bug, frontend to labels\`\n> \`summary: New title here\`\n\nOr type \`done\` / \`cancel\`.`);
    }
    return;
  }

  // ── Route: Agent command or New issue? ──
  if (isAgentCommand(rawText)) {
    console.log('🤖 Routing to Agent...');
    await say('🤖 Processing your command...');
    try {
      const result = await executeAgent(rawText);
      await say(result.message);
    } catch (err) {
      console.error('❌ Agent error:', err);
      await say(`❌ Agent error: ${(err as Error).message}`);
    }
    return;
  }

  // ── New issue mode ──
  console.log('📋 Routing to Issue Creator...');
  await say('⏳ Processing your issue — hang tight...');

  try {
    const attachments = await extractAttachments(slackFiles);
    const effectiveText = rawText || `[Attachment: ${attachments.map((a) => a.name).join(', ')}]`;
    const issue = await transformRawIssue(effectiveText, attachments);
    const confluencePage = await createConfluenceDraft(issue);
    const confluenceUrl = confluencePage.url;

    draftSeq += 1;
    const draftId = `draft-${draftSeq}`;
    drafts.set(draftId, {
      issue,
      confluenceUrl,
      slackUserId: userId,
      channelId,
      editing: false,
    });

    const blocks = buildReviewBlocks(issue, confluenceUrl, draftId);
    await say({ blocks, text: `Issue draft ready: ${issue.summary}` });

    console.log(`✅ Draft ${draftId} posted for review`);
  } catch (err) {
    console.error('❌ Error processing message:', err);
    await say(`❌ Sorry, something went wrong: ${(err as Error).message}`);
  }
});

// ── Approve button ───────────────────────────────────────────

app.action('approve_draft', async ({ action, body, ack, say, client }) => {
  await ack();
  if (!say) return;

  const draftId = (action as any).value;
  const draft = drafts.get(draftId);
  const userId = (body as any).user?.id;

  if (!draft) {
    await say(`⚠️ Draft \`${draftId}\` not found — it may have expired.`);
    return;
  }

  console.log(`\n✅ ${userId} approved ${draftId}`);
  await say('🚀 Creating Jira issue...');

  try {
    const jiraResult: JiraIssueResponse = await createJiraIssue(draft.issue);

    await client.chat.postMessage({
      channel: draft.channelId,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `✅ *Jira issue created!*\n\n` +
              `🔑 *Key:* <${jiraResult.url}|${jiraResult.key}>\n` +
              `📋 *Summary:* ${draft.issue.summary}\n` +
              `🎯 *Priority:* ${draft.issue.priority}\n` +
              `🏷️ *Labels:* ${draft.issue.labels.join(', ') || 'none'}\n` +
              `📄 *Confluence Draft:* <${draft.confluenceUrl}|View Draft>`,
          },
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Approved by <@${userId}> • ${new Date().toLocaleString()}`,
            },
          ],
        },
      ],
      text: `Jira issue created: ${jiraResult.key}`,
    });

    if (draft.issue.attachments && draft.issue.attachments.length > 0) {
      await say(`📎 ${draft.issue.attachments.length} attachment(s) uploaded to ${jiraResult.key}`);
    }

    editingSessions.delete(draft.slackUserId);
    drafts.delete(draftId);
  } catch (err) {
    console.error('❌ Jira create error:', err);
    await say(`❌ Failed to create Jira issue: ${(err as Error).message}`);
  }
});

// ── Edit button ──────────────────────────────────────────────

app.action('edit_draft', async ({ action, body, ack, say }) => {
  await ack();
  if (!say) return;

  const draftId = (action as any).value;
  const draft = drafts.get(draftId);
  const userId = (body as any).user?.id;

  if (!draft) {
    await say(`⚠️ Draft \`${draftId}\` not found.`);
    return;
  }

  // Put user in edit mode
  editingSessions.set(userId, draftId);
  draft.editing = true;

  // Show current values + editable fields list
  const currentValues = [
    `*summary:* ${draft.issue.summary}`,
    `*description:* ${truncate(draft.issue.description, 100)}`,
    `*steps to reproduce:* ${truncate(draft.issue.steps_to_reproduce, 100) || '_empty_'}`,
    `*expected behavior:* ${truncate(draft.issue.expected_behavior, 100) || '_empty_'}`,
    `*actual behavior:* ${truncate(draft.issue.actual_behavior, 100) || '_empty_'}`,
    `*priority:* ${draft.issue.priority}`,
    `*type:* ${draft.issue.issue_type}`,
    `*labels:* ${draft.issue.labels.join(', ') || '_none_'}`,
    `*components:* ${draft.issue.components.join(', ') || '_none_'}`,
    `*triage:* ${draft.issue.triage || '_not set_'}`,
    `*environment:* ${draft.issue.environment || '_not set_'}`,
    `*effort:* ${draft.issue.estimated_effort}`,
    `*acceptance criteria:* ${draft.issue.acceptance_criteria.join('; ') || '_none_'}`,
  ].join('\n');

  await say(
    `✏️ *Edit mode for \`${draftId}\`*\n\n` +
      `Current values:\n${currentValues}\n\n` +
      `───────────────────\n` +
      `Reply with one or more field edits:\n` +
      `> \`summary: New title\`\n` +
      `> \`priority: High\`\n` +
      `> \`steps to reproduce: 1. Do X  2. Do Y  3. See error\`\n` +
      `> \`expected: User should see login page\`\n` +
      `> \`actual: White screen with 500 error\`\n` +
      `> \`triage: Confirmed\`\n` +
      `> \`environment: Chrome, Production\`\n` +
      `> \`labels: bug, auth, critical\`\n\n` +
      `Type \`done\` when finished, or \`cancel\` to discard edits.`,
  );
});

// ── Reject button ────────────────────────────────────────────

app.action('reject_draft', async ({ action, body, ack, say }) => {
  await ack();
  if (!say) return;

  const draftId = (action as any).value;
  const userId = (body as any).user?.id;

  editingSessions.delete(userId);
  drafts.delete(draftId);
  await say(`🗑️ Draft \`${draftId}\` rejected by <@${userId}> and discarded.`);
  console.log(`🗑️ ${userId} rejected ${draftId}`);
});

// ── Helper ───────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}
