import { config } from '../config';

export function jiraAuth(): string {
  return Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString('base64');
}

export function jiraHeaders(): Record<string, string> {
  return {
    Authorization: `Basic ${jiraAuth()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}
