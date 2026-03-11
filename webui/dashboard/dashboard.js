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
  credentials: '/api/credentials',
  integrations:'/api/integrations',
  analytics:   '/api/analytics',
  logs:        '/api/logs',
  marketplace: '/api/marketplace',
  control:     '/api/control',
};

const SECTION_TITLES = {
  projects:    'Projects',
  'new-project': 'New Project',
  agents:      'Agent Activity Monitor',
  kanban:      'Task Pipeline',
  workspace:   'Workspace Explorer',
  heartbeat:   'Heartbeat Monitor',
  logs:        'Logs & Timeline',
  credentials: 'Credential Manager',
  analytics:   'Analytics',
  marketplace: 'Agent Marketplace',
};

const TEMPLATES = {
  business:        { label: 'Business', roster: ['Coordinator','Marketing Manager','Sales Manager','Financial Controller','Content Writer','Data Analyst'] },
  software_agency: { label: 'Software Agency', roster: ['Coordinator','Lead Developer','Frontend Dev','Backend Dev','QA Engineer','DevOps Engineer'] },
  game_studio:     { label: 'Game Studio', roster: ['Coordinator','Game Designer','Lead Developer','Artist','Audio Engineer','QA Engineer'] },
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
  { id:'netlify',       label:'Netlify',          icon:'🌐', desc:'Deploy static sites & serverless functions.' },
  { id:'stripe',        label:'Stripe',            icon:'💳', desc:'Process payments, subscriptions, invoices.'  },
  { id:'google_ads',    label:'Google Ads',        icon:'📣', desc:'Create and manage ad campaigns.'            },
  { id:'analytics',     label:'Google Analytics',  icon:'📊', desc:'Track traffic, events, and conversions.'    },
  { id:'email_provider',label:'Email Provider',    icon:'📧', desc:'SMTP / transactional email (Mailgun etc.).' },
];

const KPI_LABELS = ['Visitors (7d)', 'Conversions', 'Revenue', 'Ad Spend', 'ROAS', 'Open Rate'];
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

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  activeSection:  'projects',
  activeProject:  null,   // { id, name, template }
  projects:       [],
  agents:         [],
  tasks:          [],
  logs:           [],
  marketplaceFilter: { division: 'All', query: '' },
  sseSource:      null,
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
      github: localStorage.getItem('hf-github-connected') === '1',
      clawhub: localStorage.getItem('hf-clawhub-connected') === '1',
    };
  }
}

async function fetchAnalytics(projectId) {
  try { return await apiFetch(`${API.analytics}?projectId=${projectId}`); }
  catch { return { kpi: KPI_PLACEHOLDER }; }
}

async function fetchLogs(projectId, filter='all') {
  try { return await apiFetch(`${API.logs}?projectId=${projectId}&filter=${filter}`); }
  catch { return []; }
}

async function postControl(projectId, action, payload = {}) {
  return apiFetch(API.control, {
    method: 'POST',
    body: JSON.stringify({ projectId, action, ...payload }),
  });
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

function startSSE(projectId) {
  if (state.sseSource) { state.sseSource.close(); state.sseSource = null; }
  if (!projectId) return;
  const src = new EventSource(`/events?projectId=${projectId}`);
  src.addEventListener('agent_message',   e => handleSSEEvent('message', JSON.parse(e.data)));
  src.addEventListener('task_update',     e => handleSSEEvent('task',    JSON.parse(e.data)));
  src.addEventListener('heartbeat',       e => handleSSEEvent('heartbeat',JSON.parse(e.data)));
  src.addEventListener('error',           e => handleSSEEvent('error',   JSON.parse(e.data)));
  src.onerror = () => console.warn('[HiveForge] SSE connection dropped — will retry.');
  state.sseSource = src;
}

function handleSSEEvent(type, data) {
  // Append to logs
  appendLogEntry({ type, data, ts: new Date().toISOString() });
  // Trigger targeted refresh for the relevant panel
  if (type === 'task')      renderKanban(state.tasks = patchTask(state.tasks, data));
  if (type === 'heartbeat') renderHeartbeatCard(data);
  if (type === 'message')   renderAgentCard(data);
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
    el.innerHTML = items.map(t => `
      <div class="hf-kanban-card">
        <div style="font-weight:600;font-size:0.88rem;">${esc(t.title)}</div>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:0.2rem;">${esc(t.assignee ?? 'Unassigned')}</div>
        ${t.blockedBy ? `<div style="font-size:0.75rem;color:#e87;margin-top:0.2rem;">⛔ Blocked by: ${esc(t.blockedBy)}</div>` : ''}
      </div>`).join('') || `<div style="color:var(--muted);font-size:0.82rem;padding:0.5rem;">Empty</div>`;
  }
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
}

// Credential cards
function renderCredentials(creds) {
  const grid = document.getElementById('credGrid');
  grid.innerHTML = CREDENTIAL_SERVICES.map(svc => {
    const saved = (creds ?? []).find(c => c.service === svc.id);
    return `
    <div class="hf-cred-card">
      <div class="hf-cred-icon">${svc.icon}</div>
      <div class="hf-cred-body">
        <div class="hf-cred-name">${svc.label}</div>
        <div class="hf-cred-desc">${svc.desc}</div>
      </div>
      <div class="hf-cred-status">
        ${saved ? `<span class="hf-status-badge ok">Connected</span>` : `<span class="hf-status-badge idle">Not set</span>`}
      </div>
    </div>`;
  }).join('');
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
        <button class="hf-btn secondary hf-btn sm" onclick="Dashboard.openPlatformLogin('${it.id}')">Connect</button>
        <button class="hf-btn secondary hf-btn sm" onclick="Dashboard.markPlatformDisconnected('${it.id}')">Disconnect</button>
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
  el.innerHTML = `
    <div class="hf-card" style="max-width:700px;">
      <div style="font-weight:600;margin-bottom:0.5rem;">Default roster for <em>${tpl.label}</em>:</div>
      <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
        ${tpl.roster.map(r => `<span class="hf-badge" style="background:var(--accent);color:#fff;">${r}</span>`).join('')}
      </div>
    </div>`;
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
  const pid = state.activeProject?.id;
  switch (id) {
    case 'projects':    renderProjects(state.projects = await fetchProjects()); break;
    case 'agents':      if (pid) renderAgents(state.agents = await fetchAgents(pid)); break;
    case 'kanban':      if (pid) renderKanban(state.tasks = await fetchTasks(pid)); break;
    case 'heartbeat':   if (pid) renderHeartbeatCard(await fetchHeartbeat(pid)); break;
    case 'credentials': {
      renderCredentials(await fetchCredentials());
      renderPlatformConnections(await fetchIntegrations());
      break;
    }
    case 'analytics':   renderAnalytics(pid ? await fetchAnalytics(pid) : null); break;
    case 'logs':        if (pid) renderLogs(state.logs = await fetchLogs(pid)); break;
    case 'marketplace': renderMarketplace(state.marketplaceFilter); break;
  }
}

// ─── LLM Health Pill ─────────────────────────────────────────────────────────

async function checkLLMHealth() {
  try {
    const res = await fetch('/api/llm_health');
    const data = await res.json();
    const ok = data?.status === 'ok';
    document.getElementById('llmDot').className  = 'hf-dot ' + (ok ? 'ok' : 'error');
    document.getElementById('llmLabel').textContent = ok ? `LM Studio (${data.model ?? 'connected'})` : 'LLM Offline';
  } catch {
    document.getElementById('llmDot').className = 'hf-dot error';
    document.getElementById('llmLabel').textContent = 'LLM Offline';
  }
}

// ─── Public API (called from HTML onclick) ────────────────────────────────────

const Dashboard = {

  nav(id) { activateSection(id); },

  selectProject(id) {
    state.activeProject = state.projects.find(p => p.id === id) ?? { id };
    document.getElementById('activeProjectPill').style.display = 'flex';
    setText('activeProjectName', state.activeProject.name ?? id);
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
      state.projects.push(project);
      showStatus(status, 'Created!', 'ok');
      setTimeout(() => Dashboard.selectProject(project.id), 800);
    } catch (err) {
      showStatus(status, `Failed: ${err.message} (backend not yet wired — see Task 4)`, 'error');
    }
  },

  refreshProjects() { onSectionActivate('projects'); },
  refreshAgents()   { onSectionActivate('agents');   },
  refreshHeartbeat(){ onSectionActivate('heartbeat');},
  refreshLogs()     { onSectionActivate('logs');     },
  filterLogs()      {
    const f = document.getElementById('logsFilter').value;
    renderLogs(state.logs, f);
  },

  filterMarketplace() {
    state.marketplaceFilter.query = document.getElementById('marketplaceSearch').value;
    renderMarketplace(state.marketplaceFilter);
  },

  setDivision(div) {
    state.marketplaceFilter.division = div;
    renderMarketplace(state.marketplaceFilter);
  },

  async addAgent(agentId) {
    if (!state.activeProject) { alert('No active project selected.'); return; }
    try {
      await apiFetch(API.agents, {
        method: 'POST',
        body: JSON.stringify({ projectId: state.activeProject.id, agentId }),
      });
      activateSection('agents');
    } catch (err) {
      alert(`Could not add agent: ${err.message}\n(Backend not yet wired — see Task 4)`);
    }
  },

  async saveCred() {
    const service = document.getElementById('credService').value;
    const token   = document.getElementById('credToken').value.trim();
    const budget  = document.getElementById('credBudget').value;
    const status  = document.getElementById('credStatus');
    if (!service || !token) { showStatus(status, 'Service and token are required.', 'error'); return; }
    showStatus(status, 'Saving…', 'running');
    try {
      await apiFetch(API.credentials, {
        method: 'POST',
        body: JSON.stringify({ service, token, budget: budget ? Number(budget) : null }),
      });
      document.getElementById('credToken').value   = '';
      document.getElementById('credBudget').value  = '';
      document.getElementById('credService').value = '';
      showStatus(status, 'Saved!', 'ok');
      onSectionActivate('credentials');
    } catch (err) {
      showStatus(status, `Failed: ${err.message}`, 'error');
    }
  },

  openPlatformLogin(platformId) {
    const item = PLATFORM_CONNECTIONS.find(p => p.id === platformId);
    if (!item) return;
    window.open(item.loginUrl, '_blank', 'noopener,noreferrer');
    localStorage.setItem(`hf-${platformId}-connected`, '1');
    renderPlatformConnections({
      github: localStorage.getItem('hf-github-connected') === '1',
      clawhub: localStorage.getItem('hf-clawhub-connected') === '1',
    });
  },

  markPlatformDisconnected(platformId) {
    localStorage.setItem(`hf-${platformId}-connected`, '0');
    renderPlatformConnections({
      github: localStorage.getItem('hf-github-connected') === '1',
      clawhub: localStorage.getItem('hf-clawhub-connected') === '1',
    });
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
      }
    } catch (err) {
      alert(`Control action failed: ${err.message}`);
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
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showStatus(el, msg, type) {
  if (!el) return;
  el.style.display = 'inline';
  el.className     = `hf-status ${type}`;
  el.textContent   = msg;
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
