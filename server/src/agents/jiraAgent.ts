import { AgentAction, AgentResult } from '../types/agent';
import {
  getIssue,
  updateIssue,
  transitionIssue,
  assignIssue,
  commentOnIssue,
  searchIssues,
} from '../tools';

// ── Issue key pattern ────────────────────────────────────────

const ISSUE_KEY_RE = /[A-Z]+-\d+/g;

// ── Plan: parse message into actions ─────────────────────────

function planActions(message: string): { intent: string; actions: AgentAction[] } {
  const lower = message.toLowerCase().trim();
  const keys = message.match(ISSUE_KEY_RE) || [];
  const actions: AgentAction[] = [];

  // --- GET / SHOW ---
  if (
    /^(get|show|fetch|describe|info|details?|what'?s?\s*(the\s*)?(status|details?))/i.test(lower)
  ) {
    for (const key of keys) {
      actions.push({ tool: 'getIssue', params: { issueKey: key }, description: `Get ${key}` });
    }
    return { intent: 'get_issue', actions };
  }

  // --- TRANSITION / MOVE ---
  if (/\b(move|transition|change\s*status|set\s*status|mark\s*as)\b/i.test(lower)) {
    const m = lower.match(/(?:to|as|→)\s+["']?([a-z ]+?)["']?\s*$/);
    const target = m ? m[1].trim() : 'Done';
    for (const key of keys) {
      actions.push({
        tool: 'transitionIssue',
        params: { issueKey: key, targetStatus: target },
        description: `Move ${key} → "${target}"`,
      });
    }
    return { intent: 'transition', actions };
  }

  // --- ASSIGN ---
  if (/\b(assign|reassign|give)\b/i.test(lower)) {
    const m = lower.match(/(?:to|→)\s+["']?([a-z0-9@. ]+?)["']?\s*$/);
    const assignee = m ? m[1].trim() : 'me';
    for (const key of keys) {
      actions.push({
        tool: 'assignIssue',
        params: { issueKey: key, assignee },
        description: `Assign ${key} to ${assignee}`,
      });
    }
    return { intent: 'assign', actions };
  }

  // --- COMMENT ---
  if (/\b(comment|add\s*comment|note)\b/i.test(lower)) {
    const m = message.match(
      /(?:comment|note)\s*(?:on)?\s*[A-Z]+-\d+\s*[:\-–]\s*(.*)/i,
    );
    const text = m ? m[1].trim() : message;
    for (const key of keys) {
      actions.push({
        tool: 'commentOnIssue',
        params: { issueKey: key, comment: text },
        description: `Comment on ${key}`,
      });
    }
    return { intent: 'comment', actions };
  }

  // --- UPDATE FIELDS ---
  if (/\b(update|change|set|edit|modify)\b/i.test(lower) && keys.length > 0) {
    const fields: Record<string, any> = {};

    const prio = lower.match(
      /priority\s*(?:to|=|:)\s*["']?(highest|high|medium|low|lowest)["']?/i,
    );
    if (prio) fields.priority = prio[1].charAt(0).toUpperCase() + prio[1].slice(1).toLowerCase();

    const sum =
      message.match(/summary\s*(?:to|=|:)\s*["'](.+?)["']/i) ||
      message.match(/summary\s*(?:to|=|:)\s*(.+?)(?:\s*,|\s*$)/i);
    if (sum) fields.summary = sum[1].trim();

    const lbl = lower.match(/labels?\s*(?:to|=|:)\s*["']?([a-z0-9, -]+)["']?/i);
    if (lbl) fields.labels = lbl[1].split(',').map((l: string) => l.trim());

    const desc =
      message.match(/description\s*(?:to|=|:)\s*["'](.+?)["']/i) ||
      message.match(/description\s*(?:to|=|:)\s*(.+?)(?:\s*,|\s*$)/i);
    if (desc) fields.description = desc[1].trim();

    if (Object.keys(fields).length > 0) {
      for (const key of keys) {
        actions.push({
          tool: 'updateIssue',
          params: { issueKey: key, fields },
          description: `Update ${key}: ${Object.keys(fields).join(', ')}`,
        });
      }
    }
    return { intent: 'update', actions };
  }

  // --- SEARCH ---
  if (
    /\b(search|find|list|show\s*all|show\s*my|get\s*all)\b/i.test(lower) &&
    keys.length === 0
  ) {
    actions.push({
      tool: 'searchIssues',
      params: { query: message },
      description: `Search: "${message}"`,
    });
    return { intent: 'search', actions };
  }

  // --- FALLBACK: issue key present → show it ---
  if (keys.length > 0) {
    for (const key of keys) {
      actions.push({ tool: 'getIssue', params: { issueKey: key }, description: `Get ${key}` });
    }
    return { intent: 'get_issue', actions };
  }

  return { intent: 'unknown', actions: [] };
}

// ── Execute agent ────────────────────────────────────────────

export async function executeAgent(message: string): Promise<AgentResult> {
  const plan = planActions(message);

  console.log(`\n🤖 Agent plan: ${plan.intent} (${plan.actions.length} action(s))`);
  plan.actions.forEach((a) => console.log(`   → ${a.description}`));

  if (plan.actions.length === 0) {
    return {
      success: false,
      message:
        `🤔 I couldn't understand that command. Try:\n` +
        `• \`get KAN-1\` — show issue details\n` +
        `• \`update KAN-1 priority to High\` — update fields\n` +
        `• \`move KAN-1 to Done\` — change status\n` +
        `• \`assign KAN-1 to me\` — assign issue\n` +
        `• \`comment on KAN-1: fix deployed\` — add comment\n` +
        `• \`search my open bugs\` — search issues`,
      actions: [],
    };
  }

  const results: string[] = [];
  let allSuccess = true;

  for (const action of plan.actions) {
    console.log(`   🔧 ${action.tool}(${JSON.stringify(action.params)})`);

    let result;
    switch (action.tool) {
      case 'getIssue':
        result = await getIssue(action.params.issueKey);
        if (result.success && result.data) {
          const d = result.data;
          results.push(
            `📋 *<${d.url}|${d.key}>*\n` +
              `*Summary:* ${d.summary}\n` +
              `*Status:* ${d.status} | *Priority:* ${d.priority} | *Type:* ${d.issueType}\n` +
              `*Assignee:* ${d.assignee}\n` +
              `*Labels:* ${d.labels.join(', ') || 'none'}\n` +
              `*Description:* ${d.description.slice(0, 300)}`,
          );
        } else {
          results.push(`❌ ${result.message}`);
          allSuccess = false;
        }
        break;

      case 'updateIssue':
        result = await updateIssue(action.params.issueKey, action.params.fields);
        results.push(result.success ? result.message : `❌ ${result.message}`);
        if (!result.success) allSuccess = false;
        break;

      case 'transitionIssue':
        result = await transitionIssue(
          action.params.issueKey,
          action.params.targetStatus,
        );
        results.push(result.success ? result.message : `❌ ${result.message}`);
        if (!result.success) allSuccess = false;
        break;

      case 'assignIssue':
        result = await assignIssue(action.params.issueKey, action.params.assignee);
        results.push(result.success ? result.message : `❌ ${result.message}`);
        if (!result.success) allSuccess = false;
        break;

      case 'commentOnIssue':
        result = await commentOnIssue(action.params.issueKey, action.params.comment);
        results.push(result.success ? result.message : `❌ ${result.message}`);
        if (!result.success) allSuccess = false;
        break;

      case 'searchIssues':
        result = await searchIssues(action.params.query);
        if (result.success && result.data) {
          const { issues, total, jql } = result.data;
          let msg = `🔍 *Search Results* (${total} total, showing ${issues.length})\n_JQL: \`${jql}\`_\n\n`;
          if (issues.length === 0) {
            msg += 'No issues found.';
          } else {
            msg += issues
              .map(
                (i: any) =>
                  `• *<${i.url}|${i.key}>* ${i.summary}\n  ${i.status} | ${i.priority} | ${i.assignee}`,
              )
              .join('\n\n');
          }
          results.push(msg);
        } else {
          results.push(`❌ ${result.message}`);
          allSuccess = false;
        }
        break;

      default:
        results.push(`⚠️ Unknown tool: ${action.tool}`);
        allSuccess = false;
    }
  }

  return {
    success: allSuccess,
    message: results.join('\n\n---\n\n'),
    actions: plan.actions,
  };
}
