import { config } from '../config';
import { jiraHeaders } from './jiraHelpers';
import { ToolResult } from '../types/agent';

export async function transitionIssue(
  issueKey: string,
  targetStatus: string,
): Promise<ToolResult> {
  try {
    // 1. Get available transitions
    const transRes = await fetch(
      `${config.jiraBaseUrl}/rest/api/3/issue/${issueKey}/transitions`,
      { headers: jiraHeaders() },
    );

    if (!transRes.ok) {
      return { success: false, message: `Cannot fetch transitions for ${issueKey}` };
    }

    const transData = (await transRes.json()) as any;
    const transitions: any[] = transData.transitions || [];

    // 2. Find matching transition (case-insensitive, partial match)
    const target = targetStatus.toLowerCase();
    const match = transitions.find(
      (t: any) =>
        t.name.toLowerCase() === target ||
        t.name.toLowerCase().includes(target) ||
        t.to?.name?.toLowerCase() === target ||
        t.to?.name?.toLowerCase().includes(target),
    );

    if (!match) {
      const available = transitions
        .map((t: any) => `"${t.name}" → ${t.to?.name}`)
        .join(', ');
      return {
        success: false,
        message: `Cannot move ${issueKey} to "${targetStatus}". Available: ${available}`,
      };
    }

    // 3. Execute transition
    const execRes = await fetch(
      `${config.jiraBaseUrl}/rest/api/3/issue/${issueKey}/transitions`,
      {
        method: 'POST',
        headers: jiraHeaders(),
        body: JSON.stringify({ transition: { id: match.id } }),
      },
    );

    if (execRes.ok || execRes.status === 204) {
      return {
        success: true,
        message: `✅ Moved ${issueKey} → ${match.to?.name || match.name}`,
        data: { transition: match.name, newStatus: match.to?.name },
      };
    }

    const err = await execRes.text();
    return { success: false, message: `Transition failed: ${err}` };
  } catch (err) {
    return {
      success: false,
      message: `Error transitioning ${issueKey}: ${(err as Error).message}`,
    };
  }
}
