import { StructuredIssue } from './transformer';

const PRIORITY_EMOJI: Record<string, string> = {
  Highest: '🔴',
  High: '🟠',
  Medium: '🟡',
  Low: '🟢',
  Lowest: '⚪',
};

/**
 * Build a rich Slack Block Kit review card showing all structured fields
 * with Approve / Edit / Reject buttons.
 */
export function buildReviewBlocks(
  issue: StructuredIssue,
  confluenceUrl: string,
  draftId: string,
): any[] {
  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📋 New Issue Draft Ready for Review', emoji: true },
    },
    { type: 'divider' },

    // ── Summary + Type ──
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Summary:*\n${issue.summary}` },
        { type: 'mrkdwn', text: `*Type:*\n${issue.issue_type}` },
      ],
    },

    // ── Description ──
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Description:*\n${truncate(issue.description, 500)}`,
      },
    },

    // ── Priority + Effort ──
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Priority:* ${PRIORITY_EMOJI[issue.priority] || '🟡'} ${issue.priority}`,
        },
        { type: 'mrkdwn', text: `*Effort:* ${issue.estimated_effort}` },
      ],
    },

    // ── Triage + Environment ──
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Triage:*\n${issue.triage || '_not set_'}` },
        { type: 'mrkdwn', text: `*Environment:*\n${issue.environment || '_not specified_'}` },
      ],
    },
  ];

  // ── Steps to Reproduce (only if non-empty) ──
  if (issue.steps_to_reproduce) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔄 Steps to Reproduce:*\n${truncate(issue.steps_to_reproduce, 400)}`,
      },
    });
  }

  // ── Expected / Actual Behavior ──
  if (issue.expected_behavior || issue.actual_behavior) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*✅ Expected:*\n${issue.expected_behavior || '_not specified_'}`,
        },
        {
          type: 'mrkdwn',
          text: `*❌ Actual:*\n${issue.actual_behavior || '_not specified_'}`,
        },
      ],
    });
  }

  // ── Labels + Components ──
  blocks.push({
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: `*Labels:*\n${issue.labels.join(', ') || '_none_'}` },
      { type: 'mrkdwn', text: `*Components:*\n${issue.components.join(', ') || '_none_'}` },
    ],
  });

  // ── Acceptance Criteria ──
  if (issue.acceptance_criteria.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*Acceptance Criteria:*\n` +
          issue.acceptance_criteria.map((ac, i) => `${i + 1}. ${ac}`).join('\n'),
      },
    });
  }

  blocks.push({ type: 'divider' });

  // ── Confluence link ──
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `📄 *Confluence Draft:* <${confluenceUrl}|View Draft>`,
    },
  });

  // ── Attachments ──
  if (issue.attachments && issue.attachments.length > 0) {
    blocks.push({ type: 'divider' });
    const attachText = issue.attachments
      .map((a) => {
        const icon = a.mimetype.startsWith('image/')
          ? '🖼️'
          : a.mimetype.startsWith('video/')
            ? '🎥'
            : '📎';
        return `${icon} <${a.url}|${a.name}>`;
      })
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Attachments (${issue.attachments.length}):*\n${attachText}`,
      },
    });

    const firstImage = issue.attachments.find((a) =>
      a.mimetype.startsWith('image/'),
    );
    if (firstImage) {
      blocks.push({
        type: 'image',
        image_url: firstImage.url,
        alt_text: firstImage.name,
        title: { type: 'plain_text', text: firstImage.name },
      });
    }
  }

  // ── Action buttons ──
  blocks.push({
    type: 'actions',
    block_id: `draft_actions_${draftId}`,
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Approve & Create Jira', emoji: true },
        style: 'primary',
        action_id: 'approve_draft',
        value: draftId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ Edit Fields', emoji: true },
        action_id: 'edit_draft',
        value: draftId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ Reject', emoji: true },
        style: 'danger',
        action_id: 'reject_draft',
        value: draftId,
      },
    ],
  });

  return blocks;
}

/**
 * Build a confirmation message after Jira issue is created.
 */
export function buildJiraCreatedBlocks(
  jiraKey: string,
  jiraUrl: string,
  summary: string,
): any[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *Jira issue created!*\n\n*${jiraKey}*: ${summary}\n🔗 <${jiraUrl}|Open in Jira>`,
      },
    },
  ];
}

// ── Helper ───────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (!text) return '_empty_';
  return text.length > max ? text.slice(0, max) + '…' : text;
}
