import { config } from '../config';
import { jiraHeaders } from './jiraHelpers';
import { ToolResult } from '../types/agent';

export async function updateIssue(
  issueKey: string,
  fields: Record<string, any>,
): Promise<ToolResult> {
  try {
    const jiraFields: Record<string, any> = {};

    if (fields.summary) jiraFields.summary = fields.summary;
    if (fields.priority) jiraFields.priority = { name: fields.priority };
    if (fields.labels)
      jiraFields.labels = Array.isArray(fields.labels) ? fields.labels : [fields.labels];
    if (fields.description) {
      jiraFields.description = {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: fields.description }] },
        ],
      };
    }

    const res = await fetch(`${config.jiraBaseUrl}/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: jiraHeaders(),
      body: JSON.stringify({ fields: jiraFields }),
    });

    if (res.ok || res.status === 204) {
      const changed = Object.keys(jiraFields).join(', ');
      return { success: true, message: `✅ Updated ${issueKey}: ${changed}` };
    }

    const err = await res.text();
    return { success: false, message: `Failed to update ${issueKey}: ${err}` };
  } catch (err) {
    return {
      success: false,
      message: `Error updating ${issueKey}: ${(err as Error).message}`,
    };
  }
}
