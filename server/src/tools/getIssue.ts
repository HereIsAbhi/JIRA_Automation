import { config } from '../config';
import { jiraHeaders } from './jiraHelpers';
import { ToolResult } from '../types/agent';

export async function getIssue(issueKey: string): Promise<ToolResult> {
  try {
    const res = await fetch(`${config.jiraBaseUrl}/rest/api/3/issue/${issueKey}`, {
      headers: jiraHeaders(),
    });

    if (!res.ok) {
      return { success: false, message: `Issue ${issueKey} not found (${res.status})` };
    }

    const data = (await res.json()) as any;
    const f = data.fields;

    const summary = {
      key: data.key,
      summary: f.summary,
      status: f.status?.name || 'Unknown',
      priority: f.priority?.name || 'None',
      assignee: f.assignee?.displayName || 'Unassigned',
      reporter: f.reporter?.displayName || 'Unknown',
      issueType: f.issuetype?.name || 'Unknown',
      labels: f.labels || [],
      created: f.created,
      updated: f.updated,
      description:
        f.description?.content?.[0]?.content?.[0]?.text || '(no description)',
      url: `${config.jiraBaseUrl}/browse/${data.key}`,
    };

    return { success: true, message: `Found ${data.key}`, data: summary };
  } catch (err) {
    return {
      success: false,
      message: `Error fetching ${issueKey}: ${(err as Error).message}`,
    };
  }
}
