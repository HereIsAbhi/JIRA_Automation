import { StructuredIssue } from './transformer';

export interface Draft {
  id: string;
  channelId: string;
  userId: string;
  rawText: string;
  structured: StructuredIssue;
  confluenceUrl: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'sent_to_jira';
  createdAt: Date;
}

// Simple in-memory store for PoC. Replace with DB in production.
const drafts = new Map<string, Draft>();

export function saveDraft(draft: Draft): void {
  drafts.set(draft.id, draft);
}

export function getDraft(id: string): Draft | undefined {
  return drafts.get(id);
}

export function updateDraftStatus(id: string, status: Draft['status']): Draft | undefined {
  const draft = drafts.get(id);
  if (draft) {
    draft.status = status;
    drafts.set(id, draft);
  }
  return draft;
}

export function getAllDrafts(): Draft[] {
  return Array.from(drafts.values());
}
