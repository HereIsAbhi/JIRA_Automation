import { app } from './slackApp';
import { config } from './config';
import { checkJiraConnection } from './jiraClient';
import express from 'express';

async function main(): Promise<void> {
  console.log('🚀 Starting Jira Automation PoC...\n');

  // Check Jira connection
  await checkJiraConnection();

  // Start Slack Bolt (Socket Mode)
  await app.start();
  console.log(`\n⚡ Slack bot is running (Socket Mode — no public URL needed!)`);

  // Debug HTTP server
  const debug = express();
  debug.get('/', (_req, res) => res.send('Jira Automation PoC — running'));
  debug.listen(config.port, () => {
    console.log(`🔧 Debug server: http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});