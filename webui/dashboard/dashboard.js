/**
 * HiveForge Dashboard — dashboard.js
 * Client-side state management, API stubs, SSE, rendering.
 * All API calls are stubs returning placeholder data until the backend
 * endpoints are wired up in hiveforge_server.js (Task 4+).
 */

'use strict';

// ─── Constants ──────────────────────────────────────────────────────────────

const API = {
  projects:    '/api/projects',
  agents:      '/api/agents',
  tasks:       '/api/tasks',
  heartbeat:   '/api/heartbeat',
  workspace:   '/api/workspace',
  workspaceFile: '/api/workspace/file',
  credentials: '/api/credentials',
  integrations:'/api/integrations',
  analytics:   '/api/analytics',
  kpiGoals:    '/api/kpi_goals',
  approvals:   '/api/approvals',
  logs:        '/api/logs',
  messageBus:  '/api/message_bus',
  marketplace: '/api/marketplace',
  control:     '/api/control',
  settings:    '/api/settings',
  settingsReset: '/api/settings/reset',
  productionCertification: '/api/production_certification',
  projectSettings: '/api/project_settings',
  taskApproval: '/api/task_approval',
  taskApprovalBatch: '/api/task_approval/batch',
  credentialPolicy: '/api/credential_policy',
  credentialBudget: '/api/credential_budget',
  credentialAudit: '/api/credential_audit',
  connectorBootstrap: '/api/connector_bootstrap',
  connectorBootstrapAuto: '/api/connector_bootstrap/auto',
  connectorsExecute: '/api/connectors/execute',
  netlifyDeploy: '/api/netlify/deploy',
  netlifyDeploys: '/api/netlify/deploys',
  notificationTest: '/api/notifications/test',
  retryPolicyTest: '/api/retry_policy/test',
};

const SECTION_TITLES = {
  projects:    'Projects',
  'new-project': 'New Project',
  agents:      'Agent Activity Monitor',
  kanban:      'Task Pipeline',
  approvals:   'Approvals',
  workspace:   'Workspace Explorer',
  heartbeat:   'Heartbeat Monitor',
  logs:        'Logs & Timeline',
  'message-bus': 'Message Bus',
  credentials: 'Credential Manager',
  analytics:   'Analytics',
  marketplace: 'Agent Marketplace',
  settings:    'Settings',
};

const TEMPLATES = {
  business:        { label: 'Business', roster: ['Coordinator','Marketing Manager','Sales Manager','Financial Controller','Content Writer','Data Analyst'] },
  software_agency: { label: 'Software Agency', roster: ['Coordinator','Lead Developer','Frontend Dev','Backend Dev','QA Engineer','DevOps Engineer'] },
  game_studio:     {
    label: 'Game Studio (2D Web-First)',
    roster: ['Coordinator','2D Game Designer','Gameplay Engineer','Technical Artist','Game Audio Engineer','QA Engineer'],
    summary: 'Build 2D web-first, lock a strong single-player loop first, auto-test deploy to Netlify, start with primitive square assets, then hand off to human art before itch.io and Steam tracks.',
    bullets: [
      'Default delivery: 2D browser game',
      'Automatic Netlify test deploy lane',
      'Primitive placeholders (squares/shapes) until human art arrives',
      'Dual release path: itch.io (web) and Steam (desktop wrapper)',
      'Single-player first, with optional P2P multiplayer and relay fallback only when needed'
    ]
  },
  publishing_house:{ label: 'Publishing House', roster: ['Coordinator','Editor','Content Writer','Proofreader','Marketing Manager','Distribution Manager'] },
  music_production:{ label: 'Music Production', roster: ['Coordinator','Producer','Audio Engineer','Lyricist','Marketing Manager','Distribution Manager'] },
  research_lab:    { label: 'Research Lab', roster: ['Coordinator','Research Lead','Data Scientist','Technical Writer','Literature Reviewer','Statistician'] },
  content_creator: { label: 'Content Creator', roster: ['Coordinator','Content Strategist','Video Editor','SEO Specialist','Social Media Manager','Analytics Reporter'] },
};

// Agent personality files from agency-agents (MIT)
// https://github.com/msitarzewski/agency-agents
const MARKETPLACE_AGENTS = [
  { id:'coordinator',          name:'Coordinator',           division:'Management',    desc:'Routes tasks, prevents loops, manages state, enforces credentials.',   recommended:true },
  { id:'marketing_manager',    name:'Marketing Manager',     division:'Marketing',     desc:'Plans campaigns, briefs creative, tracks KPIs.',                       recommended:true },
  { id:'content_writer',       name:'Content Writer',        division:'Creative',      desc:'Long-form copy, blogs, landing pages.',                                recommended:true },
  { id:'seo_specialist',       name:'SEO Specialist',        division:'Marketing',     desc:'Keyword research, on-page optimisation, backlink strategy.',           recommended:false },
  { id:'social_media_manager', name:'Social Media Manager',  division:'Marketing',     desc:'Schedules posts, monitors engagement, responds to followers.',         recommended:false },
  { id:'email_marketer',       name:'Email Marketer',        division:'Marketing',     desc:'Drip campaigns, A/B subject lines, list hygiene.',                     recommended:false },
  { id:'data_analyst',         name:'Data Analyst',          division:'Analytics',     desc:'Queries, dashboards, performance reports.',                            recommended:true },
  { id:'lead_developer',       name:'Lead Developer',        division:'Engineering',   desc:'Architecture decisions, code review, tech debt management.',           recommended:true },
  { id:'frontend_dev',         name:'Frontend Developer',    division:'Engineering',   desc:'React/Svelte components, CSS, accessibility.',                         recommended:false },
  { id:'backend_dev',          name:'Backend Developer',     division:'Engineering',   desc:'APIs, databases, authentication, server logic.',                       recommended:false },
  { id:'devops_engineer',      name:'DevOps Engineer',       division:'Engineering',   desc:'CI/CD, Netlify deploys, infrastructure as code.',                      recommended:false },
  { id:'qa_engineer',          name:'QA Engineer',           division:'Engineering',   desc:'Test plans, bug reports, regression testing.',                         recommended:false },
  { id:'product_manager',      name:'Product Manager',       division:'Management',    desc:'Roadmap, prioritisation, stakeholder updates.',                        recommended:false },
  { id:'financial_controller', name:'Financial Controller',  division:'Finance',       desc:'Budgets, forecasts, spend tracking, invoicing.',                       recommended:false },
  { id:'sales_manager',        name:'Sales Manager',         division:'Sales',         desc:'Pipeline management, outreach, CRM hygiene.',                          recommended:false },
  { id:'customer_support',     name:'Customer Support',      division:'Support',       desc:'Ticket triage, FAQ drafting, user communications.',                    recommended:false },
  { id:'research_lead',        name:'Research Lead',         division:'Research',      desc:'Literature reviews, competitor analysis, trend scanning.',              recommended:false },
  { id:'copywriter',           name:'Copywriter',            division:'Creative',      desc:'Ad copy, UX writing, conversion-focused microcopy.',                   recommended:false },
  { id:'graphic_designer',     name:'Graphic Designer',      division:'Creative',      desc:'Visual assets, brand guidelines, image generation prompts.',           recommended:false },
  { id:'legal_reviewer',       name:'Legal Reviewer',        division:'Compliance',    desc:'Contract review, GDPR checks, disclaimer drafting.',                  recommended:false },
];

const DIVISIONS = ['All', ...new Set(MARKETPLACE_AGENTS.map(a => a.division))].sort((a,b) => a === 'All' ? -1 : a.localeCompare(b));

const CREDENTIAL_SERVICES = [
  { id:'github',        label:'GitHub',            icon:'🐙', desc:'Repository access, automation, and deployment workflows.' },
  { id:'netlify',       label:'Netlify',          icon:'🌐', desc:'Deploy static sites & serverless functions.' },
  { id:'stripe',        label:'Stripe',            icon:'💳', desc:'Process payments, subscriptions, invoices.'  },
  { id:'google_ads',    label:'Google Ads',        icon:'📣', desc:'Create and manage ad campaigns.'            },
  { id:'analytics',     label:'Google Analytics',  icon:'📊', desc:'Track traffic, events, and conversions.'    },
  { id:'supabase',      label:'Supabase',          icon:'🗄️', desc:'Postgres database, auth, and storage for app backends.' },
  { id:'email_provider',label:'Email Provider',    icon:'📧', desc:'SMTP / transactional email (Mailgun etc.).' },
];

const KPI_LABELS = ['Tasks Done', 'In Progress', 'Backlog', 'Agents Active', 'Tokens Used', 'Uptime'];
const KPI_PLACEHOLDER = ['—', '—', '—', '—', '—', '—'];
const PLATFORM_CONNECTIONS = [
  {
    id: 'github',
    label: 'GitHub CLI',
    note: 'Used by the github skill for deployment and repo workflows.',
    loginUrl: 'https://github.com/login',
  },
  {
    id: 'clawhub',
    label: 'ClawHub CLI',
    note: 'Used to install and manage skills in local workspace.',
    loginUrl: 'https://clawhub.ai',
  },
];

const CONNECTOR_WEBSITES = {
  github: 'https://github.com/settings/tokens',
  telegram: 'https://core.telegram.org/bots',
  whatsapp: 'https://developers.facebook.com/docs/whatsapp',
  netlify: 'https://app.netlify.com/user/applications#personal-access-tokens',
  stripe: 'https://dashboard.stripe.com/apikeys',
  google_ads: 'https://ads.google.com/home/tools/manager-accounts/',
  analytics: 'https://analytics.google.com/',
  supabase: 'https://supabase.com/dashboard/account/tokens',
  email_provider: 'https://www.mailgun.com/',
};

const SERVICE_LABELS = {
  netlify:        'Netlify',
  stripe:         'Stripe',
  google_ads:     'Google Ads',
  analytics:      'Google Analytics',
  supabase:       'Supabase',
  email_provider: 'Email (Mailgun)',
  github:         'GitHub',
  telegram:       'Telegram',
  whatsapp:       'WhatsApp',
};

const SERVICE_TOKEN_GUIDES = {
  github: {
    where: 'GitHub Settings -> Developer settings -> Personal access tokens.',
    what: 'Use a fine-grained token with repo scopes you need (or classic token if preferred).',
  },
  netlify: {
    where: 'User Settings -> Applications -> Personal access tokens.',
    what: 'Paste the full personal access token.',
  },
  stripe: {
    where: 'Developers -> API keys in your Stripe dashboard.',
    what: 'Use a Secret key (starts with sk_live_ or sk_test_).',
  },
  google_ads: {
    where: 'Google Ads manager/API credentials area.',
    what: 'Paste your developer token or access token used by your connector flow.',
  },
  analytics: {
    where: 'Google Cloud console under APIs & Services credentials.',
    what: 'Use the access token or service credential expected by your Analytics connector setup.',
  },
  supabase: {
    where: 'Supabase dashboard -> Account -> Access Tokens, or the project API settings used by your gateway flow.',
    what: 'Use the personal access token or service role credential expected by your Supabase API gateway integration.',
  },
  email_provider: {
    where: 'Mailgun dashboard -> API Security -> API Keys.',
    what: 'Use the private API key (starts with key-).',
  },
};

const CONNECTOR_BOOTSTRAP_FIELDS = {
  netlify: 'defaultSiteId',
  google_ads: 'defaultCustomerId',
  supabase: 'defaultProjectRef',
};

const CONNECTOR_BOOTSTRAP_LABELS = {
  netlify: 'Netlify',
  google_ads: 'Google Ads',
  supabase: 'Supabase',
};

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  activeSection:  'projects',
  activeProject:  null,   // { id, name, template }
  projects:       [],
  agents:         [],
  tasks:          [],
  logs:           [],
  messageBus:     [],
  credentialPolicies: [],
  credentialBudget: [],
  credentialAudit: [],
  credentials: [],
  workspacePath: '',
  messageBusPoller: null,
  messageBusFilter: { kind: '', actor: '', q: '' },
  marketplaceFilter: { division: 'All', query: '' },
  approvalsFilter: { sortBy: 'risk', direction: 'desc', minRisk: 'all' },
  selectedApprovalTaskIds: new Set(),
  activeSettingsTab: 'runtime',
  sseSource:      null,
  _pendingAddAgentId: null,
};

// ─── API Helpers (stubs — will call real server routes once Task 4 is done) ──

/**
 * Wrapper around fetch that talks to hiveforge_server.js.
 * Returns parsed JSON or throws with a friendly error.
 */
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${msg}`);
  }
  return res.json();
}

// Stub wrappers — each returns mock data until the backend endpoint exists.

async function fetchProjects() {
  try { return await apiFetch(API.projects); }
  catch { return []; }  // backend not yet wired — return empty
}

async function fetchAgents(projectId) {
  try { return await apiFetch(`${API.agents}?projectId=${projectId}`); }
  catch { return []; }
}

async function fetchTasks(projectId) {
  try { return await apiFetch(`${API.tasks}?projectId=${projectId}`); }
  catch { return []; }
}

async function fetchHeartbeat(projectId) {
  try { return await apiFetch(`${API.heartbeat}?projectId=${projectId}`); }
  catch { return null; }
}

async function fetchCredentials() {
  try { return await apiFetch(API.credentials); }
  catch { return []; }
}

async function fetchIntegrations() {
  try {
    return await apiFetch(API.integrations);
  } catch {
    return {
      github: false,
      clawhub: false,
    };
  }
}

async function fetchAnalytics(projectId) {
  try { return await apiFetch(`${API.analytics}?projectId=${projectId}`); }
  catch {
    return {
      kpi: KPI_PLACEHOLDER,
      metrics: { tasksDoneThisWeek: 0, backlog: 0, monthlySpend: 0 },
      goals: { weeklyTasksDoneTarget: 0, maxBacklog: 0, maxMonthlySpend: 0 },
      variance: { weeklyTasksDone: 0, backlog: 0, monthlySpend: 0 },
      alerts: [],
      deadLetters: [],
    };
  }
}

async function fetchLogs(projectId, filter='all') {
  try { return await apiFetch(`${API.logs}?projectId=${projectId}&filter=${filter}`); }
  catch { return []; }
}

async function fetchMessageBus(projectId, limit = 300, filter = {}) {
  const qp = new URLSearchParams();
  if (projectId) qp.set('projectId', projectId);
  qp.set('limit', String(limit));
  if (filter.kind) qp.set('kind', String(filter.kind));
  if (filter.actor) qp.set('actor', String(filter.actor));
  if (filter.q) qp.set('q', String(filter.q));
  try { return await apiFetch(`${API.messageBus}?${qp.toString()}`); }
  catch { return []; }
}

async function postControl(projectId, action, payload = {}) {
  return apiFetch(API.control, {
    method: 'POST',
    body: JSON.stringify({ projectId, action, ...payload }),
  });
}

async function fetchSettings() {
  return apiFetch(API.settings);
}

async function fetchProjectSettings(projectId) {
  return apiFetch(`${API.projectSettings}?projectId=${encodeURIComponent(projectId)}`);
}

async function fetchApprovals(projectId, sortBy = 'risk', direction = 'desc', minRisk = 'all') {
  const qp = new URLSearchParams();
  qp.set('projectId', String(projectId || ''));
  qp.set('sortBy', String(sortBy || 'risk'));
  qp.set('direction', String(direction || 'desc'));
  qp.set('minRisk', String(minRisk || 'all'));
  return apiFetch(`${API.approvals}?${qp.toString()}`);
}

async function runConnectorCheck(connector, projectId, dryRun = true, operation = '', estimatedCost = null) {
  return apiFetch(API.connectorsExecute, {
    method: 'POST',
    body: JSON.stringify({ connector, projectId, dryRun, operation, estimatedCost }),
  });
}

async function fetchCredentialPolicy(projectId) {
  return apiFetch(`${API.credentialPolicy}?projectId=${encodeURIComponent(projectId)}`);
}

async function fetchCredentialBudget(projectId) {
  return apiFetch(`${API.credentialBudget}?projectId=${encodeURIComponent(projectId)}`);
}

async function fetchCredentialAudit(projectId, limit = 80) {
  return apiFetch(`${API.credentialAudit}?projectId=${encodeURIComponent(projectId)}&limit=${encodeURIComponent(limit)}`);
}

async function fetchConnectorBootstrap(service) {
  return apiFetch(`${API.connectorBootstrap}?service=${encodeURIComponent(service)}`);
}

async function saveConnectorBootstrap(service, selectedId) {
  return apiFetch(API.connectorBootstrap, {
    method: 'POST',
    body: JSON.stringify({ service, selectedId }),
  });
}

async function autoBootstrapConnectors() {
  return apiFetch(API.connectorBootstrapAuto, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

async function fetchWorkspace(projectId, relativePath = '') {
  return apiFetch(`${API.workspace}?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(relativePath)}`);
}

async function fetchWorkspaceFile(projectId, relativePath) {
  return apiFetch(`${API.workspaceFile}?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(relativePath)}`);
}

function renderSettings(data) {
  const runtime = data?.runtime || {};
  const llm = data?.llm || {};
  const planning = data?.planning || {};
  const notifications = data?.notifications || {};
  document.getElementById('settingsHeartbeatSeconds').value = String(Math.round((Number(runtime.heartbeatIntervalMs) || 30000) / 1000));
  document.getElementById('settingsStallMinutes').value = String(Math.round((Number(runtime.stallTimeoutMs) || 600000) / 60000));
  document.getElementById('settingsMaxAutoFixes').value = String(Number(runtime.maxAutoFixes) || 5);
  document.getElementById('settingsCountManualHeartbeat').checked = Boolean(runtime.countManualHeartbeatForStall);
  document.getElementById('settingsLlmEndpoint').value = llm.endpoint || '';
  const preferFreeTierInput = document.getElementById('settingsPreferFreeTierFirst');
  const requireUpgradeApprovalInput = document.getElementById('settingsRequirePaidTierApproval');
  const preferredDatabaseInput = document.getElementById('settingsPreferredDatabase');
  const notifyToInput = document.getElementById('settingsWhatsAppNotifyTo');
  const telegramChatInput = document.getElementById('settingsTelegramChatId');
  const channelInput = document.getElementById('settingsNotifyChannel');
  const kpiAlertsInput = document.getElementById('settingsKpiAlertsEnabled');
  const kpiCooldownInput = document.getElementById('settingsKpiAlertCooldown');
  if (preferFreeTierInput) preferFreeTierInput.checked = planning?.preferFreeTierFirst !== false;
  if (requireUpgradeApprovalInput) requireUpgradeApprovalInput.checked = planning?.requireApprovalForPaidTierUpgrade !== false;
  if (preferredDatabaseInput) preferredDatabaseInput.value = planning?.preferredDatabaseService === 'manual' ? 'manual' : 'supabase';
  if (notifyToInput) notifyToInput.value = notifications?.whatsapp?.notifyTo || '';
  if (telegramChatInput) telegramChatInput.value = notifications?.telegram?.chatId || '';
  if (channelInput) channelInput.value = notifications?.preferredChannel === 'telegram' ? 'telegram' : 'whatsapp';
  if (kpiAlertsInput) kpiAlertsInput.checked = notifications?.kpiAlerts?.enabled !== false;
  if (kpiCooldownInput) kpiCooldownInput.value = String(Number(notifications?.kpiAlerts?.cooldownMinutes) || 120);
  const hint = document.getElementById('settingsNotifyHint');
  if (hint) {
    const wa = notifications?.whatsapp?.enabled;
    const tg = notifications?.telegram?.enabled;
    hint.textContent = `WhatsApp ${wa ? 'ready' : 'not ready'} · Telegram ${tg ? 'ready' : 'not ready'}`;
  }
  const badge = document.getElementById('lastCertBadge');
  if (badge) {
    if (data?.lastCertification) {
      const lc = data.lastCertification;
      const when = new Date(lc.at).toLocaleString();
      badge.textContent = lc.passed ? `✓ Last passed ${when}` : `✗ Last failed ${when}`;
      badge.style.color = lc.passed ? 'var(--ok, #5cb85c)' : 'var(--error, #d9534f)';
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }
  renderProductionEvidenceSummary(data?.productionEvidence || null);
  renderRetryPolicySettings(data?.retryPolicies || {});
}

function renderProductionEvidenceSummary(data) {
  const select = document.getElementById('productionEvidenceRunSelect');
  const checklistSummary = document.getElementById('productionEvidenceChecklistSummary');
  const checklistList = document.getElementById('productionEvidenceChecklist');
  if (!select || !checklistSummary || !checklistList) return;

  const runs = Array.isArray(data?.recentRuns) ? data.recentRuns : [];
  select.innerHTML = runs.length
    ? runs.map((run, idx) => `<option value="${esc(run.runId || '')}" ${idx === 0 ? 'selected' : ''}>${esc(run.runId || 'run')} · ${run.passed ? 'PASS' : 'FAIL'}</option>`).join('')
    : '<option value="">No runs yet</option>';

  const latest = data?.latest || runs[0] || null;
  if (!latest) {
    checklistSummary.textContent = 'No evidence loaded.';
    checklistList.innerHTML = '<div style="color:var(--muted);">No checklist entries yet.</div>';
    return;
  }

  const checklist = Array.isArray(latest.checklist) ? latest.checklist : [];
  const passed = checklist.filter((entry) => entry.ok).length;
  checklistSummary.textContent = `${latest.passed ? 'PASS' : 'FAIL'} · ${passed}/${checklist.length} checks passed`;
  checklistList.innerHTML = checklist.length
    ? checklist.map((entry) => `<div class="hf-log-line"><strong>${entry.ok ? 'PASS' : 'FAIL'}</strong> ${esc(entry.title || entry.id || 'check')}<div style="color:var(--muted);margin-top:0.15rem;">${esc(entry.evidence || '')}</div></div>`).join('')
    : '<div style="color:var(--muted);">No checklist entries yet.</div>';
}

function renderRetryPolicySettings(retryPolicies = {}) {
  const list = document.getElementById('settingsRetryPolicyList');
  if (!list) return;
  const entries = Object.entries(retryPolicies || {});
  list.innerHTML = entries.length
    ? entries.map(([connector, cfg]) => `
      <div class="hf-grid-2" style="padding:0.45rem 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-weight:600;">${esc(connector)}</div>
          <div style="font-size:0.76rem;color:var(--muted);">Connector retry policy</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(80px,1fr));gap:0.4rem;align-items:center;">
          <input class="settings-retry-max-attempts" data-connector="${esc(connector)}" type="number" min="1" max="20" step="1" value="${esc(String(Number(cfg.maxAttempts) || 3))}" title="Max Attempts" />
          <input class="settings-retry-base-delay" data-connector="${esc(connector)}" type="number" min="1" max="43200" step="1" value="${esc(String(Math.round((Number(cfg.baseDelayMs) || 30000) / 1000)))}" title="Base Delay Seconds" />
          <input class="settings-retry-max-delay" data-connector="${esc(connector)}" type="number" min="1" max="86400" step="1" value="${esc(String(Math.round((Number(cfg.maxDelayMs) || 1800000) / 1000)))}" title="Max Delay Seconds" />
          <button class="hf-btn secondary hf-btn sm" onclick="Dashboard.testRetryPolicy('${esc(connector)}')">Test</button>
        </div>
      </div>
    `).join('')
    : '<div style="color:var(--muted);">No retry policies found.</div>';
}

function collectRetryPolicyPayload() {
  const out = {};
  const maxInputs = document.querySelectorAll('.settings-retry-max-attempts');
  maxInputs.forEach((input) => {
    const connector = String(input.getAttribute('data-connector') || '').trim().toLowerCase();
    if (!connector) return;
    const baseInput = document.querySelector(`.settings-retry-base-delay[data-connector="${connector}"]`);
    const maxDelayInput = document.querySelector(`.settings-retry-max-delay[data-connector="${connector}"]`);
    out[connector] = {
      maxAttempts: Number(input.value || 3),
      baseDelayMs: Math.round(Number(baseInput?.value || 30) * 1000),
      maxDelayMs: Math.round(Number(maxDelayInput?.value || 1800) * 1000),
    };
  });
  return out;
}

function renderProjectAutomation(data) {
  const empty = document.getElementById('projectAutomationEmpty');
  const panel = document.getElementById('projectAutomationPanel');
  const enabledInput = document.getElementById('projectRecurringEnabled');
  const schedule = document.getElementById('projectRecurringSchedule');
  if (!data || !state.activeProject) {
    if (empty) empty.style.display = 'block';
    if (panel) panel.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  panel.style.display = 'block';
  enabledInput.checked = Boolean(data.recurring?.enabled);
  const lastRunAt = data.recurring?.lastRunAt || {};
  const entries = Array.isArray(data.schedule) ? data.schedule : [];
  schedule.innerHTML = entries.length
    ? entries.map((entry) => {
      const ranAt = lastRunAt[entry.key] ? new Date(lastRunAt[entry.key]).toLocaleString() : 'Never';
      return `<div style="padding:0.3rem 0;border-bottom:1px solid var(--border);"><strong>${esc(entry.title)}</strong><div style="font-size:0.78rem;color:var(--muted);">${esc(entry.phase)} · every ${esc(entry.everyHuman || 'n/a')}</div><div style="font-size:0.76rem;color:var(--muted);">Last run: ${esc(ranAt)}</div></div>`;
    }).join('')
    : '<div style="color:var(--muted);">No recurring schedule defined for this template.</div>';

  const pack = data?.approvalGovernance?.industryPolicyPack || null;
  const milestone = data?.milestoneCompletion || null;
  const orchestration = data?.orchestration || {};
  setText('automationPolicyPack', pack ? (pack.title || pack.id || 'active') : 'none');
  setText('automationMilestoneProgress', milestone && typeof milestone.pct === 'number' ? `${milestone.pct}%` : '—');
  setText('automationPendingApprovals', Number(orchestration.pendingApprovalCount || 0));
  setText('automationAssistanceCount', Number(orchestration.assistanceRequestCount || 0));

  // Readiness Checklist Card (Game Studio only)
  const readinessList = document.getElementById('automationReadinessChecklist');
  if (readinessList && state.activeProject?.template === 'game_studio') {
    const checklist = Array.isArray(data?.goalPlan?.readinessChecklist) ? data.goalPlan.readinessChecklist : [];
    readinessList.innerHTML = checklist.length
      ? checklist.map((item) => `<div class="hf-log-line"><strong>${item.ok ? '✔️' : '⬜'}</strong> ${esc(item.title || item.id || 'check')}<div style="color:var(--muted);margin-top:0.15rem;">${esc(item.note || '')}</div></div>`).join('')
      : '<div style="color:var(--muted);">No readiness checklist items.</div>';
  }

  const blockers = document.getElementById('automationConnectorBlockers');
  if (blockers) {
    const missingServices = Array.isArray(data?.goalPlan?.missingCredentialServices)
      ? data.goalPlan.missingCredentialServices
      : [];
    const pendingReadiness = Array.isArray(orchestration.pendingConnectorReadiness)
      ? orchestration.pendingConnectorReadiness
      : [];
    const lines = [];
    missingServices.forEach((svc) => {
      lines.push(`<div class=\"hf-log-line\"><strong>Missing credential:</strong> ${esc(String(svc))}</div>`);
    });
    pendingReadiness.forEach((item) => {
      lines.push(`<div class=\"hf-log-line\"><strong>${esc(item.taskId || 'task')}</strong> ${esc(item.title || '')}<div style=\"color:var(--muted);margin-top:0.15rem;\">${esc(item.phase || 'general')} · ${esc(item.status || 'backlog')}</div></div>`);
    });
    blockers.innerHTML = lines.length ? lines.join('') : '<div style=\"color:var(--muted);\">No connector blockers detected.</div>';
  }

  const milestoneList = document.getElementById('automationMilestoneList');
  if (milestoneList) {
    const milestones = Array.isArray(milestone?.milestones) ? milestone.milestones : [];
    milestoneList.innerHTML = milestones.length
      ? milestones.map((item) => `<div class=\"hf-log-line\"><strong>${esc(item.id || 'MS')}</strong> ${esc(item.title || '')}<div style=\"color:var(--muted);margin-top:0.15rem;\">${esc(item.doneTaskCount || 0)}/${esc(item.requiredTaskCount || 0)} tasks · ${item.completedAt ? 'complete' : 'pending'}</div></div>`).join('')
      : '<div style=\"color:var(--muted);\">No milestones generated yet.</div>';
  }

  const approvalsList = document.getElementById('automationApprovalsList');
  if (approvalsList) {
    const approvals = Array.isArray(orchestration.pendingApprovals)
      ? orchestration.pendingApprovals
      : [];
    approvalsList.innerHTML = approvals.length
      ? approvals.map((item) => `<div class=\"hf-log-line\"><strong>${esc(item.taskId || 'task')}</strong> ${esc(item.title || '')}<div style=\"color:var(--muted);margin-top:0.15rem;\">risk ${esc(String(item.riskScore || 0))} · ${esc(item.phase || 'general')}</div></div>`).join('')
      : '<div style=\"color:var(--muted);\">No approvals pending.</div>';
  }

  const assistanceList = document.getElementById('automationAssistanceList');
  if (assistanceList) {
    const requests = Array.isArray(orchestration.assistanceRequests)
      ? orchestration.assistanceRequests
      : [];
    assistanceList.innerHTML = requests.length
      ? requests.map((item) => `<div class=\"hf-log-line\"><strong>${esc(item.taskId || 'task')}</strong> ${esc(item.title || '')}<div style=\"color:var(--muted);margin-top:0.15rem;\">${esc(item.phase || 'general')} · ${esc(item.lastError || 'assistance requested')}</div></div>`).join('')
      : '<div style=\"color:var(--muted);\">No active assistance requests.</div>';
  }
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

function startSSE(projectId) {
  if (state.sseSource) { state.sseSource.close(); state.sseSource = null; }
  if (!projectId) return;
  const src = new EventSource(`/events?projectId=${projectId}`);
  src.addEventListener('agent_message',   e => handleSSEEvent('message',        JSON.parse(e.data)));
  src.addEventListener('task_update',     e => handleSSEEvent('task',            JSON.parse(e.data)));
  src.addEventListener('heartbeat',       e => handleSSEEvent('heartbeat',       JSON.parse(e.data)));
  src.addEventListener('project_status',  e => handleSSEEvent('project_status',  JSON.parse(e.data)));
  src.addEventListener('error',           e => handleSSEEvent('error',           JSON.parse(e.data)));
  src.onerror = () => console.warn('[HiveForge] SSE connection dropped — will retry.');
  state.sseSource = src;
}

function handleSSEEvent(type, data) {
  // Append to logs
  appendLogEntry({ type, data, ts: new Date().toISOString() });
  // Trigger targeted refresh for the relevant panel
  if (type === 'task') {
    renderKanban(state.tasks = patchTask(state.tasks, data));
    if (state.activeSection === 'approvals') onSectionActivate('approvals');
  }
  if (type === 'heartbeat')      renderHeartbeatCard(data);
  if (type === 'message')        renderAgentCard(data);
  if (type === 'project_status') {
    if (state.activeProject && data.projectId === state.activeProject.id) {
      state.activeProject.status = data.status;
      const updatedProjects = state.projects.map(p => p.id === data.projectId ? { ...p, status: data.status } : p);
      state.projects = updatedProjects;
      renderSidebarProjectList(updatedProjects);
      if (state.activeSection === 'agents') onSectionActivate('agents');
      if (data.status === 'completed') showToast('\u2705 Project completed — all tasks done!', 'ok');
      if (data.status === 'failed')    showToast('\u274c Project failed — max auto-fixes reached. Use Restart Agents to retry.', 'error');
    }
  }
}

function patchTask(tasks, updated) {
  const idx = tasks.findIndex(t => t.id === updated.id);
  if (idx >= 0) { tasks[idx] = { ...tasks[idx], ...updated }; }
  else           { tasks.push(updated); }
  return [...tasks];
}

// ─── Rendering ───────────────────────────────────────────────────────────────

// Projects table
function renderProjects(projects) {
  const tbody = document.getElementById('projectsTableBody');
  renderSidebarProjectList(projects);
  if (!projects.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:2rem;">No projects yet. <a href="#" onclick="Dashboard.nav('new-project')">Create one →</a></td></tr>`;
    return;
  }
  tbody.innerHTML = projects.map(p => `
    <tr>
      <td><a href="#" onclick="Dashboard.selectProject('${p.id}')">${esc(p.name)}</a></td>
      <td>${esc(TEMPLATES[p.template]?.label ?? p.template)}</td>
      <td><span class="hf-status-badge ${p.status}">${p.status}</span></td>
      <td>${p.heartbeat ?? '—'}</td>
      <td>${p.lastActivity ? new Date(p.lastActivity).toLocaleString() : '—'}</td>
      <td>${p.agentCount ?? 0}</td>
      <td>${esc(p.currentTask ?? '—')}</td>
      <td>
        <button class="hf-btn secondary hf-btn sm" onclick="Dashboard.selectProject('${p.id}')">Open</button>
      </td>
    </tr>`).join('');
}

function renderSidebarProjectList(projects) {
  const list = document.getElementById('sidebarProjectList');
  if (!list) return;

  if (!projects.length) {
    list.innerHTML = '<div class="hf-sidebar-project-empty">No projects running yet.</div>';
    return;
  }

  const sorted = [...projects].sort((a, b) => {
    const aTs = Date.parse(a.lastActivity || '') || 0;
    const bTs = Date.parse(b.lastActivity || '') || 0;
    return bTs - aTs;
  });

  list.innerHTML = sorted.map((p) => {
    const isActive = state.activeProject?.id === p.id;
    const templateLabel = TEMPLATES[p.template]?.label ?? p.template;
    return `
      <button class="hf-sidebar-project-item ${isActive ? 'active' : ''}" onclick="Dashboard.selectProject('${p.id}')" title="Open ${esc(p.name)}">
        <span class="hf-sidebar-project-dot ${esc(p.status)}"></span>
        <span class="hf-sidebar-project-main">
          <span class="hf-sidebar-project-name">${esc(p.name)}</span>
          <span class="hf-sidebar-project-meta">${esc(templateLabel)}</span>
        </span>
      </button>
    `;
  }).join('');
}

// Agent cards
function renderAgents(agents) {
  const grid = document.getElementById('agentGrid');
  if (!agents.length) {
    grid.innerHTML = `<div class="hf-card" style="color:var(--muted);text-align:center;padding:2rem;grid-column:1/-1;">No agents in this project yet.</div>`;
    return;
  }
  grid.innerHTML = agents.map(a => agentCardHTML(a)).join('');
}

function agentCardHTML(a) {
  return `
  <div class="hf-agent-card" id="agent-${a.id}">
    <div class="hf-agent-card-header">
      <span class="hf-agent-name">${esc(a.name)}</span>
      <span class="hf-status-badge ${a.status}">${a.status}</span>
    </div>
    <div class="hf-agent-role">${esc(a.role)}</div>
    <div class="hf-agent-task">${esc(a.currentTask ?? 'Idle')}</div>
    <div class="hf-agent-stats">
      <span>Tasks done: ${a.tasksDone ?? 0}</span>
      <span>Tokens: ${a.tokens ?? '—'}</span>
    </div>
    <div class="hf-agent-log hf-log-stream" style="height:80px;font-size:0.78rem;">${
      (a.recentLog ?? []).map(l => `<div>${esc(l)}</div>`).join('') || '<span style="color:var(--muted)">No recent output.</span>'
    }</div>
  </div>`;
}

function renderAgentCard(data) {
  const el = document.getElementById(`agent-${data.agentId}`);
  if (el) el.outerHTML = agentCardHTML({ ...state.agents.find(a => a.id === data.agentId), ...data });
}

// Kanban
function renderKanban(tasks) {
  const cols = { backlog: [], inprogress: [], review: [], done: [] };
  tasks.forEach(t => { (cols[t.status] ?? cols.backlog).push(t); });
  for (const [col, items] of Object.entries(cols)) {
    const el = document.getElementById(`kanban-${col}`);
    const count = document.getElementById(`kanban-count-${col}`);
    if (!el) continue;
    count.textContent = items.length;
    el.innerHTML = items.map((t) => {
      const canApprove = t.status === 'review' && t.executionState === 'awaiting_approval';
      const approvalReason = t.pendingApproval?.reason || t.lastError || '';
      return `
      <div class="hf-kanban-card">
        <div style="font-weight:600;font-size:0.88rem;">${esc(t.title)}</div>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:0.2rem;">${esc(t.assignee ?? 'Unassigned')}</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:0.2rem;">Execution: ${esc(t.executionState ?? (t.status === 'done' ? 'done' : 'queued'))}</div>
        ${approvalReason ? `<div style="font-size:0.73rem;color:#ef4444;margin-top:0.2rem;">Needs approval: ${esc(approvalReason)}</div>` : ''}
        ${t.startedAt ? `<div style="font-size:0.74rem;color:var(--muted);margin-top:0.2rem;">Started: ${esc(new Date(t.startedAt).toLocaleTimeString())}</div>` : ''}
        ${t.lastProgressAt ? `<div style="font-size:0.74rem;color:var(--muted);margin-top:0.2rem;">Last progress: ${esc(new Date(t.lastProgressAt).toLocaleTimeString())}</div>` : ''}
        ${Number(t.retryCount || 0) > 0 ? `<div style="font-size:0.74rem;color:#b45309;margin-top:0.2rem;">Retries: ${Number(t.retryCount || 0)}</div>` : ''}
        ${t.blockedBy ? `<div style="font-size:0.75rem;color:#e87;margin-top:0.2rem;">Blocked by: ${esc(t.blockedBy)}</div>` : ''}
        ${t.lastError && Number(t.retryCount || 0) > 0 ? `<div style="font-size:0.73rem;color:#ef4444;margin-top:0.2rem;">Last error: ${esc(t.lastError)}</div>` : ''}
        ${t.lastFailedAt && Number(t.retryCount || 0) > 0 ? `<div style="font-size:0.73rem;color:var(--muted);margin-top:0.1rem;">Failed at: ${esc(new Date(t.lastFailedAt).toLocaleTimeString())}</div>` : ''}
        ${t.completedAt && t.status === 'done' ? `<div style="font-size:0.73rem;color:var(--muted);margin-top:0.1rem;">Completed: ${esc(new Date(t.completedAt).toLocaleTimeString())}</div>` : ''}
        ${canApprove ? `<div style="display:flex;gap:0.4rem;margin-top:0.5rem;"><button class="hf-btn" style="padding:0.3rem 0.55rem;font-size:0.72rem;" onclick="Dashboard.decideTaskApproval('${esc(t.id)}','approve')">Approve</button><button class="hf-btn secondary" style="padding:0.3rem 0.55rem;font-size:0.72rem;" onclick="Dashboard.decideTaskApproval('${esc(t.id)}','deny')">Deny</button></div>` : ''}
      </div>`;
    }).join('') || `<div style="color:var(--muted);font-size:0.82rem;padding:0.5rem;">Empty</div>`;
  }
}

function renderApprovals(payload) {
  const list = document.getElementById('approvalsList');
  const empty = document.getElementById('approvalsEmpty');
  const count = document.getElementById('approvalsCount');
  const queueState = document.getElementById('approvalsQueueState');
  if (!list || !empty || !count) return;

  const items = Array.isArray(payload?.items) ? payload.items : [];
  count.textContent = String(items.length);
  if (queueState) queueState.textContent = items.length ? 'Needs Review' : 'Idle';
  empty.style.display = items.length ? 'none' : 'block';
  list.style.display = items.length ? 'block' : 'none';

  if (!items.length) {
    list.innerHTML = '';
    return;
  }

  const selected = state.selectedApprovalTaskIds;
  list.innerHTML = items.map((item) => {
    const risk = item.risk || { level: 'low', score: 0 };
    const riskColor = risk.level === 'high' ? 'var(--error, #d9534f)' : risk.level === 'medium' ? '#b45309' : 'var(--ok, #5cb85c)';
    const checked = selected.has(item.taskId) ? 'checked' : '';
    const requestedAt = item.requestedAt ? new Date(item.requestedAt).toLocaleString() : 'unknown';
    return `
      <div class="hf-card" style="max-width:980px;margin-bottom:0.7rem;">
        <div style="display:flex;align-items:flex-start;gap:0.6rem;">
          <input type="checkbox" data-task-id="${esc(item.taskId)}" ${checked} onchange="Dashboard.toggleApprovalSelection('${esc(item.taskId)}', this.checked)" style="margin-top:0.2rem;" />
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:center;">
              <strong>${esc(item.title || item.taskId)}</strong>
              <span style="font-size:0.8rem;color:${riskColor};font-weight:600;">${esc(String(risk.level || 'low').toUpperCase())} (${esc(String(Number(risk.score) || 0))})</span>
            </div>
            <div style="font-size:0.78rem;color:var(--muted);margin-top:0.2rem;">Task: ${esc(item.taskId)} · Phase: ${esc(item.phase || 'general')} · Requested: ${esc(requestedAt)}</div>
            <div style="font-size:0.79rem;color:var(--text);margin-top:0.35rem;">${esc(item.reason || 'Approval required')}</div>
            <div class="hf-btn-row" style="margin-top:0.45rem;margin-bottom:0;">
              <button class="hf-btn hf-btn sm" onclick="Dashboard.decideTaskApproval('${esc(item.taskId)}','approve')">Approve</button>
              <button class="hf-btn secondary hf-btn sm" onclick="Dashboard.decideTaskApproval('${esc(item.taskId)}','deny')">Deny</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setSettingsTab(tabId) {
  const wanted = String(tabId || 'runtime').trim() || 'runtime';
  state.activeSettingsTab = wanted;
  document.querySelectorAll('[data-settings-tab-btn]').forEach((btn) => {
    const isActive = btn.getAttribute('data-settings-tab-btn') === wanted;
    btn.classList.toggle('active', isActive);
  });
  document.querySelectorAll('[data-settings-tab]').forEach((panel) => {
    const isActive = panel.getAttribute('data-settings-tab') === wanted;
    panel.style.display = isActive ? 'block' : 'none';
  });
}

function renderMessageBus(entries) {
  const stream = document.getElementById('messageBusStream');
  if (!stream) return;
  if (!entries || !entries.length) {
    stream.innerHTML = '<div style="color:var(--muted);">No message-bus entries yet.</div>';
    return;
  }
  stream.innerHTML = entries.map((e) => {
    const payload = esc(JSON.stringify(e.payload || {}));
    return `<div style="padding:0.25rem 0;border-bottom:1px solid var(--border);">
      <span style="color:var(--muted)">[${esc((e.ts || '').slice(11,19))}]</span>
      <strong>${esc(e.kind || 'message')}</strong>
      <span style="color:var(--muted)">${esc(e.from || 'unknown')} → ${esc(e.to || 'unknown')}</span>
      <div style="font-size:0.78rem;color:var(--muted);margin-top:0.1rem;">${payload}</div>
    </div>`;
  }).join('');
}

// Heartbeat card
function renderHeartbeatCard(data) {
  setText('hb-status', data?.status ?? '—');
  setText('hb-uptime', data?.uptime ?? '—');
  setText('hb-last',   data?.lastBeat ? new Date(data.lastBeat).toLocaleTimeString() : '—');
  setText('hb-fixes',  data?.autoFixCount ?? 0);
}

// Analytics KPI strip
function renderAnalytics(data) {
  const kpi = document.getElementById('analyticsKpi');
  kpi.innerHTML = KPI_LABELS.map((label, i) => `
    <div class="hf-analytics-kpi-card">
      <div class="hf-card-label">${label}</div>
      <div class="hf-card-value">${data?.kpi?.[i] ?? '—'}</div>
    </div>`).join('');

  const goals = data?.goals || {};
  const variance = data?.variance || {};
  const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
  const deadLetters = Array.isArray(data?.deadLetters) ? data.deadLetters : [];

  const weeklyTarget = document.getElementById('analyticsGoalWeeklyTasks');
  const backlogCap = document.getElementById('analyticsGoalBacklogCap');
  const spendCap = document.getElementById('analyticsGoalSpendCap');
  if (weeklyTarget) weeklyTarget.value = String(goals.weeklyTasksDoneTarget ?? 15);
  if (backlogCap) backlogCap.value = String(goals.maxBacklog ?? 10);
  if (spendCap) spendCap.value = String(goals.maxMonthlySpend ?? 500);

  setText('analyticsVarianceThroughput', `${Number(variance.weeklyTasksDone || 0) >= 0 ? '+' : ''}${Number(variance.weeklyTasksDone || 0)} tasks`);
  setText('analyticsVarianceBacklog', `${Number(variance.backlog || 0) >= 0 ? '+' : ''}${Number(variance.backlog || 0)} backlog`);
  setText('analyticsVarianceSpend', `${Number(variance.monthlySpend || 0) >= 0 ? '+' : ''}$${Number(variance.monthlySpend || 0).toFixed(2)}`);
  setText('analyticsDeadLetterCount', String(deadLetters.length));

  const weeklyPlan = document.getElementById('analyticsWeeklyPlan');
  if (weeklyPlan) {
    weeklyPlan.textContent = data?.weeklyPlan?.summary || 'Weekly KPI plan will be generated automatically on heartbeat and whenever goals are updated.';
  }

  const alertList = document.getElementById('analyticsAlerts');
  if (alertList) {
    alertList.innerHTML = alerts.length
      ? alerts.map((msg) => `<div class="hf-log-line">${esc(msg)}</div>`).join('')
      : '<div style="color:var(--muted);">No KPI alerts right now.</div>';
  }

  const deadLetterList = document.getElementById('analyticsDeadLetters');
  if (deadLetterList) {
    deadLetterList.innerHTML = deadLetters.length
      ? deadLetters.slice(0, 20).map((entry) => `<div class="hf-log-line"><strong>${esc(entry.taskId || 'task')}</strong> ${esc(entry.connector || '')}/${esc(entry.operation || '')}<div style="color:var(--muted);margin-top:0.2rem;">${esc(entry.reason || 'failed')} · retries: ${esc(String(entry.retryCount || 0))}</div></div>`).join('')
      : '<div style="color:var(--muted);">No dead-letter tasks.</div>';
  }
}

// Credential cards
function renderCredentials(creds, budgetData = null) {
  const grid = document.getElementById('credGrid');
  state.credentials = Array.isArray(creds) ? creds : [];
  renderCredentialBudgetSummary(creds, budgetData);

  const defaultSummary = (serviceId, config) => {
    if (!config || typeof config !== 'object') return '';
    if (serviceId === 'netlify') {
      const value = String(config.defaultSiteId || '').trim();
      return value ? `Default site: ${esc(value)}` : 'Default site: Not set';
    }
    if (serviceId === 'google_ads') {
      const value = String(config.defaultCustomerId || '').trim();
      return value ? `Default customer: ${esc(value)}` : 'Default customer: Not set';
    }
    if (serviceId === 'supabase') {
      const value = String(config.defaultProjectRef || '').trim();
      return value ? `Default project: ${esc(value)}` : 'Default project: Not set';
    }
    return '';
  };

  grid.innerHTML = CREDENTIAL_SERVICES.map(svc => {
    const saved = (creds ?? []).find(c => c.service === svc.id);
    const isConnected = Boolean(saved?.connected);
    const defaultNote = defaultSummary(svc.id, saved?.config);
    const budget = typeof saved?.budget === 'number' && Number.isFinite(saved.budget)
      ? `$${saved.budget.toLocaleString()}/mo`
      : 'No monthly budget set';
    return `
    <div class="hf-cred-card">
      <div class="hf-cred-icon">${svc.icon}</div>
      <div class="hf-cred-body">
        <div class="hf-cred-name">${svc.label}</div>
        <div class="hf-cred-desc">${svc.desc}</div>
        <div class="hf-cred-budget-note">${budget}</div>
        ${defaultNote ? `<div class="hf-cred-budget-note">${defaultNote}</div>` : ''}
      </div>
      <div class="hf-cred-status">
        ${isConnected ? `<span class="hf-status-badge ok">Connected</span>` : `<span class="hf-status-badge idle">Not set</span>`}
      </div>
    </div>`;
  }).join('');

  const netlifySaved = state.credentials.find((entry) => entry.service === 'netlify');
  const netlifySiteId = String(netlifySaved?.config?.defaultSiteId || '').trim();
  const deploySiteInput = document.getElementById('netlifyDeploySiteId');
  if (deploySiteInput && !deploySiteInput.value.trim() && netlifySiteId) {
    deploySiteInput.value = netlifySiteId;
  }
}

function renderCredentialBudgetSummary(creds = [], budgetData = null) {
  const totalEl = document.getElementById('credBudgetTotal');
  const projectSpendEl = document.getElementById('credProjectSpendTotal');
  const connectedEl = document.getElementById('credConnectedCount');
  const listEl = document.getElementById('credBudgetSummaryList');
  if (!totalEl || !projectSpendEl || !connectedEl || !listEl) return;

  const budgetEntries = Array.isArray(budgetData?.services) ? budgetData.services : [];

  const normalized = CREDENTIAL_SERVICES.map((svc) => {
    const saved = (creds ?? []).find((entry) => entry.service === svc.id) || null;
    const budget = budgetEntries.find((entry) => entry.service === svc.id) || null;
    return {
      ...svc,
      connected: Boolean(saved?.connected),
      budget: typeof saved?.budget === 'number' && Number.isFinite(saved.budget) ? saved.budget : null,
      monthlySpent: typeof budget?.monthlySpent === 'number' ? budget.monthlySpent : 0,
      monthlyCap: typeof budget?.monthlyCap === 'number' ? budget.monthlyCap : null,
      enabled: typeof budget?.enabled === 'boolean' ? budget.enabled : true,
    };
  });

  const totalBudget = normalized.reduce((sum, svc) => sum + (svc.budget || 0), 0);
  const totalSpend = normalized.reduce((sum, svc) => sum + (svc.monthlySpent || 0), 0);
  const connectedCount = normalized.filter((svc) => svc.connected).length;

  totalEl.textContent = totalBudget ? `$${totalBudget.toLocaleString()}` : '$0';
  projectSpendEl.textContent = totalSpend ? `$${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0';
  connectedEl.textContent = `${connectedCount}/${normalized.length}`;
  listEl.innerHTML = normalized.map((svc) => `
    <div class="hf-cred-summary-row">
      <div>
        <div class="hf-cred-summary-name">${svc.icon} ${svc.label}</div>
        <div class="hf-cred-summary-meta">${svc.connected ? 'Connected' : 'Not set'}${svc.enabled ? '' : ' · blocked for project'}</div>
      </div>
      <div class="hf-cred-summary-value">${svc.monthlySpent ? `$${svc.monthlySpent.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0'}${svc.monthlyCap !== null ? ` / $${svc.monthlyCap.toLocaleString()}` : (svc.budget !== null ? ` / $${svc.budget.toLocaleString()}` : '')}</div>
    </div>
  `).join('');
}

function renderConnectorBootstrapResult(result = null) {
  const resultEl = document.getElementById('credBootstrapResult');
  const selectEl = document.getElementById('credBootstrapSelection');
  if (!resultEl || !selectEl) return;

  if (!result || !Array.isArray(result.candidates)) {
    resultEl.textContent = 'Pick a service and run discovery.';
    selectEl.innerHTML = '<option value="">Run discovery first...</option>';
    return;
  }

  const candidates = result.candidates;
  const selectedId = String(result.selectedId || '').trim();
  const selectedFromList = selectedId && candidates.some((entry) => String(entry.id || '').trim() === selectedId)
    ? selectedId
    : '';
  selectEl.innerHTML = candidates.length
    ? candidates.map((entry) => {
      const id = String(entry.id || '').trim();
      const label = String(entry.label || id || 'target').trim();
      const suffix = entry.description ? ` — ${String(entry.description)}` : '';
      const selectedAttr = selectedFromList && selectedFromList === id ? ' selected' : '';
      return `<option value="${esc(id)}"${selectedAttr}>${esc(label + suffix)}</option>`;
    }).join('')
    : '<option value="">No targets discovered</option>';

  const lines = [
    result.message || `Discovered ${candidates.length} target${candidates.length === 1 ? '' : 's'}.`,
  ];
  if (result.autoSelected && selectedId) {
    lines.push(`Auto-selected ${selectedId} because only one target is available.`);
  } else if (selectedId) {
    lines.push(`Current default: ${selectedId}.`);
  }
  resultEl.textContent = lines.join(' ');
}

function renderProjectCredentialPolicy(data) {
  const empty = document.getElementById('credentialPolicyEmpty');
  const panel = document.getElementById('credentialPolicyPanel');
  const summary = document.getElementById('credentialPolicySummary');
  state.credentialPolicies = Array.isArray(data?.services) ? data.services : [];

  if (!state.activeProject) {
    if (empty) empty.style.display = 'block';
    if (panel) panel.style.display = 'none';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (panel) panel.style.display = 'block';
  if (summary) {
    summary.innerHTML = state.credentialPolicies.map((policy) => {
      const label = CREDENTIAL_SERVICES.find((svc) => svc.id === policy.service)?.label || policy.service;
      const cap = typeof policy.monthlyCap === 'number' ? `$${policy.monthlyCap.toLocaleString()}/mo` : 'No cap';
      return `
        <div class="hf-cred-summary-row">
          <div>
            <div class="hf-cred-summary-name">${esc(label)}</div>
            <div class="hf-cred-summary-meta">${policy.enabled ? 'Enabled' : 'Blocked'} for this project</div>
          </div>
          <div class="hf-cred-summary-value">${cap}</div>
        </div>
      `;
    }).join('');
  }

  syncProjectCredentialPolicyForm();
}

function renderCredentialAudit(entries = null) {
  const empty = document.getElementById('credentialAuditEmpty');
  const stream = document.getElementById('credentialAuditStream');
  const items = Array.isArray(entries) ? entries : [];
  if (!state.activeProject) {
    if (empty) empty.style.display = 'block';
    if (stream) stream.style.display = 'none';
    return;
  }
  if (!stream || !empty) return;
  empty.style.display = items.length ? 'none' : 'block';
  stream.style.display = items.length ? 'block' : 'none';
  stream.innerHTML = items.length ? items.map((entry) => {
    const decisionClass = entry.decision === 'allow' ? 'ok' : entry.decision === 'deny' ? 'error' : 'idle';
    const cost = typeof entry.cost === 'number' && entry.cost > 0 ? ` · cost $${entry.cost}` : '';
    const service = entry.service || 'credential';
    const operation = entry.operation ? `/${entry.operation}` : '';
    return `
      <div class="hf-log-line">
        <span class="hf-log-ts">${esc((entry.ts || '').replace('T', ' ').slice(0, 19))}</span>
        <span class="hf-status-badge ${decisionClass}">${esc(entry.decision || entry.action || 'event')}</span>
        <strong>${esc(service)}${esc(operation)}</strong>
        <div style="color:var(--muted);margin-top:0.2rem;">${esc(entry.reason || entry.action || 'Credential event')}${esc(cost)}</div>
      </div>
    `;
  }).join('') : '';
}

function syncProjectCredentialPolicyForm() {
  const service = document.getElementById('credentialPolicyService')?.value || 'netlify';
  const policy = state.credentialPolicies.find((entry) => entry.service === service) || { enabled: true, monthlyCap: null };
  const enabledInput = document.getElementById('credentialPolicyEnabled');
  const capInput = document.getElementById('credentialPolicyMonthlyCap');
  if (enabledInput) enabledInput.checked = Boolean(policy.enabled);
  if (capInput) capInput.value = typeof policy.monthlyCap === 'number' ? String(policy.monthlyCap) : '';
}

function renderConnectorGuidance(result = null, fallbackConnector = '') {
  const panel = document.getElementById('connectorCheckHint');
  const text = document.getElementById('connectorCheckHintText');
  const openBtn = document.getElementById('connectorHintOpenSite');
  const credBtn = document.getElementById('connectorHintGoCredentials');
  if (!panel || !text || !openBtn || !credBtn) return;

  if (!result || result.ok) {
    panel.style.display = 'none';
    panel.dataset.connector = '';
    panel.dataset.service = '';
    return;
  }

  const connector = String(result.connector || fallbackConnector || '').trim().toLowerCase();
  const checks = Array.isArray(result.checks) ? result.checks : [];
  const missingCredential = checks.find((entry) => entry && entry.type === 'credential' && !entry.ok);
  const disabledByPolicy = checks.find((entry) => entry && entry.type === 'project_policy' && !entry.ok);
  const service = String((missingCredential && missingCredential.target) || connector || '').trim().toLowerCase();
  const website = CONNECTOR_WEBSITES[service] || CONNECTOR_WEBSITES[connector] || '';

  panel.style.display = 'block';
  panel.dataset.connector = connector;
  panel.dataset.service = service;

  if (missingCredential) {
    text.textContent = `This connector is blocked because ${service || connector} is not connected yet. Open the provider site to create/get a token, then paste it in Credentials.`;
    credBtn.textContent = 'Open Credentials';
  } else if (disabledByPolicy) {
    text.textContent = `This connector is blocked by project policy. Open Credentials to enable the service in Project Credential Policy.`;
    credBtn.textContent = 'Open Credential Policy';
  } else {
    text.textContent = result.reason || 'Connector was denied by policy checks.';
    credBtn.textContent = 'Open Credentials';
  }

  openBtn.style.display = website ? 'inline-flex' : 'none';
}

function renderPlatformConnections(connections = {}) {
  const container = document.getElementById('platformConnections');
  if (!container) return;
  container.innerHTML = PLATFORM_CONNECTIONS.map((it) => {
    const isConnected = Boolean(connections[it.id]);
    return `
    <div class="hf-platform-row">
      <div class="hf-platform-meta">
        <div class="hf-platform-title">${it.label}</div>
        <div class="hf-platform-note">${it.note}</div>
      </div>
      <div class="hf-platform-actions">
        <span class="hf-status-badge ${isConnected ? 'ok' : 'idle'}">${isConnected ? 'Connected' : 'Not connected'}</span>
        <button class="hf-btn secondary hf-btn sm" onclick="Dashboard.openPlatformLogin('${it.id}')">Open Login</button>
        <button class="hf-btn secondary hf-btn sm" onclick="Dashboard.markPlatformDisconnected('${it.id}')">How to Clear</button>
      </div>
    </div>`;
  }).join('');
}

// Log stream
function appendLogEntry(entry) {
  const normalized = normalizeLogEntry(entry);
  state.logs.unshift(normalized);
  if (state.logs.length > 500) state.logs.length = 500;
  if (state.activeSection === 'logs') renderLogs(state.logs, document.getElementById('logsFilter').value);
  if (state.activeSection === 'heartbeat' && normalized.type === 'heartbeat') {
    const log = document.getElementById('heartbeatLog');
    const line = document.createElement('div');
    line.textContent = `[${normalized.ts.slice(11,19)}] ${JSON.stringify(normalized.data)}`;
    log.prepend(line);
  }
}

function normalizeLogEntry(entry) {
  const out = {
    ts: entry?.ts || new Date().toISOString(),
    type: entry?.type || 'message',
    data: entry?.data || {},
  };

  const payload = out.data || {};
  const kind = String(payload.kind || payload.event || '').toLowerCase();
  const hasDecision = typeof payload.approved === 'boolean' || typeof payload.decision === 'string' || typeof payload.error_code === 'string';
  const isPolicyKind = kind === 'skill_response' || kind === 'browser_response' || kind === 'credential_response';

  if (hasDecision || isPolicyKind) {
    const decision = String(payload.decision || (payload.approved === true ? 'allow' : payload.approved === false ? 'deny' : '')).toLowerCase();
    out.type = decision === 'allow' || payload.approved === true ? 'policy_allow' : 'policy_deny';
  }

  return out;
}

function formatLogLine(entry) {
  const payload = entry.data || {};

  if (entry.type === 'policy_allow' || entry.type === 'policy_deny') {
    const subject = payload.skill_name || payload.service || payload.action || payload.kind || 'policy check';
    const operation = payload.operation ? ` (${payload.operation})` : '';
    const reason = payload.reason || payload.error_message || payload.policy_reason || (entry.type === 'policy_allow' ? 'Allowed by coordinator policy' : 'Denied by coordinator policy');
    return `${subject}${operation} — ${reason}`;
  }

  return JSON.stringify(payload);
}

function renderLogs(logs, filter = 'all') {
  const stream = document.getElementById('logsStream');
  renderPolicyDecisionKpis(logs);
  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter);
  if (!filtered.length) {
    stream.innerHTML = `<div style="color:var(--muted);">No log entries${filter !== 'all' ? ' for this filter' : ''} yet.</div>`;
    return;
  }
  stream.innerHTML = filtered.map(l => {
    const icon = { message:'💬', task:'✅', deploy:'🚀', error:'❌', fix:'🔧', heartbeat:'💓', policy_allow:'🛡️', policy_deny:'⛔' }[l.type] ?? '•';
    return `<div><span style="color:var(--muted)">[${l.ts.slice(11,19)}]</span> ${icon} ${esc(formatLogLine(l))}</div>`;
  }).join('');
}

function renderPolicyDecisionKpis(logs) {
  const allowCount = logs.filter(l => l.type === 'policy_allow').length;
  const denyCount = logs.filter(l => l.type === 'policy_deny').length;
  const total = allowCount + denyCount;

  setText('policyAllowCount', allowCount);
  setText('policyDenyCount', denyCount);
  setText('policyTotalCount', total);
}

// Marketplace
function renderMarketplace(filter = { division: 'All', query: '' }) {
  // Division pills
  const divsEl = document.getElementById('marketplaceDivisions');
  divsEl.innerHTML = DIVISIONS.map(d => `
    <button class="hf-div-pill ${d === filter.division ? 'active' : ''}" onclick="Dashboard.setDivision('${d}')">${d}</button>`
  ).join('');

  // Agent cards
  const q = filter.query.toLowerCase();
  const visible = MARKETPLACE_AGENTS.filter(a =>
    (filter.division === 'All' || a.division === filter.division) &&
    (!q || a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q))
  );
  const grid = document.getElementById('marketplaceGrid');
  if (!visible.length) {
    grid.innerHTML = `<div style="color:var(--muted);grid-column:1/-1;text-align:center;padding:2rem;">No agents match this search.</div>`;
    return;
  }
  grid.innerHTML = visible.map(a => `
    <div class="hf-mp-card">
      <div class="hf-mp-card-header">
        <span class="hf-mp-name">${esc(a.name)}</span>
        ${a.recommended ? `<span class="hf-badge">Recommended</span>` : ''}
      </div>
      <div class="hf-mp-division">${a.division}</div>
      <div class="hf-mp-desc">${esc(a.desc)}</div>
      <div style="margin-top:auto;padding-top:0.65rem;">
        <button class="hf-btn hf-btn sm" onclick="Dashboard.addAgent('${a.id}')">+ Add to Project</button>
      </div>
    </div>`).join('');
}

// New project agent preview
function renderAgentPreview(templateKey) {
  const tpl = TEMPLATES[templateKey];
  if (!tpl) return;
  const el = document.getElementById('newProjectAgentPreview');
  el.style.display = 'block';
  const summary = tpl.summary ? `<div style="color:var(--muted);margin-bottom:0.5rem;">${esc(tpl.summary)}</div>` : '';
  const bullets = Array.isArray(tpl.bullets) && tpl.bullets.length
    ? `<ul style="margin:0 0 0.65rem 1rem;color:var(--muted);">${tpl.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
    : '';
  el.innerHTML = `
    <div class="hf-card" style="max-width:700px;">
      <div style="font-weight:600;margin-bottom:0.5rem;">Default roster for <em>${tpl.label}</em>:</div>
      ${summary}
      ${bullets}
      <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
        ${tpl.roster.map(r => `<span class="hf-badge" style="background:var(--accent);color:#fff;">${r}</span>`).join('')}
      </div>
    </div>`;
}

function formatFileSize(size) {
  const value = Number(size || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function renderWorkspaceDirectory(data) {
  const tree = document.getElementById('workspaceTree');
  if (!tree) return;
  const currentPath = String(data?.path || '');
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  state.workspacePath = currentPath;
  const parentPath = currentPath ? currentPath.split('/').slice(0, -1).join('/') : '';

  const header = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
      <div style="color:var(--muted);">${currentPath ? `/${esc(currentPath)}` : '/'} </div>
      <div style="display:flex;gap:0.35rem;">
        ${currentPath ? `<button class="hf-btn secondary hf-btn sm" onclick="Dashboard.openWorkspacePath('${jsq(parentPath)}')">Up</button>` : ''}
        <button class="hf-btn secondary hf-btn sm" onclick="Dashboard.refreshWorkspace()">Refresh</button>
      </div>
    </div>`;

  if (!entries.length) {
    tree.innerHTML = `${header}<div style="color:var(--muted);">No files generated for this path yet.</div>`;
    return;
  }

  tree.innerHTML = `${header}${entries.map((entry) => `
    <button class="hf-card" style="display:flex;width:100%;text-align:left;align-items:center;justify-content:space-between;padding:0.55rem 0.7rem;margin-bottom:0.45rem;background:var(--panel-bg);border:1px solid var(--border);cursor:pointer;" onclick="${entry.type === 'dir' ? `Dashboard.openWorkspacePath('${jsq(entry.path)}')` : `Dashboard.previewWorkspaceFile('${jsq(entry.path)}')`}">
      <span>
        <span style="margin-right:0.45rem;">${entry.type === 'dir' ? '📁' : '📄'}</span>
        <span style="font-weight:600;">${esc(entry.name)}</span>
      </span>
      <span style="font-size:0.78rem;color:var(--muted);">${entry.type === 'dir' ? 'Folder' : esc(formatFileSize(entry.size))}</span>
    </button>
  `).join('')}`;
}

function renderWorkspacePreview(data) {
  const preview = document.getElementById('workspacePreview');
  if (!preview) return;
  if (!data) {
    preview.textContent = 'Select a file to preview.';
    return;
  }
  preview.textContent = String(data.content || '').trim() || 'File is empty.';
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function activateSection(id) {
  document.querySelectorAll('.hf-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.hf-nav-btn').forEach(btn => btn.classList.remove('active'));
  const section = document.getElementById(id);
  if (section) section.classList.add('active');
  const btn = document.querySelector(`.hf-nav-btn[data-section="${id}"]`);
  if (btn) btn.classList.add('active');
  setText('topbarTitle', SECTION_TITLES[id] ?? id);
  state.activeSection = id;
  onSectionActivate(id);
}

async function onSectionActivate(id) {
  if (state.messageBusPoller) {
    clearInterval(state.messageBusPoller);
    state.messageBusPoller = null;
  }
  state.projects = await fetchProjects();
  renderSidebarProjectList(state.projects);
  if (state.activeProject?.id) {
    const refreshed = state.projects.find((p) => p.id === state.activeProject.id);
    if (refreshed) {
      state.activeProject = refreshed;
      setText('activeProjectName', refreshed.name);
    }
  }

  const pid = state.activeProject?.id;
  switch (id) {
    case 'projects':    renderProjects(state.projects); break;
    case 'agents':      if (pid) renderAgents(state.agents = await fetchAgents(pid)); break;
    case 'kanban':      if (pid) renderKanban(state.tasks = await fetchTasks(pid)); break;
    case 'approvals': {
      if (pid) {
        const { sortBy, direction, minRisk } = state.approvalsFilter;
        const sortByEl = document.getElementById('approvalsSortBy');
        const directionEl = document.getElementById('approvalsSortDirection');
        const minRiskEl = document.getElementById('approvalsMinRisk');
        if (sortByEl) sortByEl.value = sortBy;
        if (directionEl) directionEl.value = direction;
        if (minRiskEl) minRiskEl.value = minRisk;
        renderApprovals(await fetchApprovals(pid, sortBy, direction, minRisk));
      }
      break;
    }
    case 'workspace': {
      if (pid) {
        try {
          const listing = await fetchWorkspace(pid, state.workspacePath || '');
          renderWorkspaceDirectory(listing);
          const preferredFile = (listing.entries || []).find((entry) => entry.type === 'file' && entry.name === 'project_brief.md')
            || (listing.entries || []).find((entry) => entry.type === 'file');
          if (preferredFile) {
            renderWorkspacePreview(await fetchWorkspaceFile(pid, preferredFile.path));
          } else {
            renderWorkspacePreview(null);
          }
        } catch (err) {
          const tree = document.getElementById('workspaceTree');
          if (tree) tree.innerHTML = `<div style="color:var(--error,#d9534f);">${esc(err.message)}</div>`;
          renderWorkspacePreview({ content: 'Workspace preview unavailable.' });
        }
      }
      break;
    }
    case 'heartbeat':   if (pid) renderHeartbeatCard(await fetchHeartbeat(pid)); break;
    case 'credentials': {
      {
        const creds = await fetchCredentials();
        const budget = pid ? await fetchCredentialBudget(pid) : null;
        const policy = pid ? await fetchCredentialPolicy(pid) : null;
        const audit = pid ? await fetchCredentialAudit(pid) : [];
        renderCredentials(creds, budget);
        Dashboard.refreshConnectorBootstrapView();
        renderPlatformConnections(await fetchIntegrations());
        renderProjectCredentialPolicy(policy);
        renderCredentialAudit(audit);
      }
      break;
    }
    case 'analytics':   renderAnalytics(pid ? await fetchAnalytics(pid) : null); break;
    case 'logs':        if (pid) renderLogs(state.logs = await fetchLogs(pid)); break;
    case 'message-bus': {
      state.messageBus = await fetchMessageBus(pid, 300, state.messageBusFilter);
      renderMessageBus(state.messageBus);
      state.messageBusPoller = setInterval(async () => {
        if (state.activeSection !== 'message-bus') return;
        state.messageBus = await fetchMessageBus(state.activeProject?.id, 300, state.messageBusFilter);
        renderMessageBus(state.messageBus);
      }, 5000);
      break;
    }
    case 'marketplace': renderMarketplace(state.marketplaceFilter); break;
    case 'settings': {
      renderSettings(await fetchSettings());
      renderProjectAutomation(pid ? await fetchProjectSettings(pid) : null);
      setSettingsTab(state.activeSettingsTab || 'runtime');
      setText('connectorCheckOutput', 'No connector check has been run yet.');
      break;
    }
  }
}

// ─── LLM Health Pill ─────────────────────────────────────────────────────────

async function checkLLMHealth() {
  try {
    const res = await fetch('/api/llm_health');
    const data = await res.json();
    const ok = data?.status === 'ok';
    const model = String(data?.model || '').trim();
    document.getElementById('llmDot').className  = 'hf-dot ' + (ok ? 'ok' : 'error');
    document.getElementById('llmLabel').textContent = ok
      ? (model && model.toLowerCase() !== 'connected' ? `LM Studio (${model})` : 'LM Studio Connected')
      : 'LLM Offline';
  } catch {
    document.getElementById('llmDot').className = 'hf-dot error';
    document.getElementById('llmLabel').textContent = 'LLM Offline';
  }
}

// ─── Public API (called from HTML onclick) ────────────────────────────────────

const Dashboard = {

  nav(id) { activateSection(id); },

  setSettingsTab(tabId) {
    setSettingsTab(tabId);
  },

  selectProject(id) {
    state.activeProject = state.projects.find(p => p.id === id) ?? { id };
    document.getElementById('activeProjectPill').style.display = 'flex';
    setText('activeProjectName', state.activeProject.name ?? id);
    state.workspacePath = '';
    renderSidebarProjectList(state.projects);
    startSSE(id);
    activateSection('agents');
  },

  async createProject() {
    const name     = document.getElementById('newProjectName').value.trim();
    const template = document.getElementById('newProjectTemplate').value;
    const goal     = document.getElementById('newProjectGoal').value.trim();
    const status   = document.getElementById('createProjectStatus');

    if (!name || !template) { showStatus(status, 'Please fill in name and template.', 'error'); return; }
    showStatus(status, 'Creating…', 'running');

    try {
      const project = await apiFetch(API.projects, {
        method: 'POST',
        body: JSON.stringify({ name, template, goal }),
      });
      const projects = await fetchProjects();
      state.projects = projects;
      renderSidebarProjectList(state.projects);
      showStatus(status, 'Created!', 'ok');
      setTimeout(() => Dashboard.selectProject(project.id), 800);
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
    }
  },

  refreshProjects() { onSectionActivate('projects'); },
  refreshAgents()   { onSectionActivate('agents');   },
  refreshApprovals(){ onSectionActivate('approvals');},
  refreshWorkspace(){ onSectionActivate('workspace'); },
  refreshHeartbeat(){ onSectionActivate('heartbeat');},
  refreshLogs()     { onSectionActivate('logs');     },
  refreshMessageBus(){ onSectionActivate('message-bus'); },
  filterMessageBus() {
    state.messageBusFilter.kind = document.getElementById('messageBusKind')?.value || '';
    state.messageBusFilter.actor = document.getElementById('messageBusActor')?.value?.trim() || '';
    state.messageBusFilter.q = document.getElementById('messageBusSearch')?.value?.trim() || '';
    onSectionActivate('message-bus');
  },
  filterLogs()      {
    const f = document.getElementById('logsFilter').value;
    renderLogs(state.logs, f);
  },

  filterMarketplace() {
    state.marketplaceFilter.query = document.getElementById('marketplaceSearch').value;
    renderMarketplace(state.marketplaceFilter);
  },

  setApprovalSort() {
    state.approvalsFilter.sortBy = document.getElementById('approvalsSortBy')?.value || 'risk';
    state.approvalsFilter.direction = document.getElementById('approvalsSortDirection')?.value || 'desc';
    state.approvalsFilter.minRisk = document.getElementById('approvalsMinRisk')?.value || state.approvalsFilter.minRisk || 'all';
    if (state.activeSection === 'approvals') onSectionActivate('approvals');
  },

  setApprovalQuickFilter(minRisk, sortBy = 'risk', direction = 'desc') {
    state.approvalsFilter.minRisk = String(minRisk || 'all');
    state.approvalsFilter.sortBy = String(sortBy || 'risk');
    state.approvalsFilter.direction = String(direction || 'desc');
    const minRiskEl = document.getElementById('approvalsMinRisk');
    const sortByEl = document.getElementById('approvalsSortBy');
    const directionEl = document.getElementById('approvalsSortDirection');
    if (minRiskEl) minRiskEl.value = state.approvalsFilter.minRisk;
    if (sortByEl) sortByEl.value = state.approvalsFilter.sortBy;
    if (directionEl) directionEl.value = state.approvalsFilter.direction;
    if (state.activeSection === 'approvals') onSectionActivate('approvals');
  },

  toggleApprovalSelection(taskId, checked) {
    if (!taskId) return;
    if (checked) state.selectedApprovalTaskIds.add(taskId);
    else state.selectedApprovalTaskIds.delete(taskId);
    const selectedCount = document.getElementById('approvalsSelectedCount');
    if (selectedCount) selectedCount.textContent = String(state.selectedApprovalTaskIds.size);
  },

  toggleAllApprovals(checked) {
    const boxes = document.querySelectorAll('#approvalsList input[type="checkbox"]');
    boxes.forEach((box) => {
      box.checked = Boolean(checked);
      const taskId = String(box.getAttribute('data-task-id') || '').trim();
      if (!taskId) return;
      if (checked) state.selectedApprovalTaskIds.add(taskId);
      else state.selectedApprovalTaskIds.delete(taskId);
    });
    const selectedCount = document.getElementById('approvalsSelectedCount');
    if (selectedCount) selectedCount.textContent = String(state.selectedApprovalTaskIds.size);
  },

  async decideSelectedApprovals(decision) {
    if (!state.activeProject) {
      showToast('No active project selected.', 'error');
      return;
    }
    const taskIds = Array.from(state.selectedApprovalTaskIds);
    if (!taskIds.length) {
      showToast('Select at least one approval item.', 'info');
      return;
    }
    const normalized = String(decision || '').toLowerCase();
    if (normalized !== 'approve' && normalized !== 'deny') return;
    const note = normalized === 'deny'
      ? (window.prompt('Optional deny reason for selected tasks:', '') || '').trim()
      : '';
    try {
      const result = await apiFetch(API.taskApprovalBatch, {
        method: 'POST',
        body: JSON.stringify({
          projectId: state.activeProject.id,
          taskIds,
          decision: normalized,
          note,
        }),
      });
      state.selectedApprovalTaskIds.clear();
      const selectedCount = document.getElementById('approvalsSelectedCount');
      if (selectedCount) selectedCount.textContent = '0';
      showToast(`Batch ${normalized} complete: ${result.successCount} ok, ${result.failureCount} failed.`, result.failureCount ? 'info' : 'ok');
      if (state.activeSection === 'approvals') onSectionActivate('approvals');
      if (state.activeSection === 'kanban') onSectionActivate('kanban');
    } catch (err) {
      showToast(`Batch approval failed: ${err.message}`, 'error');
    }
  },

  async testRetryPolicy(connector) {
    const normalized = String(connector || '').trim().toLowerCase();
    if (!normalized) return;
    const reason = (window.prompt(`Optional simulated failure reason for ${normalized}:`, 'HTTP 503 timeout') || '').trim();
    try {
      const result = await apiFetch(API.retryPolicyTest, {
        method: 'POST',
        body: JSON.stringify({ connector: normalized, reason }),
      });
      const lines = (result.attempts || []).map((entry) => {
        const delay = Number(entry.delayMs || 0);
        return `Attempt ${entry.attempt}: retryable=${entry.retryable ? 'yes' : 'no'}, delay=${Math.round(delay / 1000)}s`;
      });
      showToast(`${normalized} policy: ${lines.slice(0, 2).join(' | ')}${lines.length > 2 ? ' ...' : ''}`, 'info');
    } catch (err) {
      showToast(`Retry policy test failed: ${err.message}`, 'error');
    }
  },

  setDivision(div) {
    state.marketplaceFilter.division = div;
    renderMarketplace(state.marketplaceFilter);
  },

  async addAgent(agentId) {
    if (!state.projects.length) { showToast('No projects yet — create one first.', 'error'); return; }
    if (state.projects.length === 1) { await doAddAgent(agentId, state.projects[0].id); return; }
    showAddAgentPicker(agentId);
  },

  async confirmAddAgent(projectId) {
    const agentId = state._pendingAddAgentId;
    closeAddAgentModal();
    if (agentId && projectId) await doAddAgent(agentId, projectId);
  },

  closeAddAgentModal() { closeAddAgentModal(); },

  updateCredServiceGuide() {
    const service = document.getElementById('credService').value;
    const guide   = document.getElementById('credServiceGuide');
    const netlifySiteIdInput = document.getElementById('credNetlifySiteId');
    const googleAdsCustomerInput = document.getElementById('credGoogleAdsCustomerId');
    const supabaseProjectInput = document.getElementById('credSupabaseProjectRef');
    const netlifySaved = state.credentials.find((entry) => entry.service === 'netlify');
    const googleAdsSaved = state.credentials.find((entry) => entry.service === 'google_ads');
    const supabaseSaved = state.credentials.find((entry) => entry.service === 'supabase');
    const savedDefaultSiteId = String(netlifySaved?.config?.defaultSiteId || '').trim();
    const savedDefaultCustomerId = String(googleAdsSaved?.config?.defaultCustomerId || '').trim();
    const savedDefaultProjectRef = String(supabaseSaved?.config?.defaultProjectRef || '').trim();
    if (!guide) return;
    const url   = CONNECTOR_WEBSITES[service];
    const label = SERVICE_LABELS[service];
    const details = SERVICE_TOKEN_GUIDES[service];
    if (url && label) {
      const where = details?.where ? `Where: ${details.where}` : '';
      const what  = details?.what ? `Paste: ${details.what}` : '';
      guide.innerHTML = [
        `Need a token? <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Get your ${label} API token →</a>`,
        where,
        what,
      ].filter(Boolean).join('<br>');
      guide.style.display = '';
    } else {
      guide.style.display = 'none';
      guide.innerHTML = '';
    }
    if (netlifySiteIdInput) {
      if (service === 'netlify') {
        netlifySiteIdInput.style.display = '';
        if (!netlifySiteIdInput.value.trim()) {
          netlifySiteIdInput.value = savedDefaultSiteId;
        }
      } else {
        netlifySiteIdInput.style.display = 'none';
      }
    }
    if (googleAdsCustomerInput) {
      if (service === 'google_ads') {
        googleAdsCustomerInput.style.display = '';
        if (!googleAdsCustomerInput.value.trim()) {
          googleAdsCustomerInput.value = savedDefaultCustomerId;
        }
      } else {
        googleAdsCustomerInput.style.display = 'none';
      }
    }
    if (supabaseProjectInput) {
      if (service === 'supabase') {
        supabaseProjectInput.style.display = '';
        if (!supabaseProjectInput.value.trim()) {
          supabaseProjectInput.value = savedDefaultProjectRef;
        }
      } else {
        supabaseProjectInput.style.display = 'none';
      }
    }
  },

  async saveCred() {
    const service = document.getElementById('credService').value;
    const token   = document.getElementById('credToken').value.trim();
    const netlifySiteId = document.getElementById('credNetlifySiteId')?.value.trim() || '';
    const defaultCustomerId = document.getElementById('credGoogleAdsCustomerId')?.value.trim() || '';
    const defaultProjectRef = document.getElementById('credSupabaseProjectRef')?.value.trim() || '';
    const budget  = document.getElementById('credBudget').value;
    const status  = document.getElementById('credStatus');
    const existing = state.credentials.find((entry) => entry.service === service);
    const canUpdateWithoutToken = Boolean(existing?.connected);
    if (!service) { showStatus(status, 'Select a service first.', 'error'); return; }
    if (!token && !canUpdateWithoutToken) { showStatus(status, 'Token is required for first-time setup.', 'error'); return; }
    showStatus(status, 'Saving…', 'running');
    try {
      await apiFetch(API.credentials, {
        method: 'POST',
        body: JSON.stringify({
          service,
          token,
          budget: budget ? Number(budget) : null,
          defaultSiteId: service === 'netlify' ? netlifySiteId : undefined,
          defaultCustomerId: service === 'google_ads' ? defaultCustomerId : undefined,
          defaultProjectRef: service === 'supabase' ? defaultProjectRef : undefined,
        }),
      });
      document.getElementById('credToken').value   = '';
      document.getElementById('credBudget').value  = '';
      const netlifySiteInput = document.getElementById('credNetlifySiteId');
      if (netlifySiteInput && service !== 'netlify') {
        netlifySiteInput.value = '';
      }
      const googleAdsInput = document.getElementById('credGoogleAdsCustomerId');
      if (googleAdsInput && service !== 'google_ads') {
        googleAdsInput.value = '';
      }
      const supabaseInput = document.getElementById('credSupabaseProjectRef');
      if (supabaseInput && service !== 'supabase') {
        supabaseInput.value = '';
      }
      document.getElementById('credService').value = '';
      Dashboard.updateCredServiceGuide();
      showStatus(status, 'Saved!', 'ok');
      onSectionActivate('credentials');
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
    }
  },

  refreshConnectorBootstrapView() {
    const status = document.getElementById('credBootstrapStatus');
    const resultEl = document.getElementById('credBootstrapResult');
    const selectEl = document.getElementById('credBootstrapSelection');
    if (status) status.style.display = 'none';
    if (resultEl) {
      const service = String(document.getElementById('credBootstrapService')?.value || 'netlify').trim();
      const label = CONNECTOR_BOOTSTRAP_LABELS[service] || service;
      resultEl.textContent = `Pick Discover Targets to load ${label} IDs.`;
    }
    if (selectEl) {
      selectEl.innerHTML = '<option value="">Run discovery first...</option>';
    }
  },

  async discoverConnectorBootstrap() {
    const service = String(document.getElementById('credBootstrapService')?.value || '').trim();
    const status = document.getElementById('credBootstrapStatus');
    if (!service) {
      showStatus(status, 'Select a service.', 'error');
      return;
    }
    showStatus(status, 'Discovering...', 'running');
    try {
      const result = await fetchConnectorBootstrap(service);
      renderConnectorBootstrapResult(result);
      showStatus(status, result.autoSelected ? 'Discovered and auto-selected.' : 'Discovery complete.', 'ok');
      if (state.activeProject?.id) {
        renderCredentials(await fetchCredentials(), await fetchCredentialBudget(state.activeProject.id));
      } else {
        renderCredentials(await fetchCredentials(), null);
      }
      const inputMap = {
        netlify: 'credNetlifySiteId',
        google_ads: 'credGoogleAdsCustomerId',
        supabase: 'credSupabaseProjectRef',
      };
      const inputId = inputMap[service];
      const input = inputId ? document.getElementById(inputId) : null;
      if (input && result.selectedId) {
        input.value = String(result.selectedId);
      }
    } catch (err) {
      showStatus(status, `Discovery failed: ${err.message}`, 'error');
      renderConnectorBootstrapResult(null);
    }
  },

  async applyConnectorBootstrapSelection() {
    const service = String(document.getElementById('credBootstrapService')?.value || '').trim();
    const selectedId = String(document.getElementById('credBootstrapSelection')?.value || '').trim();
    const status = document.getElementById('credBootstrapStatus');
    if (!service) {
      showStatus(status, 'Select a service.', 'error');
      return;
    }
    if (!selectedId) {
      showStatus(status, 'Select a discovered target first.', 'error');
      return;
    }
    showStatus(status, 'Saving default...', 'running');
    try {
      await saveConnectorBootstrap(service, selectedId);
      showStatus(status, 'Default saved.', 'ok');
      const creds = await fetchCredentials();
      const budget = state.activeProject?.id ? await fetchCredentialBudget(state.activeProject.id) : null;
      renderCredentials(creds, budget);
      Dashboard.updateCredServiceGuide();
      const field = CONNECTOR_BOOTSTRAP_FIELDS[service];
      if (field) {
        const result = {
          service,
          candidates: [{ id: selectedId, label: selectedId }],
          selectedId,
          autoSelected: false,
          message: `Saved ${selectedId} as the default target.`,
        };
        renderConnectorBootstrapResult(result);
      }
    } catch (err) {
      showStatus(status, `Save failed: ${err.message}`, 'error');
    }
  },

  async autoBootstrapAllConnectors() {
    const status = document.getElementById('credBootstrapStatus');
    const resultEl = document.getElementById('credBootstrapResult');
    showStatus(status, 'Running auto bootstrap...', 'running');
    try {
      const result = await autoBootstrapConnectors();
      const rows = Array.isArray(result?.results) ? result.results : [];
      const summary = result?.summary || {};
      const lineItems = rows.map((entry) => {
        const service = CONNECTOR_BOOTSTRAP_LABELS[String(entry.service || '').trim()] || String(entry.service || 'service');
        if (!entry.ok) {
          return `${service}: blocked (${entry.error || 'discovery failed'})`;
        }
        if (entry.autoSelected && entry.selectedId) {
          return `${service}: auto-selected ${entry.selectedId}`;
        }
        if (entry.selectedId) {
          return `${service}: existing default ${entry.selectedId}`;
        }
        return `${service}: ${Number(entry.candidatesCount || 0)} candidates, selection required`;
      });

      if (resultEl) {
        const header = `Auto bootstrap finished (${Number(summary.selected || 0)}/${Number(summary.total || rows.length || 3)} defaults set).`;
        resultEl.textContent = [header, ...lineItems].join(' ');
      }

      const creds = await fetchCredentials();
      const budget = state.activeProject?.id ? await fetchCredentialBudget(state.activeProject.id) : null;
      renderCredentials(creds, budget);
      Dashboard.updateCredServiceGuide();
      showStatus(status, result?.message || 'Auto bootstrap complete.', 'ok');
      showToast(`Auto bootstrap complete: ${Number(summary.autoSelected || 0)} newly auto-selected.`, 'ok');
    } catch (err) {
      showStatus(status, `Auto bootstrap failed: ${err.message}`, 'error');
      if (resultEl) {
        resultEl.textContent = `Auto bootstrap failed: ${err.message}`;
      }
    }
  },

  openPlatformLogin(platformId) {
    const item = PLATFORM_CONNECTIONS.find(p => p.id === platformId);
    if (!item) return;
    window.open(item.loginUrl, '_blank', 'noopener,noreferrer');
    showToast(`Opened ${item.label} login page. Use Refresh Status after authenticating locally.`, 'info');
  },

  markPlatformDisconnected(platformId) {
    showToast(`Platform status is machine-detected. Remove the local CLI session or key, then refresh.`, 'info');
  },

  async refreshPlatformConnections() {
    try {
      renderPlatformConnections(await fetchIntegrations());
      showToast('Platform connection status refreshed.', 'ok');
    } catch (err) {
      showToast(`Could not refresh platform status: ${err.message}`, 'error');
    }
  },

  refreshProjectCredentialPolicyForm() {
    syncProjectCredentialPolicyForm();
  },

  async refreshCredentialAudit() {
    if (!state.activeProject) {
      showToast('No active project selected.', 'error');
      return;
    }
    try {
      const audit = await fetchCredentialAudit(state.activeProject.id);
      renderCredentialAudit(audit);
      showToast('Credential audit refreshed.', 'ok');
    } catch (err) {
      showToast(`Could not refresh credential audit: ${err.message}`, 'error');
    }
  },

  openConnectorWebsiteFromHint() {
    const panel = document.getElementById('connectorCheckHint');
    const service = panel?.dataset?.service || panel?.dataset?.connector || '';
    const url = CONNECTOR_WEBSITES[String(service).trim().toLowerCase()] || '';
    if (!url) {
      showToast('No provider website is configured for this connector.', 'info');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('Opened provider site in a new tab.', 'ok');
  },

  goToCredentialFromHint() {
    const panel = document.getElementById('connectorCheckHint');
    const service = String(panel?.dataset?.service || panel?.dataset?.connector || '').trim();
    activateSection('credentials');
    setTimeout(() => {
      const select = document.getElementById('credService');
      if (select && service) {
        const has = Array.from(select.options).some((opt) => opt.value === service);
        if (has) select.value = service;
      }
      Dashboard.updateCredServiceGuide();
      const token = document.getElementById('credToken');
      if (token) token.focus();
    }, 120);
  },

  async saveProjectCredentialPolicy() {
    if (!state.activeProject) {
      showToast('No active project selected.', 'error');
      return;
    }

    const service = document.getElementById('credentialPolicyService').value;
    const enabled = document.getElementById('credentialPolicyEnabled').checked;
    const rawCap = document.getElementById('credentialPolicyMonthlyCap').value.trim();
    const status = document.getElementById('credentialPolicyStatus');
    const monthlyCap = rawCap === '' ? null : Number(rawCap);

    showStatus(status, 'Saving…', 'running');
    try {
      const updated = await apiFetch(API.credentialPolicy, {
        method: 'POST',
        body: JSON.stringify({
          projectId: state.activeProject.id,
          service,
          policy: {
            enabled,
            monthlyCap: monthlyCap === null ? null : monthlyCap,
          },
        }),
      });
      renderProjectCredentialPolicy(updated);
      document.getElementById('credentialPolicyService').value = service;
      syncProjectCredentialPolicyForm();
      renderCredentialAudit(await fetchCredentialAudit(state.activeProject.id));
      renderCredentials(await fetchCredentials(), await fetchCredentialBudget(state.activeProject.id));
      showStatus(status, 'Saved.', 'ok');
      showToast(`Saved ${service} policy for ${state.activeProject.name}.`, 'ok');
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
      showToast(`Could not save credential policy: ${err.message}`, 'error');
    }
  },

  async projectControl(action) {
    if (!state.activeProject) { alert('No active project selected.'); return; }
    if (action === 'delete' && !confirm(`Delete project "${state.activeProject.name}"? This cannot be undone.`)) return;
    try {
      await postControl(state.activeProject.id, action);
      if (action === 'delete') {
        state.activeProject = null;
        document.getElementById('activeProjectPill').style.display = 'none';
        activateSection('projects');
      } else if (action === 'pause') {
        state.activeProject.status = 'paused';
        showToast('Project paused — agents set to idle.', 'info');
        renderSidebarProjectList(state.projects.map(p => p.id === state.activeProject.id ? state.activeProject : p));
        if (state.activeSection === 'agents') onSectionActivate('agents');
      } else if (action === 'resume') {
        state.activeProject.status = 'running';
        showToast('Project resumed.', 'ok');
        renderSidebarProjectList(state.projects.map(p => p.id === state.activeProject.id ? state.activeProject : p));
        if (state.activeSection === 'agents') onSectionActivate('agents');
      } else if (action === 'restart_agents') {
        showToast('Agents restarted.', 'ok');
        state.activeProject.status = 'running';
        renderSidebarProjectList(state.projects.map(p => p.id === state.activeProject.id ? state.activeProject : p));
        if (state.activeSection === 'agents') onSectionActivate('agents');
        if (state.activeSection === 'kanban')  onSectionActivate('kanban');
      }
    } catch (err) {
      showToast(`Control action failed: ${err.message}`, 'error');
    }
  },

  async forceHeartbeat() {
    if (!state.activeProject) { alert('No active project selected.'); return; }
    try {
      await postControl(state.activeProject.id, 'heartbeat');
    } catch (err) {
      alert(`Heartbeat failed: ${err.message}`);
    }
  },

  exportLogs() {
    const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'hiveforge-logs.json' });
    a.click();
    URL.revokeObjectURL(url);
  },

  async openWorkspacePath(relativePath = '') {
    if (!state.activeProject) {
      showToast('No active project selected.', 'error');
      return;
    }
    try {
      const listing = await fetchWorkspace(state.activeProject.id, relativePath);
      renderWorkspaceDirectory(listing);
      renderWorkspacePreview(null);
    } catch (err) {
      showToast(`Could not open workspace path: ${err.message}`, 'error');
    }
  },

  async previewWorkspaceFile(relativePath) {
    if (!state.activeProject) {
      showToast('No active project selected.', 'error');
      return;
    }
    try {
      renderWorkspacePreview(await fetchWorkspaceFile(state.activeProject.id, relativePath));
    } catch (err) {
      showToast(`Could not preview file: ${err.message}`, 'error');
    }
  },

  async saveSettings() {
    const status = document.getElementById('settingsStatus');
    const heartbeatSeconds = Number(document.getElementById('settingsHeartbeatSeconds').value);
    const stallMinutes = Number(document.getElementById('settingsStallMinutes').value);
    const maxAutoFixes = Number(document.getElementById('settingsMaxAutoFixes').value);
    const countManualHeartbeatForStall = document.getElementById('settingsCountManualHeartbeat').checked;
    const llmEndpoint = document.getElementById('settingsLlmEndpoint').value.trim();
    const preferFreeTierFirst = Boolean(document.getElementById('settingsPreferFreeTierFirst')?.checked);
    const requireApprovalForPaidTierUpgrade = Boolean(document.getElementById('settingsRequirePaidTierApproval')?.checked);
    const preferredDatabaseService = document.getElementById('settingsPreferredDatabase')?.value || 'supabase';
    const whatsappNotifyTo = document.getElementById('settingsWhatsAppNotifyTo')?.value.trim() || '';
    const telegramChatId = document.getElementById('settingsTelegramChatId')?.value.trim() || '';
    const preferredChannel = document.getElementById('settingsNotifyChannel')?.value || 'whatsapp';
    const kpiAlertsEnabled = Boolean(document.getElementById('settingsKpiAlertsEnabled')?.checked);
    const kpiAlertCooldownMinutes = Number(document.getElementById('settingsKpiAlertCooldown')?.value || 120);
    const retryPolicies = collectRetryPolicyPayload();

    showStatus(status, 'Saving…', 'running');
    try {
      const payload = {
        runtime: {
          heartbeatIntervalMs: Math.round(heartbeatSeconds * 1000),
          stallTimeoutMs: Math.round(stallMinutes * 60 * 1000),
          maxAutoFixes: Math.round(maxAutoFixes),
          countManualHeartbeatForStall,
        },
        llm: {
          endpoint: llmEndpoint,
        },
        planning: {
          preferFreeTierFirst,
          requireApprovalForPaidTierUpgrade,
          preferredDatabaseService,
        },
        retryPolicies,
        notifications: {
          whatsappNotifyTo,
          telegramChatId,
          preferredChannel,
          kpiAlertsEnabled,
          kpiAlertCooldownMinutes,
        },
      };
      const updated = await apiFetch(API.settings, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      renderSettings(updated);
      showStatus(status, 'Saved. Applied to running projects.', 'ok');
      showToast('Settings updated.', 'ok');
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
      showToast(`Could not save settings: ${err.message}`, 'error');
    }
  },

  async sendTestNotification() {
    const status = document.getElementById('settingsNotifyStatus');
    showStatus(status, 'Sending test…', 'running');
    try {
      const result = await apiFetch(API.notificationTest, {
        method: 'POST',
        body: JSON.stringify({
          projectId: state.activeProject?.id || null,
          summary: 'Test escalation from Settings',
        }),
      });
      if (result.ok) {
        showStatus(status, `Sent via ${result.provider}.`, 'ok');
        showToast(`Test notification sent via ${result.provider}.`, 'ok');
      } else {
        showStatus(status, `Not sent (${result.reason || 'not configured'}).`, 'error');
        showToast(`Test notification failed: ${result.reason || 'not configured'}`, 'error');
      }
      const hint = document.getElementById('settingsNotifyHint');
      if (hint && result.notifications) {
        const wa = result.notifications?.whatsapp?.enabled;
        const tg = result.notifications?.telegram?.enabled;
        hint.textContent = `WhatsApp ${wa ? 'ready' : 'not ready'} · Telegram ${tg ? 'ready' : 'not ready'}`;
      }
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
      showToast(`Could not send test notification: ${err.message}`, 'error');
    }
  },

  async resetSettings() {
    const status = document.getElementById('settingsStatus');
    showStatus(status, 'Resetting…', 'running');
    try {
      const updated = await apiFetch(API.settingsReset, { method: 'POST' });
      renderSettings(updated);
      showStatus(status, 'Reset to defaults.', 'ok');
      showToast('Settings reset to defaults.', 'info');
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
      showToast(`Could not reset settings: ${err.message}`, 'error');
    }
  },

  async runProductionCertification() {
    const status = document.getElementById('productionCertificationStatus');
    const output = document.getElementById('productionCertificationOutput');
    if (output) output.textContent = 'Running production certification...';
    showStatus(status, 'Running…', 'running');
    try {
      const result = await apiFetch(API.productionCertification, { method: 'POST' });
      const stdout = String(result.stdout || '').trim();
      const stderr = String(result.stderr || '').trim();
      if (output) {
        output.textContent = [stdout, stderr ? `STDERR:\n${stderr}` : ''].filter(Boolean).join('\n\n') || 'Certification completed with no output.';
      }
      showStatus(status, 'Passed.', 'ok');
      showToast('Production certification passed.', 'ok');
      await this.refreshProductionEvidence();
      const badge = document.getElementById('lastCertBadge');
      if (badge) {
        badge.textContent = `✓ Last passed ${new Date().toLocaleString()}`;
        badge.style.color = 'var(--ok, #5cb85c)';
        badge.style.display = 'inline';
      }
    } catch (err) {
      const message = String(err.message || 'Certification failed.');
      if (output) output.textContent = message;
      showStatus(status, 'Failed.', 'error');
      showToast('Production certification failed. See output in Settings.', 'error');
      const badge = document.getElementById('lastCertBadge');
      if (badge) {
        badge.textContent = `✗ Last failed ${new Date().toLocaleString()}`;
        badge.style.color = 'var(--error, #d9534f)';
        badge.style.display = 'inline';
      }
    }
  },

  copyCertOutput() {
    const output = document.getElementById('productionCertificationOutput');
    const text = output ? output.textContent : '';
    if (!text || text === 'No certification run yet.') {
      showToast('No certification output to copy.', 'info');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast('Certification output copied to clipboard.', 'ok');
    }).catch(() => {
      showToast('Could not copy to clipboard.', 'error');
    });
  },

  async refreshProductionEvidence() {
    try {
      const data = await apiFetch(API.productionCertification);
      renderProductionEvidenceSummary(data);
      showToast('Production evidence refreshed.', 'ok');
    } catch (err) {
      showToast(`Could not refresh evidence: ${err.message}`, 'error');
    }
  },

  async loadProductionEvidenceRun() {
    const select = document.getElementById('productionEvidenceRunSelect');
    const runId = select ? String(select.value || '').trim() : '';
    if (!runId) return;
    try {
      const data = await apiFetch(`${API.productionCertification}?runId=${encodeURIComponent(runId)}&limit=20`);
      if (data && data.run) {
        renderProductionEvidenceSummary({ latest: data.run, recentRuns: data.recentRuns || [] });
        const out = document.getElementById('productionCertificationOutput');
        if (out) {
          const stdout = String(data.run.stdout || '').trim();
          const stderr = String(data.run.stderr || '').trim();
          out.textContent = [stdout, stderr ? `STDERR:\n${stderr}` : ''].filter(Boolean).join('\n\n') || 'No output in this run.';
        }
      }
    } catch (err) {
      showToast(`Could not load evidence run: ${err.message}`, 'error');
    }
  },

  exportProductionEvidence() {
    const select = document.getElementById('productionEvidenceRunSelect');
    const runId = select ? String(select.value || '').trim() : '';
    const qp = runId ? `?runId=${encodeURIComponent(runId)}` : '';
    window.open(`${API.productionCertification}/evidence/export${qp}`, '_blank');
  },

  async triggerNetlifyDeploy() {
    const siteIdInput = document.getElementById('netlifyDeploySiteId');
    const status = document.getElementById('netlifyDeployStatus');
    const output = document.getElementById('netlifyDeployOutput');
    const siteId = siteIdInput ? siteIdInput.value.trim() : '';
    if (!siteId) {
      showToast('Enter a Netlify site ID first.', 'error');
      return;
    }
    showStatus(status, 'Triggering deploy…', 'running');
    if (output) { output.style.display = 'block'; output.textContent = 'Triggering deploy...'; }
    try {
      const result = await apiFetch(API.netlifyDeploy, {
        method: 'POST',
        body: JSON.stringify({ siteId }),
      });
      if (output) {
        output.textContent = result.ok
          ? `Deploy triggered.\nDeploy ID: ${result.data?.id || 'n/a'}\nState: ${result.data?.state || 'n/a'}\nURL: ${result.data?.deployUrl || ''}`
          : `Error: ${result.message || result.error || 'Unknown error'}`;
      }
      showStatus(status, result.ok ? 'Triggered.' : 'Failed.', result.ok ? 'ok' : 'error');
      if (result.ok) {
        showToast(`Deploy triggered for site ${siteId}.`, 'ok');
        setTimeout(() => this.loadNetlifyDeploys(siteId), 3000);
      } else {
        showToast(`Deploy trigger failed: ${result.message || result.error || ''}`, 'error');
      }
    } catch (err) {
      if (output) output.textContent = `Error: ${err.message}`;
      showStatus(status, 'Failed.', 'error');
      showToast(`Deploy trigger error: ${err.message}`, 'error');
    }
  },

  async loadNetlifyDeploys(siteIdOverride) {
    const siteIdInput = document.getElementById('netlifyDeploySiteId');
    const status = document.getElementById('netlifyDeployStatus');
    const list = document.getElementById('netlifyDeployList');
    const siteId = siteIdOverride || (siteIdInput ? siteIdInput.value.trim() : '');
    if (!siteId) {
      showToast('Enter a Netlify site ID first.', 'error');
      return;
    }
    showStatus(status, 'Loading deploys…', 'running');
    try {
      const result = await apiFetch(`${API.netlifyDeploys}?siteId=${encodeURIComponent(siteId)}`);
      const deploys = result?.data?.deploys || [];
      if (list) {
        if (!deploys.length) {
          list.innerHTML = '<div style="color:var(--muted);">No deploys found.</div>';
        } else {
          list.innerHTML = deploys.map((d) => {
            const stateColor = d.state === 'ready' ? 'var(--ok, #5cb85c)' : d.state === 'error' ? 'var(--error, #d9534f)' : 'var(--muted)';
            const when = d.createdAt ? new Date(d.createdAt).toLocaleString() : 'n/a';
            return `<div style="padding:0.35rem 0;border-bottom:1px solid var(--border);">
              <span style="color:${stateColor};font-weight:600;">${esc(d.state || '?')}</span>
              <span style="font-size:0.8rem;color:var(--muted);margin-left:0.5rem;">${esc(when)}</span>
              ${d.branch ? `<span style="font-size:0.78rem;color:var(--muted);margin-left:0.5rem;">${esc(d.branch)}${d.commitRef ? `@${esc(d.commitRef)}` : ''}</span>` : ''}
              ${d.errorMessage ? `<div style="font-size:0.76rem;color:var(--error,#d9534f);">${esc(d.errorMessage)}</div>` : ''}
            </div>`;
          }).join('');
        }
      }
      showStatus(status, `${deploys.length} deploy${deploys.length === 1 ? '' : 's'}.`, 'ok');
    } catch (err) {
      if (list) list.innerHTML = `<div style="color:var(--error,#d9534f);">Error: ${esc(err.message)}</div>`;
      showStatus(status, 'Failed.', 'error');
    }
  },

  async saveKpiGoals() {
    if (!state.activeProject) {
      showToast('No active project selected.', 'error');
      return;
    }
    const status = document.getElementById('analyticsGoalStatus');
    const weeklyTasksDoneTarget = Number(document.getElementById('analyticsGoalWeeklyTasks')?.value || 0);
    const maxBacklog = Number(document.getElementById('analyticsGoalBacklogCap')?.value || 0);
    const maxMonthlySpend = Number(document.getElementById('analyticsGoalSpendCap')?.value || 0);
    showStatus(status, 'Saving…', 'running');
    try {
      const result = await apiFetch(API.kpiGoals, {
        method: 'POST',
        body: JSON.stringify({
          projectId: state.activeProject.id,
          goals: { weeklyTasksDoneTarget, maxBacklog, maxMonthlySpend },
        }),
      });
      renderAnalytics(result.analytics || await fetchAnalytics(state.activeProject.id));
      showStatus(status, 'Saved.', 'ok');
      showToast('KPI goals updated.', 'ok');
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
      showToast(`Could not save KPI goals: ${err.message}`, 'error');
    }
  },

  async decideTaskApproval(taskId, decision) {
    if (!state.activeProject) {
      showToast('No active project selected.', 'error');
      return;
    }
    const normalized = String(decision || '').toLowerCase();
    if (normalized !== 'approve' && normalized !== 'deny') return;
    const note = normalized === 'deny'
      ? (window.prompt('Optional deny reason:', '') || '').trim()
      : '';
    try {
      await apiFetch(API.taskApproval, {
        method: 'POST',
        body: JSON.stringify({
          projectId: state.activeProject.id,
          taskId,
          decision: normalized,
          note,
        }),
      });
      state.selectedApprovalTaskIds.delete(taskId);
      const selectedCount = document.getElementById('approvalsSelectedCount');
      if (selectedCount) selectedCount.textContent = String(state.selectedApprovalTaskIds.size);
      showToast(`Task ${normalized}d.`, 'ok');
      if (state.activeSection === 'approvals') {
        onSectionActivate('approvals');
      }
      if (state.activeSection === 'kanban') {
        renderKanban(state.tasks = await fetchTasks(state.activeProject.id));
      }
    } catch (err) {
      showToast(`Task approval failed: ${err.message}`, 'error');
    }
  },

  async saveProjectAutomation() {
    if (!state.activeProject) {
      showToast('No active project selected.', 'error');
      return;
    }
    const status = document.getElementById('projectAutomationStatus');
    const recurringEnabled = document.getElementById('projectRecurringEnabled').checked;
    showStatus(status, 'Saving…', 'running');
    try {
      const updated = await apiFetch(API.projectSettings, {
        method: 'POST',
        body: JSON.stringify({
          projectId: state.activeProject.id,
          recurring: { enabled: recurringEnabled },
        }),
      });
      renderProjectAutomation(updated);
      showStatus(status, 'Saved.', 'ok');
      showToast(`Recurring automation ${recurringEnabled ? 'enabled' : 'disabled'} for this project.`, 'ok');
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
      showToast(`Could not save project automation: ${err.message}`, 'error');
    }
  },

  async runRecurringNow() {
    if (!state.activeProject) {
      showToast('No active project selected.', 'error');
      return;
    }
    const status = document.getElementById('projectAutomationStatus');
    showStatus(status, 'Running now…', 'running');
    try {
      const updated = await apiFetch(API.projectSettings, {
        method: 'POST',
        body: JSON.stringify({
          projectId: state.activeProject.id,
          recurring: { enqueueNow: true },
        }),
      });
      renderProjectAutomation(updated);
      state.tasks = await fetchTasks(state.activeProject.id);
      if (state.activeSection === 'kanban') renderKanban(state.tasks);
      showStatus(status, 'Triggered.', 'ok');
      showToast(`Recurring run triggered. Enqueued ${Number(updated.enqueuedNow || 0)} task(s).`, 'ok');
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
      showToast(`Could not trigger recurring run: ${err.message}`, 'error');
    }
  },

  async runConnectorCheck() {
    const status = document.getElementById('connectorCheckStatus');
    const output = document.getElementById('connectorCheckOutput');
    const connector = document.getElementById('connectorCheckType').value;
    const dryRun = document.getElementById('connectorCheckDryRun').checked;
    const operation = document.getElementById('connectorCheckOperation').value.trim();
    const estimatedCostRaw = document.getElementById('connectorCheckEstimatedCost').value.trim();
    const estimatedCost = estimatedCostRaw === '' ? null : Number(estimatedCostRaw);

    showStatus(status, 'Running…', 'running');
    if (output) output.textContent = 'Running connector policy check...';
    renderConnectorGuidance(null, connector);

    try {
      const result = await runConnectorCheck(connector, state.activeProject?.id || null, dryRun, operation, estimatedCost);
      const decision = String(result?.decision || '').toLowerCase();
      showStatus(status, result.ok ? 'Allowed' : 'Denied', result.ok ? 'ok' : 'error');
      if (output) {
        output.textContent = JSON.stringify({
          connector: result.connector,
          operation: result.operation,
          decision,
          reason: result.reason,
          dryRun: result.dryRun,
          checkedAt: result.checkedAt,
          checks: result.checks,
          budget: result.budget,
          execution: result.execution,
        }, null, 2);
      }
      if (state.activeProject?.id) {
        renderCredentialAudit(await fetchCredentialAudit(state.activeProject.id));
        renderCredentials(await fetchCredentials(), await fetchCredentialBudget(state.activeProject.id));
      }
      renderConnectorGuidance(result, connector);
      showToast(`Connector ${result.connector}: ${decision || (result.ok ? 'allow' : 'deny')}.`, result.ok ? 'ok' : 'info');
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
      if (output) output.textContent = `Connector check failed:\n${err.message}`;
      renderConnectorGuidance({ ok: false, connector, reason: err.message, checks: [] }, connector);
      showToast(`Connector check failed: ${err.message}`, 'error');
    }
  },
};

// ─── Theme Switcher ──────────────────────────────────────────────────────────

document.querySelectorAll('.hf-theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.body.setAttribute('data-theme', btn.dataset.theme);
    document.querySelectorAll('.hf-theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    localStorage.setItem('hf-theme', btn.dataset.theme);
  });
});

// ─── Nav wiring ──────────────────────────────────────────────────────────────

document.querySelectorAll('.hf-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => activateSection(btn.dataset.section));
});

document.getElementById('newProjectTemplate')?.addEventListener('change', e => {
  renderAgentPreview(e.target.value);
});

// ─── Utils ───────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function jsq(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showStatus(el, msg, type) {
  if (!el) return;
  el.style.display = 'inline';
  el.className     = `hf-status ${type}`;
  el.textContent   = msg;
}

// ─── Toast + Project Picker ───────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `hf-toast hf-toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function showAddAgentPicker(agentId) {
  state._pendingAddAgentId = agentId;
  const agentInfo = MARKETPLACE_AGENTS.find(a => a.id === agentId);
  document.getElementById('addAgentModalAgentName').textContent = agentInfo ? agentInfo.name : agentId;
  const list = document.getElementById('addAgentProjectList');
  list.innerHTML = state.projects.map(p => `
    <button class="hf-modal-project-item" onclick="Dashboard.confirmAddAgent('${p.id}')">
      <span class="hf-sidebar-project-dot ${esc(p.status)}"></span>
      <span class="hf-sidebar-project-main">
        <span class="hf-sidebar-project-name">${esc(p.name)}</span>
        <span class="hf-sidebar-project-meta">${esc(TEMPLATES[p.template]?.label ?? p.template)}</span>
      </span>
    </button>`).join('');
  document.getElementById('addAgentModal').style.display = 'flex';
}

function closeAddAgentModal() {
  document.getElementById('addAgentModal').style.display = 'none';
  state._pendingAddAgentId = null;
}

async function doAddAgent(agentId, projectId) {
  try {
    await apiFetch(API.agents, {
      method: 'POST',
      body: JSON.stringify({ projectId, agentId }),
    });
    showToast('Agent added to project!', 'ok');
    if (state.activeProject?.id === projectId) activateSection('agents');
  } catch (err) {
    showToast(`Could not add agent: ${err.message}`, 'error');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  // Restore saved theme
  const saved = localStorage.getItem('hf-theme') ?? 'light';
  document.body.setAttribute('data-theme', saved);
  document.querySelectorAll('.hf-theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === saved));

  // Initial LLM health check, repeat every 30s
  checkLLMHealth();
  setInterval(checkLLMHealth, 30_000);

  // Load initial section
  activateSection('projects');
})();
