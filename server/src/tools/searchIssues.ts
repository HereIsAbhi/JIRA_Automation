import { config } from '../config';
import { jiraHeaders } from './jiraHelpers';
import { ToolResult } from '../types/agent';

export async function searchIssues(query: string): Promise<ToolResult> {
  try {
    const jql = buildJQL(query);

    const res = await fetch(`${config.jiraBaseUrl}/rest/api/3/search`, {
      method: 'POST',
      headers: jiraHeaders(),
      body: JSON.stringify({
        jql,
        maxResults: 10,
        fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'labels'],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, message: `Search failed: ${err}` };
    }

    const data = (await res.json()) as any;
    const issues = data.issues.map((i: any) => ({
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status?.name,
      priority: i.fields.priority?.name,
      assignee: i.fields.assignee?.displayName || 'Unassigned',
      type: i.fields.issuetype?.name,
      url: `${config.jiraBaseUrl}/browse/${i.key}`,
    }));

    return {
      success: true,
      message: `Found ${issues.length} issue(s)`,
      data: { jql, issues, total: data.total },
    };
  } catch (err) {
    return { success: false, message: `Search error: ${(err as Error).message}` };
  }
}

function buildJQL(query: string): string {
  const lower = query.toLowerCase();
  const project = config.jiraProjectKey;
  const parts: string[] = [`project = ${project}`];

  // Priority
  if (lower.includes('high priority') || lower.includes('critical')) {
    parts.push('priority in (High, Highest)');
  } else if (lower.includes('low priority')) {
    parts.push('priority in (Low, Lowest)');
  }

  // Status
  if (lower.includes('open') || lower.includes('to do')) {
    parts.push('status = "To Do"');
  } else if (lower.includes('in progress')) {
    parts.push('status = "In Progress"');
  } else if (lower.includes('done') || lower.includes('closed')) {
    parts.push('status = "Done"');
  }

  // Type
  if (lower.includes('bug')) {
    parts.push('issuetype = Bug');
  } else if (lower.includes('story') || lower.includes('stories')) {
    parts.push('issuetype = Story');
  } else if (lower.includes('task')) {
    parts.push('issuetype = Task');
  }

  // Assignment
  if (lower.includes('my ') || lower.includes('assigned to me') || lower.includes('mine')) {
    parts.push('assignee = currentUser()');
  } else if (lower.includes('unassigned')) {
    parts.push('assignee is EMPTY');
  }

  return parts.join(' AND ') + ' ORDER BY updated DESC';
}
