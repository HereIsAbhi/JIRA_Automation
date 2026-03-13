import dotenv from 'dotenv';
dotenv.config();

export const config = {
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET || '',
  slackBotToken:      process.env.SLACK_BOT_TOKEN || '',
  slackAppToken:      process.env.SLACK_APP_TOKEN || '',
  openaiApiKey:       process.env.OPENAI_API_KEY || '',
  claudeApiKey:       process.env.CLAUDE_API_KEY || '',
  confluenceBase:     process.env.CONFLUENCE_BASE || 'http://localhost:4001',
  port:               Number(process.env.PORT) || 3000,

  // Jira Cloud
  jiraBaseUrl:        process.env.JIRA_BASE_URL || '',
  jiraEmail:          process.env.JIRA_EMAIL || '',
  jiraApiToken:       process.env.JIRA_API_TOKEN || '',
  jiraProjectKey:     process.env.JIRA_PROJECT_KEY || 'KAN',
};