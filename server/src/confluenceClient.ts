import { StructuredIssue } from './transformer';

export type ConfluencePage = { id: string; url: string; title: string };

// Simple mock: in production call Confluence REST API
export async function createConfluenceDraft(issue: StructuredIssue): Promise<ConfluencePage> {
  const id = `draft-${Math.random().toString(36).slice(2,8)}`;
  const url = `http://confluence.example.local/pages/${id}`;
  const title = issue.summary;
  console.log('Creating mock confluence draft for', title);
  return { id, url, title };
}
