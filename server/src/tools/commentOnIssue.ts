import { config } from '../config';
import { jiraHeaders } from './jiraHelpers';
import { ToolResult } from '../types/agent';

export async function commentOnIssue(
  issueKey: string,
  commentText: string,
): Promise<ToolResult> {
  try {
    const body = {
      body: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: commentText }] },
        ],
      },
    };

    const res = await fetch(
      `${config.jiraBaseUrl}/rest/api/3/issue/${issueKey}/comment`,
      {
        method: 'POST',
        headers: jiraHeaders(),
        body: JSON.stringify(body),
      },
    );

    if (res.ok) {
      return { success: true, message: `✅ Comment added to ${issueKey}` };
    }

    const err = await res.text();
    return { success: false, message: `Failed to comment on ${issueKey}: ${err}` };
  } catch (err) {
    return {
      success: false,
      message: `Error commenting on ${issueKey}: ${(err as Error).message}`,
    };
  }
}
