import { config } from '../config';
import { jiraHeaders } from './jiraHelpers';
import { ToolResult } from '../types/agent';

export async function assignIssue(
  issueKey: string,
  assignee: string,
): Promise<ToolResult> {
  try {
    let accountId: string | null = null;

    if (['me', 'myself'].includes(assignee.toLowerCase())) {
      const meRes = await fetch(`${config.jiraBaseUrl}/rest/api/3/myself`, {
        headers: jiraHeaders(),
      });
      if (meRes.ok) {
        const me = (await meRes.json()) as any;
        accountId = me.accountId;
      }
    } else if (['unassigned', 'none'].includes(assignee.toLowerCase())) {
      accountId = null;
    } else {
      const searchRes = await fetch(
        `${config.jiraBaseUrl}/rest/api/3/user/search?query=${encodeURIComponent(assignee)}`,
        { headers: jiraHeaders() },
      );
      if (searchRes.ok) {
        const users = (await searchRes.json()) as any[];
        if (users.length > 0) {
          accountId = users[0].accountId;
        } else {
          return { success: false, message: `User "${assignee}" not found in Jira` };
        }
      }
    }

    const res = await fetch(
      `${config.jiraBaseUrl}/rest/api/3/issue/${issueKey}/assignee`,
      {
        method: 'PUT',
        headers: jiraHeaders(),
        body: JSON.stringify({ accountId }),
      },
    );

    if (res.ok || res.status === 204) {
      const who = assignee.toLowerCase() === 'none' ? 'Unassigned' : assignee;
      return { success: true, message: `✅ Assigned ${issueKey} to ${who}` };
    }

    const err = await res.text();
    return { success: false, message: `Failed to assign ${issueKey}: ${err}` };
  } catch (err) {
    return {
      success: false,
      message: `Error assigning ${issueKey}: ${(err as Error).message}`,
    };
  }
}
