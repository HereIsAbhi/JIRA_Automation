// ── Whatfix Product Knowledge Base ────────────────────────────
// This context is injected into the LLM system prompt so the AI
// understands Whatfix products, terminology, modules, and can
// auto-enrich Jira tickets with the right labels, components,
// and triage info.

// ── Product Modules ──────────────────────────────────────────

export const WHATFIX_PRODUCTS: Record<string, {
  description: string;
  keywords: string[];
  components: string[];
  labels: string[];
}> = {
  'Digital Adoption Platform (DAP)': {
    description: 'Core DAP product — in-app guidance layer injected via a script tag on customer web apps',
    keywords: ['dap', 'script', 'snippet', 'tag', 'initialization', 'dap script', 'whatfix script', 'embed', 'init'],
    components: ['dap-core'],
    labels: ['dap'],
  },
  'Flows': {
    description: 'Step-by-step interactive walkthroughs that guide users through processes on a web app',
    keywords: ['flow', 'walkthrough', 'step', 'tooltip', 'guide', 'flow playback', 'flow step', 'next step', 'step targeting', 'smart tip flow', 'step description'],
    components: ['flows', 'content-creation'],
    labels: ['flows'],
  },
  'Smart Tips': {
    description: 'Contextual tooltips/popups shown on specific UI elements to provide in-app help',
    keywords: ['smart tip', 'smarttip', 'tooltip', 'hint', 'inline tip', 'validation tip', 'smart-tip'],
    components: ['smart-tips'],
    labels: ['smart-tips'],
  },
  'Self Help': {
    description: 'Embeddable help widget (search bar + resource aggregation) that surfaces Flows, articles, videos in-app',
    keywords: ['self help', 'selfhelp', 'help widget', 'search', 'resource aggregation', 'help menu', 'self-help', 'help center'],
    components: ['self-help'],
    labels: ['self-help'],
  },
  'Beacons': {
    description: 'Attention-grabbing animated indicators on UI elements to draw user focus',
    keywords: ['beacon', 'hotspot', 'attention', 'indicator', 'pulse', 'blink'],
    components: ['beacons'],
    labels: ['beacons'],
  },
  'Launchers': {
    description: 'Persistent buttons/widgets placed on a page to trigger Flows, links, or other content',
    keywords: ['launcher', 'button', 'trigger', 'action button', 'persistent button', 'launch'],
    components: ['launchers'],
    labels: ['launchers'],
  },
  'Task List': {
    description: 'Onboarding checklist widget showing users their progress through required tasks/flows',
    keywords: ['task list', 'tasklist', 'checklist', 'onboarding', 'task', 'progress', 'completion'],
    components: ['task-list'],
    labels: ['task-list'],
  },
  'Pop-ups': {
    description: 'Modal or slideout announcements shown to users for announcements, surveys, NPS',
    keywords: ['popup', 'pop-up', 'modal', 'announcement', 'banner', 'slideout', 'dialog', 'nps', 'survey'],
    components: ['popups'],
    labels: ['popups'],
  },
  'Analytics': {
    description: 'Usage analytics dashboard — tracks flow completion, user engagement, guidance metrics',
    keywords: ['analytics', 'dashboard', 'metrics', 'tracking', 'engagement', 'completion rate', 'funnel', 'event', 'report', 'data'],
    components: ['analytics'],
    labels: ['analytics'],
  },
  'Editor': {
    description: 'Whatfix Editor — browser extension used to create/edit Flows, Smart Tips, and other content',
    keywords: ['editor', 'chrome extension', 'create flow', 'edit flow', 'content creation', 'authoring', 'builder', 'wysiwyg'],
    components: ['editor'],
    labels: ['editor'],
  },
  'Quick Capture': {
    description: 'Feature to quickly record user actions and auto-generate Flow steps from a recording session',
    keywords: ['quick capture', 'capture', 'recording', 'record', 'auto capture', 'screen recording', 'auto-generate'],
    components: ['quick-capture', 'editor'],
    labels: ['quick-capture'],
  },
  'Segmentation': {
    description: 'User segmentation engine — target content to specific user groups based on attributes/behavior',
    keywords: ['segment', 'segmentation', 'targeting', 'user group', 'audience', 'filter', 'condition', 'rule'],
    components: ['segmentation'],
    labels: ['segmentation'],
  },
  'Content Aggregation': {
    description: 'System that aggregates content from multiple sources (Confluence, Zendesk, etc.) into Self Help',
    keywords: ['content aggregation', 'aggregation', 'external content', 'knowledge base', 'zendesk', 'confluence integration', 'article'],
    components: ['content-aggregation'],
    labels: ['content-aggregation'],
  },
  'Whatfix AI / Auto-content': {
    description: 'AI-powered features — auto-generate step descriptions, auto-translate, AI search, content suggestions',
    keywords: ['whatfix ai', 'ai', 'auto content', 'auto-content', 'auto generate', 'auto translate', 'ai search', 'gpt', 'llm', 'copilot', 'intelligent', 'auto description'],
    components: ['whatfix-ai'],
    labels: ['whatfix-ai'],
  },
  'Localization / Multi-language': {
    description: 'Multi-language support — translate flows and content into multiple languages',
    keywords: ['localization', 'translation', 'multi-language', 'i18n', 'language', 'translate', 'locale'],
    components: ['localization'],
    labels: ['localization'],
  },
  'Product Analytics': {
    description: 'Whatfix Product Analytics — event tracking, funnels, user journeys, feature adoption metrics',
    keywords: ['product analytics', 'event tracking', 'funnel', 'journey', 'adoption', 'feature usage', 'click tracking', 'heatmap', 'session replay'],
    components: ['product-analytics'],
    labels: ['product-analytics'],
  },
  'DAP for Desktop': {
    description: 'Digital adoption for desktop applications (Electron, Citrix, native apps)',
    keywords: ['desktop', 'electron', 'citrix', 'native app', 'desktop app', 'dap desktop', 'windows app'],
    components: ['dap-desktop'],
    labels: ['dap-desktop'],
  },
  'DAP for Mobile': {
    description: 'Digital adoption for mobile applications (iOS, Android)',
    keywords: ['mobile', 'ios', 'android', 'mobile app', 'dap mobile', 'mobile sdk'],
    components: ['dap-mobile'],
    labels: ['dap-mobile'],
  },
  'Mirror': {
    description: 'Whatfix Mirror — sandbox/simulation environment for training without touching production systems',
    keywords: ['mirror', 'sandbox', 'simulation', 'training environment', 'practice', 'safe environment', 'clone'],
    components: ['mirror'],
    labels: ['mirror'],
  },
};

// ── Common Technical Terms ───────────────────────────────────

export const WHATFIX_TERMINOLOGY: Record<string, string> = {
  'DAP Script': 'JavaScript snippet embedded in customer apps to load Whatfix guidance',
  'Step Targeting': 'CSS/XPath selector used to attach a Flow step to a specific UI element',
  'Selector': 'CSS selector or XPath used to identify DOM elements for targeting',
  'Content Fallback': 'Behavior when targeted element is not found — skip step, show alert, etc.',
  'Auto-play': 'Automatic playback of a Flow without user clicking Next',
  'Smart Step': 'Flow step that auto-advances when the user performs the expected action',
  'Segmentation Rule': 'Condition-based rule to show/hide content for specific user groups',
  'NPS Survey': 'Net Promoter Score survey shown via Pop-up widget',
  'DAP Version': 'Version of the Whatfix DAP script loaded on the customer site',
  'Guidance Analytics': 'Metrics on how users interact with Whatfix content (views, completions, drop-offs)',
  'Content Index': 'Search index used by Self Help to surface relevant help content',
  'Account': 'A Whatfix customer organization/tenant',
  'Organization': 'Top-level entity in Whatfix admin that owns multiple accounts',
  'Widget': 'Any Whatfix UI component rendered on the customer page (Self Help, Task List, etc.)',
  'ENT ID': 'Enterprise ID — unique identifier for a Whatfix customer/account',
};

// ── Priority Matrix ──────────────────────────────────────────

export const PRIORITY_RULES = `
Whatfix-specific priority rules:
- DAP script not loading / initialization failure → Highest (P1) — blocks all guidance
- Flow playback completely broken → Highest (P1)
- Analytics data loss / not recording → High (P2)
- Self Help widget not appearing → High (P2)
- Step targeting broken for a specific customer → High (P2)
- Quick Capture not recording steps / generating wrong steps → Medium (P3)
- Editor UI bug that doesn't block content creation → Medium (P3)
- Smart Tip style/positioning slightly off → Low (P4)
- Tooltip text cosmetic issues → Lowest (P5)
- Feature requests / improvements → Medium (P3) by default
- Customer-reported issues should be bumped up one priority level
- If an ENT ID or customer name is mentioned, mark as customer-reported
`;

// ── Build the enriched system prompt ─────────────────────────

export function buildWhatfixSystemPrompt(): string {
  // Build product knowledge section
  const productKnowledge = Object.entries(WHATFIX_PRODUCTS)
    .map(([name, info]) => `• **${name}**: ${info.description} (keywords: ${info.keywords.slice(0, 5).join(', ')})`)
    .join('\n');

  // Build terminology section
  const terminology = Object.entries(WHATFIX_TERMINOLOGY)
    .map(([term, def]) => `• ${term}: ${def}`)
    .join('\n');

  return `You are a senior engineering project manager at **Whatfix**, a leading Digital Adoption Platform company.

## WHATFIX PRODUCT KNOWLEDGE
You must use this knowledge to correctly categorize, label, and enrich Jira tickets:

${productKnowledge}

## KEY TERMINOLOGY
${terminology}

## AUTO-ENRICHMENT RULES
1. **Detect the product/module** from the issue description and set appropriate "components" and "labels" from the product mapping above.
2. **If multiple modules are involved**, list all relevant components and labels.
3. **If an ENT ID or customer name is mentioned**, add "customer-reported" to labels and mention it in the triage field.
4. **If a DAP version or browser is mentioned**, capture it in the "environment" field.
5. **Map team/component** automatically:
   - Flow/walkthrough issues → components: ["flows"]
   - Smart Tip issues → components: ["smart-tips"]
   - Editor/authoring issues → components: ["editor"]
   - Analytics issues → components: ["analytics"]
   - Self Help/widget issues → components: ["self-help"]
   - Quick Capture issues → components: ["quick-capture"]
   - AI/auto-content issues → components: ["whatfix-ai"]
   - Mirror/sandbox issues → components: ["mirror"]
   - Product Analytics issues → components: ["product-analytics"]

${PRIORITY_RULES}

## OUTPUT FORMAT
Given a raw, informal description of a software issue or feature request,
produce a well-structured Jira ticket in JSON format.

Return ONLY valid JSON with these exact fields:
{
  "summary": "short one-line title (max 120 chars) — prefix with module name e.g. [Flows], [Self Help], [Editor]",
  "description": "detailed description with context, impact, and technical details. Include which Whatfix module is affected and any customer/ENT ID info",
  "steps_to_reproduce": "numbered step-by-step instructions to reproduce (for bugs). Use newline chars for steps. Leave empty string for non-bugs",
  "expected_behavior": "what should happen (for bugs). Leave empty string for non-bugs",
  "actual_behavior": "what actually happens (for bugs). Leave empty string for non-bugs",
  "acceptance_criteria": ["list of specific, testable acceptance criteria"],
  "priority": "one of: Lowest, Low, Medium, High, Highest — use Whatfix priority rules above",
  "labels": ["relevant Whatfix labels from product mapping, plus: bug/feature/regression/customer-reported as applicable"],
  "components": ["Whatfix module components from the mapping above"],
  "issue_type": "one of: Bug, Task, Story, Improvement",
  "triage": "one of: Needs Investigation, Confirmed, Cannot Reproduce, Duplicate — add customer context if ENT ID present",
  "environment": "environment info: browser, OS, DAP version, staging/production, customer site URL if mentioned, or empty string",
  "estimated_effort": "estimated effort: S, M, L, or XL"
}

Rules:
- ALWAYS try to detect which Whatfix product/module the issue relates to
- Prefix the summary with the module name in brackets: [Flows], [Quick Capture], [Analytics], etc.
- If you detect a customer ENT ID (e.g. "ent id 12345"), include it in the description and add "customer-reported" label
- Extract steps to reproduce from the text if it is a bug
- Separate expected vs actual behavior clearly
- Set triage to "Needs Investigation" by default for bugs, "Confirmed" for features/tasks
- Keep summary concise but descriptive
- Return ONLY the JSON object, no markdown fences, no explanation`;
}
