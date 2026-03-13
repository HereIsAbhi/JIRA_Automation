# Jira Automation PoC

Slack bot that takes raw issue descriptions, transforms them into structured Jira tickets using AI (OpenAI GPT-4o), creates a Confluence draft, and lets you review & approve directly from Slack.

## Architecture

```
User → Slack message (raw issue text)
  → Server receives via /slack/events
    → LLM transforms into structured JSON (OpenAI or mock)
    → Confluence draft created
    → Bot replies with rich Block Kit message
      → [Approve] → Creates Jira issue (mock)
      → [Edit] → Prompts for changes
      → [Reject] → Discards draft
```

## Quick Start

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your Slack and OpenAI credentials
```

### 3. Build & run

```bash
npm run build
npm start
```

Or run in dev mode with auto-reload:

```bash
npm run dev
```

### 4. Expose to internet (for Slack to reach your server)

Use [ngrok](https://ngrok.com/) for local development:

```bash
ngrok http 3000
```

Copy the HTTPS URL and use it for Slack event/interactivity URLs.

## Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From scratch
2. **OAuth & Permissions** → Add Bot Token Scopes:
   - `chat:write` — post messages
   - `channels:history` — read channel messages
   - `im:history` — read DMs
   - `groups:history` — read private channel messages
3. **Install App** to workspace → copy **Bot User OAuth Token** → set as `SLACK_BOT_TOKEN`
4. **Basic Information** → copy **Signing Secret** → set as `SLACK_SIGNING_SECRET`
5. **Event Subscriptions** → Enable → set Request URL to `https://<your-ngrok>/slack/events`
   - Subscribe to bot events: `message.channels`, `message.im`, `message.groups`
6. **Interactivity & Shortcuts** → Enable → set Request URL to `https://<your-ngrok>/slack/interactivity`
7. Invite the bot to a channel and send a raw issue message!

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| POST | `/slack/events` | Slack Events API receiver |
| POST | `/slack/interactivity` | Slack button click handler |
| GET | `/debug/issues` | List all mock Jira issues |

## Testing without Slack

You can simulate the flow with curl:

```bash
# Simulate a Slack message event
curl -X POST http://localhost:3000/slack/events \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "event_callback",
    "event": {
      "type": "message",
      "channel": "C12345",
      "user": "U12345",
      "text": "Login page crashes with 500 error when user session expires. Steps: 1) Wait for session timeout 2) Click any link. Expected: redirect to login. Actual: white error page."
    }
  }'

# Check created issues
curl http://localhost:3000/debug/issues
```

## Project Structure

```
src/
├── index.ts            # Entrypoint
├── config.ts           # Environment config
├── slackApp.ts         # Express server + Slack event/interactivity handlers
├── slackBlocks.ts      # Block Kit message builders
├── transformer.ts      # Raw text → structured JSON (OpenAI + mock fallback)
├── confluenceClient.ts # Confluence draft creator (mock)
├── jiraClient.ts       # Jira issue creator (mock)
├── draftStore.ts       # In-memory draft storage
└── test/
    └── runTransformTest.ts
```
