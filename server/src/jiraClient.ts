import { config } from './config';
import { StructuredIssue, Attachment } from './transformer';
import fs from 'fs';

export interface JiraIssueResponse {
  id: string;
  key: string;
  self: string;
  url: string;
}

// ── helpers ──────────────────────────────────────────────────

function jiraAuth(): string {
  return Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString('base64');
}

function jiraHeaders(): Record<string, string> {
  return {
    Authorization: `Basic ${jiraAuth()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function mapPriority(p: string): string {
  const map: Record<string, string> = {
    highest: 'Highest',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    lowest: 'Lowest',
  };
  return map[p.toLowerCase()] || 'Medium';
}

function buildDescription(issue: StructuredIssue): any {
  const nodes: any[] = [];

  // Main description
  nodes.push({
    type: 'paragraph',
    content: [{ type: 'text', text: issue.description }],
  });

  // Steps to Reproduce
  if (issue.steps_to_reproduce) {
    nodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Steps to Reproduce' }],
    });
    nodes.push({
      type: 'paragraph',
      content: [{ type: 'text', text: issue.steps_to_reproduce }],
    });
  }

  // Expected Behavior
  if (issue.expected_behavior) {
    nodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Expected Behavior' }],
    });
    nodes.push({
      type: 'paragraph',
      content: [{ type: 'text', text: issue.expected_behavior }],
    });
  }

  // Actual Behavior
  if (issue.actual_behavior) {
    nodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Actual Behavior' }],
    });
    nodes.push({
      type: 'paragraph',
      content: [{ type: 'text', text: issue.actual_behavior }],
    });
  }

  // Acceptance Criteria
  if (issue.acceptance_criteria.length > 0) {
    nodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Acceptance Criteria' }],
    });
    nodes.push({
      type: 'bulletList',
      content: issue.acceptance_criteria.map((ac) => ({
        type: 'listItem',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: ac }] },
        ],
      })),
    });
  }

  // Triage
  if (issue.triage) {
    nodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Triage' }],
    });
    nodes.push({
      type: 'paragraph',
      content: [{ type: 'text', text: issue.triage }],
    });
  }

  // Environment
  if (issue.environment) {
    nodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Environment' }],
    });
    nodes.push({
      type: 'paragraph',
      content: [{ type: 'text', text: issue.environment }],
    });
  }

  // Attachments
  if (issue.attachments && issue.attachments.length > 0) {
    nodes.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Attachments' }],
    });
    issue.attachments.forEach((att) => {
      nodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: `📎 ${att.name} (${att.mimetype})` }],
      });
    });
  }

  return { type: 'doc', version: 1, content: nodes };
}

// ── check connection ─────────────────────────────────────────

export async function checkJiraConnection(): Promise<boolean> {
  if (!config.jiraBaseUrl || !config.jiraEmail || !config.jiraApiToken) {
    console.log('⚠️  Jira credentials not configured — running in mock mode');
    return false;
  }
  try {
    const res = await fetch(`${config.jiraBaseUrl}/rest/api/3/myself`, {
      headers: jiraHeaders(),
    });
    if (res.ok) {
      const me = (await res.json()) as any;
      console.log(`✅ Jira connected as: ${me.displayName} (${me.emailAddress})`);
      return true;
    }
    console.warn(`⚠️  Jira auth failed: ${res.status} ${res.statusText}`);
    return false;
  } catch (err) {
    console.warn('⚠️  Jira connection error:', err);
    return false;
  }
}

// ── create issue ─────────────────────────────────────────────

export async function createJiraIssue(issue: StructuredIssue): Promise<JiraIssueResponse> {
  if (!config.jiraBaseUrl || !config.jiraEmail || !config.jiraApiToken) {
    return createMockJiraIssue(issue);
  }

  const payload = {
    fields: {
      project: { key: config.jiraProjectKey },
      issuetype: { name: 'Task' },
      summary: issue.summary,
      description: buildDescription(issue),
      priority: { name: mapPriority(issue.priority) },
      labels: issue.labels,
    },
  };

  if (issue.components.length > 0) {
    (payload.fields as any).components = issue.components.map((c) => ({ name: c }));
  }

  console.log('📤 Creating Jira issue...');

  const res = await fetch(`${config.jiraBaseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: jiraHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`❌ Jira create failed: ${res.status}`, errorBody);
    throw new Error(`Jira API error ${res.status}: ${errorBody}`);
  }

  const data = (await res.json()) as any;
  const result: JiraIssueResponse = {
    id: data.id,
    key: data.key,
    self: data.self,
    url: `${config.jiraBaseUrl}/browse/${data.key}`,
  };

  console.log(`✅ Jira issue created: ${result.key} → ${result.url}`);

  if (issue.attachments && issue.attachments.length > 0) {
    await uploadAttachments(result.key, issue.attachments);
  }

  return result;
}

// ── upload attachments ───────────────────────────────────────

async function uploadAttachments(issueKey: string, attachments: Attachment[]): Promise<void> {
  for (const att of attachments) {
    try {
      if (!att.localPath || !fs.existsSync(att.localPath)) {
        console.warn(`⚠️  Attachment file not found: ${att.localPath}`);
        continue;
      }

      const fileBuffer = fs.readFileSync(att.localPath);
      console.log(`📎 Uploading ${att.name} (${fileBuffer.length} bytes, type: ${att.mimetype}) to ${issueKey}...`);

      // Use Node.js built-in FormData (Node 18+) for reliable multipart uploads
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: att.mimetype });
      formData.append('file', blob, att.name);

      const res = await fetch(
        `${config.jiraBaseUrl}/rest/api/3/issue/${issueKey}/attachments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${jiraAuth()}`,
            'X-Atlassian-Token': 'no-check',
            // Do NOT set Content-Type — fetch auto-sets it with the correct boundary
          },
          body: formData,
        },
      );

      if (res.ok) {
        const result = await res.json();
        console.log(`📎 Uploaded attachment: ${att.name} to ${issueKey}`, JSON.stringify(result).substring(0, 200));
      } else {
        const err = await res.text();
        console.warn(`⚠️  Attachment upload failed for ${att.name}: ${res.status}`, err);
      }
    } catch (err) {
      console.warn(`⚠️  Attachment upload error for ${att.name}:`, err);
    }
  }
}

// ── update issue ─────────────────────────────────────────────

export async function updateJiraIssue(
  issueKey: string,
  fields: Record<string, any>,
): Promise<boolean> {
  if (!config.jiraBaseUrl) {
    console.log(`[Mock] Updated Jira issue ${issueKey}:`, fields);
    return true;
  }

  const res = await fetch(`${config.jiraBaseUrl}/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: jiraHeaders(),
    body: JSON.stringify({ fields }),
  });

  if (res.ok || res.status === 204) {
    console.log(`✅ Jira issue ${issueKey} updated`);
    return true;
  }

  const err = await res.text();
  console.error(`❌ Jira update failed: ${res.status}`, err);
  return false;
}

// ── get issue ────────────────────────────────────────────────

export async function getJiraIssue(issueKey: string): Promise<any> {
  if (!config.jiraBaseUrl) {
    return { key: issueKey, fields: { summary: 'Mock issue' } };
  }

  const res = await fetch(`${config.jiraBaseUrl}/rest/api/3/issue/${issueKey}`, {
    headers: jiraHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to get issue ${issueKey}: ${res.status}`);
  }

  return res.json();
}

// ── mock fallback ────────────────────────────────────────────

let mockCounter = 100;
function createMockJiraIssue(issue: StructuredIssue): JiraIssueResponse {
  mockCounter += 1;
  const key = `${config.jiraProjectKey}-${mockCounter}`;
  console.log(`[Mock Jira] Created issue ${key}: ${issue.summary}`);
  return {
    id: String(mockCounter),
    key,
    self: `http://localhost:4000/rest/api/3/issue/${mockCounter}`,
    url: `http://localhost:4000/browse/${key}`,
  };
}