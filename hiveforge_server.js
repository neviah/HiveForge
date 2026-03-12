const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const SANDBOX_ROOT = path.join(__dirname, 'sandbox');
const WEBUI_ROOT = path.join(__dirname, 'webui');
const OPENCLAW_SRC_ROOT = path.join(__dirname, 'openclaw');
const CONFIG_PATH = path.join(SANDBOX_ROOT, 'config.json');
const LOG_PATH = path.join(SANDBOX_ROOT, 'hiveforge.log');
const PROJECTS_ROOT = path.join(SANDBOX_ROOT, 'projects');
const TEMPLATES_ROOT = path.join(__dirname, 'templates');
const CREDENTIALS_ROOT = path.join(SANDBOX_ROOT, 'credentials');
const MAX_TASK_HISTORY = 100;
const MAX_EVENTS_PER_TASK = 500;
const sseClients = new Set();
const projectSseClients = new Map();
const activeTasks = new Map();
const projectRuntimes = new Map();
let pythonRuntimeReady = false;

let nextTaskId = 1;
const taskHistory = [];
let appConfig = null;
const appState = {
  llm: {
    endpoint: 'http://127.0.0.1:1234/v1',
    reachable: false,
    lastCheckedAt: null
  }
};

const SUPPORTED_CREDENTIAL_SERVICES = ['netlify', 'stripe', 'google_ads', 'analytics', 'email_provider'];

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeJsonRead(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return fallback;
  }
}

function projectDir(projectId) {
  return path.join(PROJECTS_ROOT, projectId);
}

function projectStatePath(projectId) {
  return path.join(projectDir(projectId), 'state.json');
}

function projectTemplateSnapshotPath(projectId) {
  return path.join(projectDir(projectId), 'template_snapshot.json');
}

function emitProjectEvent(projectId, eventName, payload) {
  const clients = projectSseClients.get(projectId);
  if (!clients || !clients.size) return;
  const data = JSON.stringify({ ...payload, ts: payload.ts || nowIso() });
  clients.forEach((res) => {
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${data}\n\n`);
    } catch (err) {
      clients.delete(res);
    }
  });
}

function appendProjectLog(projectState, type, data) {
  const entry = { ts: nowIso(), type, data };
  projectState.logs.unshift(entry);
  if (projectState.logs.length > 1000) {
    projectState.logs.length = 1000;
  }
  projectState.lastActivity = entry.ts;
  return entry;
}

function loadTemplateById(templateId) {
  // Normalize: lowercase, spaces → underscores, strip unsafe chars
  const normalized = String(templateId || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!normalized) return null;
  const templatePath = path.resolve(TEMPLATES_ROOT, `${normalized}.json`);
  // Security: must remain inside TEMPLATES_ROOT
  if (!templatePath.startsWith(path.resolve(TEMPLATES_ROOT))) {
    return null;
  }
  if (!fs.existsSync(templatePath)) return null;
  return safeJsonRead(templatePath, null);
}

function roleToAgentId(role, index) {
  const normalized = String(role || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${normalized || 'agent'}_${index + 1}`;
}

function createInitialAgents(projectId, template) {
  const agents = [];
  agents.push({
    id: `coordinator_${projectId}`,
    name: 'Coordinator Agent',
    role: 'Coordinator Agent',
    status: 'running',
    currentTask: null,
    tasksDone: 0,
    tokens: 0,
    recentLog: ['Coordinator online'],
    isCoordinator: true
  });

  const subordinates = Array.isArray(template.subordinate_agents) ? template.subordinate_agents : [];
  subordinates.forEach((agentSpec, idx) => {
    const role = agentSpec.alias || agentSpec.role || `Agent ${idx + 1}`;
    agents.push({
      id: roleToAgentId(role, idx),
      name: role,
      role: role,
      status: 'idle',
      currentTask: null,
      tasksDone: 0,
      tokens: 0,
      recentLog: ['Idle'],
      isCoordinator: false
    });
  });

  return agents;
}

function createInitialTasks(template) {
  const breakdown = Array.isArray(template.task_breakdown) ? template.task_breakdown : [];
  const dependencyGraph = template.dependency_graph || {};
  const createdAt = nowIso();
  return breakdown.map((task, idx) => ({
    id: task.id || `TASK-${idx + 1}`,
    title: task.title || `Task ${idx + 1}`,
    phase: task.phase || 'general',
    status: 'backlog',
    assignee: null,
    blockedBy: (dependencyGraph[task.id] || [])[0] || null,
    dependencies: dependencyGraph[task.id] || [],
    createdAt,
    completedAt: null,
    startedAt: null,
    description: ''
  }));
}

function summarizeProject(projectState) {
  const inProgress = projectState.tasks.find((task) => task.status === 'inprogress');
  return {
    id: projectState.id,
    name: projectState.name,
    template: projectState.template,
    status: projectState.status,
    heartbeat: projectState.heartbeat?.status || 'unknown',
    lastActivity: projectState.lastActivity,
    agentCount: projectState.agents.length,
    currentTask: inProgress ? inProgress.title : null
  };
}

function persistProjectState(projectState) {
  const dir = projectDir(projectState.id);
  ensureDir(dir);
  fs.writeFileSync(projectStatePath(projectState.id), `${JSON.stringify(projectState, null, 2)}\n`, 'utf-8');
}

function projectDoneTaskIds(projectState) {
  const done = new Set();
  projectState.tasks.forEach((task) => {
    if (task.status === 'done') done.add(task.id);
  });
  return done;
}

function nextRunnableTask(projectState) {
  const done = projectDoneTaskIds(projectState);
  return projectState.tasks.find((task) => {
    if (task.status !== 'backlog') return false;
    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
    return deps.every((depId) => done.has(depId));
  }) || null;
}

function pickWorkerAgent(projectState) {
  const candidates = projectState.agents.filter((agent) => !agent.isCoordinator);
  if (!candidates.length) return null;
  const index = projectState.heartbeat?.cycleCount ? projectState.heartbeat.cycleCount % candidates.length : 0;
  return candidates[index];
}

function markAgentLog(agent, message) {
  const line = `${new Date().toISOString().slice(11, 19)} ${message}`;
  agent.recentLog = Array.isArray(agent.recentLog) ? agent.recentLog : [];
  agent.recentLog.unshift(line);
  if (agent.recentLog.length > 10) {
    agent.recentLog.length = 10;
  }
}

function runProjectHeartbeat(projectState, source = 'interval') {
  if (projectState.status !== 'running') {
    return;
  }

  const beatTs = nowIso();
  projectState.heartbeat.lastBeat = beatTs;
  projectState.heartbeat.status = 'alive';
  projectState.heartbeat.cycleCount = (projectState.heartbeat.cycleCount || 0) + 1;

  const activeTask = projectState.tasks.find((task) => task.status === 'inprogress');
  if (activeTask) {
    activeTask.status = 'done';
    activeTask.completedAt = beatTs;
    const worker = projectState.agents.find((agent) => agent.id === activeTask.assignee);
    if (worker) {
      worker.status = 'idle';
      worker.currentTask = null;
      worker.tasksDone = Number(worker.tasksDone || 0) + 1;
      markAgentLog(worker, `Completed ${activeTask.id}`);
      emitProjectEvent(projectState.id, 'agent_message', {
        agentId: worker.id,
        name: worker.name,
        role: worker.role,
        status: worker.status,
        currentTask: null,
        tasksDone: worker.tasksDone,
        recentLog: worker.recentLog
      });
    }

    appendProjectLog(projectState, 'task', {
      kind: 'task_completed',
      taskId: activeTask.id,
      title: activeTask.title,
      assignee: activeTask.assignee,
      source
    });
    emitProjectEvent(projectState.id, 'task_update', activeTask);
  } else {
    const nextTask = nextRunnableTask(projectState);
    if (nextTask) {
      const assignee = pickWorkerAgent(projectState);
      if (assignee) {
        nextTask.status = 'inprogress';
        nextTask.assignee = assignee.id;
        nextTask.startedAt = beatTs;
        nextTask.blockedBy = null;
        assignee.status = 'running';
        assignee.currentTask = nextTask.title;
        markAgentLog(assignee, `Started ${nextTask.id}`);

        appendProjectLog(projectState, 'task', {
          kind: 'task_started',
          taskId: nextTask.id,
          title: nextTask.title,
          assignee: assignee.id,
          source
        });
        emitProjectEvent(projectState.id, 'task_update', nextTask);
        emitProjectEvent(projectState.id, 'agent_message', {
          agentId: assignee.id,
          name: assignee.name,
          role: assignee.role,
          status: assignee.status,
          currentTask: assignee.currentTask,
          tasksDone: assignee.tasksDone,
          recentLog: assignee.recentLog
        });
      }
    }
  }

  const heartbeatLine = {
    ts: beatTs,
    message: `Heartbeat cycle ${projectState.heartbeat.cycleCount} (${source})`
  };
  projectState.heartbeat.log.unshift(heartbeatLine);
  if (projectState.heartbeat.log.length > 200) {
    projectState.heartbeat.log.length = 200;
  }

  appendProjectLog(projectState, 'heartbeat', {
    kind: 'heartbeat',
    source,
    cycle: projectState.heartbeat.cycleCount
  });
  emitProjectEvent(projectState.id, 'heartbeat', {
    status: projectState.heartbeat.status,
    uptime: projectUptime(projectState),
    lastBeat: projectState.heartbeat.lastBeat,
    autoFixCount: projectState.heartbeat.autoFixCount,
    log: projectState.heartbeat.log.slice(0, 25)
  });
  persistProjectState(projectState);
}

function projectUptime(projectState) {
  const startedAt = Date.parse(projectState.startedAt || '');
  if (!startedAt || Number.isNaN(startedAt)) {
    return '0m';
  }
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const minutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remMinutes}m`;
  return `${remMinutes}m`;
}

function startProjectLoop(projectId) {
  const runtime = projectRuntimes.get(projectId);
  if (!runtime || runtime.timer) return;
  runtime.state.status = 'running';
  runtime.timer = setInterval(() => runProjectHeartbeat(runtime.state, 'interval'), 30000);
  appendProjectLog(runtime.state, 'message', { kind: 'project_loop_started' });
  persistProjectState(runtime.state);
}

function stopProjectLoop(projectId) {
  const runtime = projectRuntimes.get(projectId);
  if (!runtime || !runtime.timer) return;
  clearInterval(runtime.timer);
  runtime.timer = null;
}

function loadProjectsFromDisk() {
  ensureDir(PROJECTS_ROOT);
  const children = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
  children.forEach((entry) => {
    if (!entry.isDirectory()) return;
    const state = safeJsonRead(path.join(PROJECTS_ROOT, entry.name, 'state.json'), null);
    if (!state || !state.id) return;
    if (!Array.isArray(state.logs)) state.logs = [];
    if (!Array.isArray(state.tasks)) state.tasks = [];
    if (!Array.isArray(state.agents)) state.agents = [];
    if (!state.heartbeat) {
      state.heartbeat = { status: 'unknown', lastBeat: null, autoFixCount: 0, cycleCount: 0, log: [] };
    }
    const runtime = { state, timer: null };
    projectRuntimes.set(state.id, runtime);
    if (state.status === 'running') {
      startProjectLoop(state.id);
    }
  });
}

function createProjectFromTemplate({ name, template, goal }) {
  const tpl = loadTemplateById(template);
  if (!tpl) {
    throw new Error(`Unknown template: ${template}`);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const state = {
    id,
    name,
    template,
    goal: goal || tpl.goal_definition || '',
    status: 'running',
    startedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    lastActivity: createdAt,
    agents: createInitialAgents(id, tpl),
    tasks: createInitialTasks(tpl),
    logs: [],
    heartbeat: {
      status: 'alive',
      lastBeat: null,
      autoFixCount: 0,
      cycleCount: 0,
      log: []
    }
  };

  appendProjectLog(state, 'message', {
    kind: 'project_created',
    template,
    goal: state.goal
  });

  const runtime = { state, timer: null };
  projectRuntimes.set(id, runtime);

  ensureDir(projectDir(id));
  fs.writeFileSync(projectTemplateSnapshotPath(id), `${JSON.stringify(tpl, null, 2)}\n`, 'utf-8');
  persistProjectState(state);
  startProjectLoop(id);
  runProjectHeartbeat(state, 'startup');
  return summarizeProject(state);
}

function removeProject(projectId) {
  stopProjectLoop(projectId);
  projectRuntimes.delete(projectId);
  const clients = projectSseClients.get(projectId);
  if (clients) {
    clients.forEach((res) => {
      try {
        res.end();
      } catch (err) {
      }
    });
    projectSseClients.delete(projectId);
  }

  const target = projectDir(projectId);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function parseJsonBodySafe(rawBody) {
  if (!rawBody) return {};
  return JSON.parse(rawBody);
}

function credentialMetaPath(service) {
  return path.join(CREDENTIALS_ROOT, `${service}.json`);
}

function credentialTokenPath(service) {
  return path.join(CREDENTIALS_ROOT, `${service}.enc`);
}

function readCredentialMetadata() {
  ensureDir(CREDENTIALS_ROOT);
  return SUPPORTED_CREDENTIAL_SERVICES.map((service) => {
    const metadata = safeJsonRead(credentialMetaPath(service), {});
    const connected = Boolean(metadata.connected) || fs.existsSync(credentialTokenPath(service));
    const monthlyBudget = metadata.budget && typeof metadata.budget.monthly !== 'undefined'
      ? metadata.budget.monthly
      : (typeof metadata.budget === 'number' ? metadata.budget : null);

    return {
      service,
      connected,
      budget: monthlyBudget,
      lastUsed: metadata.last_used || metadata.lastUsed || metadata.updated_at || null
    };
  });
}

function saveCredentialMetadata(service, token, budget) {
  ensureDir(CREDENTIALS_ROOT);
  const meta = safeJsonRead(credentialMetaPath(service), {});
  meta.service = service;
  meta.connected = true;
  meta.updated_at = nowIso();
  meta.last_used = meta.last_used || null;
  meta.budget = {
    daily: meta.budget && typeof meta.budget.daily !== 'undefined' ? meta.budget.daily : null,
    monthly: typeof budget === 'number' && Number.isFinite(budget) ? budget : (meta.budget && typeof meta.budget.monthly !== 'undefined' ? meta.budget.monthly : null)
  };

  fs.writeFileSync(credentialMetaPath(service), `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
  const encoded = Buffer.from(String(token), 'utf-8').toString('base64');
  fs.writeFileSync(credentialTokenPath(service), `${encoded}\n`, 'utf-8');
}

function deleteCredentialMetadata(service) {
  const meta = safeJsonRead(credentialMetaPath(service), { service });
  meta.connected = false;
  meta.updated_at = nowIso();
  fs.writeFileSync(credentialMetaPath(service), `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
  const tokenPath = credentialTokenPath(service);
  if (fs.existsSync(tokenPath)) {
    fs.rmSync(tokenPath, { force: true });
  }
}

function makeAnalyticsSnapshot(projectState) {
  const doneCount = projectState.tasks.filter((task) => task.status === 'done').length;
  const inProgress = projectState.tasks.filter((task) => task.status === 'inprogress').length;
  const visitors = 1200 + (doneCount * 85);
  const conversions = 40 + (doneCount * 4);
  const revenue = 1800 + (doneCount * 260);
  const adSpend = 600 + (inProgress * 25) + (doneCount * 15);
  const roas = adSpend > 0 ? (revenue / adSpend).toFixed(2) : '0.00';
  const openRate = `${Math.min(95, 28 + doneCount * 2)}%`;

  return {
    kpi: [
      String(visitors),
      String(conversions),
      `$${revenue.toFixed(2)}`,
      `$${adSpend.toFixed(2)}`,
      `${roas}x`,
      openRate
    ],
    lastUpdated: nowIso()
  };
}

const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

function log(message) {
  const safeMessage = redactSensitive(message);
  const line = `[${new Date().toISOString()}] ${safeMessage}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

function getConfiguredSecrets() {
  const cfg = appConfig || {};
  const integrations = cfg.integrations || {};
  const secrets = [];

  const githubToken = integrations.github && integrations.github.token;
  const telegramToken = integrations.telegram && integrations.telegram.botToken;
  const whatsappToken = integrations.whatsapp && integrations.whatsapp.accessToken;

  if (githubToken) secrets.push(githubToken);
  if (telegramToken) secrets.push(telegramToken);
  if (whatsappToken) secrets.push(whatsappToken);

  return secrets.filter(Boolean);
}

function redactSensitive(input) {
  if (input === null || input === undefined) {
    return '';
  }

  let text = String(input);
  getConfiguredSecrets().forEach((secret) => {
    if (secret) {
      text = text.split(secret).join('[REDACTED]');
    }
  });

  text = text.replace(/(Bearer\s+)[A-Za-z0-9._-]{12,}/gi, '$1[REDACTED]');
  text = text.replace(/\bghp_[A-Za-z0-9]{20,}\b/g, '[REDACTED]');
  text = text.replace(/\b[0-9]{8,}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]');
  text = text.replace(/\bEA[A-Za-z0-9]{16,}\b/g, '[REDACTED]');

  return text;
}

function inferPhase(type, message) {
  const msg = (message || '').toLowerCase();
  if (type === 'stderr') return 'error';
  if (type === 'system' && msg.includes('started')) return 'planning';
  if (type === 'system' && (msg.includes('finished') || msg.includes('interrupted'))) return 'finish';
  if (/tool|action|step|invoke|execute|command/.test(msg)) return 'action';
  if (/file|write|edit|mkdir|folder|path|workspace|read/.test(msg)) return 'file';
  return 'execution';
}

function broadcastEvent(event) {
  const payload = JSON.stringify({
    ...event,
    ts: event.ts || new Date().toISOString()
  });
  sseClients.forEach((res) => {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (err) {
      sseClients.delete(res);
    }
  });
}

function appendTaskEvent(taskRun, type, message) {
  const safeMessage = redactSensitive(message);
  const phase = inferPhase(type, safeMessage);
  const event = {
    ts: new Date().toISOString(),
    type,
    phase,
    message: safeMessage
  };
  taskRun.events.push(event);
  if (taskRun.events.length > MAX_EVENTS_PER_TASK) {
    taskRun.events.shift();
  }
  broadcastEvent({
    event: 'task-event',
    taskId: taskRun.id,
    task: taskRun.task,
    status: taskRun.status,
    ...event
  });
}

function summarizeTask(taskRun) {
  const text = `${taskRun.task}\n${taskRun.events.map((ev) => ev.message).join('\n')}`.toLowerCase();
  const keywords = ['github', 'telegram', 'whatsapp', 'gmail', 'discord', 'browser', 'file', 'git'];
  const tags = keywords.filter((tag) => text.includes(tag));
  return {
    id: taskRun.id,
    source: taskRun.source || 'task',
    task: taskRun.task,
    status: taskRun.status,
    startedAt: taskRun.startedAt,
    finishedAt: taskRun.finishedAt,
    exitCode: taskRun.exitCode,
    durationMs: taskRun.finishedAt ? (new Date(taskRun.finishedAt).getTime() - new Date(taskRun.startedAt).getTime()) : null,
    eventCount: taskRun.events.length,
    preview: taskRun.events.slice(-4).map((ev) => ev.message).join('\n').slice(0, 500),
    tags
  };
}

function getMetrics() {
  let totalDuration = 0;
  let completedCount = 0;
  let success = 0;
  let failed = 0;
  let running = 0;

  taskHistory.forEach((taskRun) => {
    if (taskRun.status === 'running') {
      running += 1;
      return;
    }

    if (taskRun.exitCode === 0) {
      success += 1;
    } else {
      failed += 1;
    }

    if (taskRun.finishedAt) {
      totalDuration += new Date(taskRun.finishedAt).getTime() - new Date(taskRun.startedAt).getTime();
      completedCount += 1;
    }
  });

  return {
    totalTasks: taskHistory.length,
    runningTasks: running,
    succeededTasks: success,
    failedTasks: failed,
    averageDurationMs: completedCount ? Math.round(totalDuration / completedCount) : 0
  };
}

function integrationStatus() {
  const cfg = appConfig || {};
  const integrations = cfg.integrations || {};
  const githubKeyPath = path.join(SANDBOX_ROOT, '.ssh', 'id_rsa.pub');
  return {
    github: {
      publicKeyPresent: fs.existsSync(githubKeyPath),
      configured: !!integrations.github,
      notes: 'Uses sandbox SSH key by default; add key to GitHub account.'
    },
    telegram: {
      configured: !!(integrations.telegram && integrations.telegram.botToken && integrations.telegram.chatId),
      notes: 'Set integrations.telegram.botToken and chatId in sandbox/config.json to enable.'
    },
    whatsapp: {
      configured: !!(integrations.whatsapp && (integrations.whatsapp.accessToken || integrations.whatsapp.sessionPath)),
      notes: 'Set integrations.whatsapp credentials/session in sandbox/config.json to enable.'
    }
  };
}

function writeJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function createTaskRun(task, source = 'task', meta = {}) {
  const taskRun = {
    id: nextTaskId++,
    source,
    task,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    events: [],
    meta
  };
  taskHistory.push(taskRun);
  if (taskHistory.length > MAX_TASK_HISTORY) {
    taskHistory.shift();
  }
  return taskRun;
}

function completeTaskRun(taskRun, status, exitCode, message) {
  taskRun.status = status;
  taskRun.exitCode = exitCode;
  taskRun.finishedAt = new Date().toISOString();
  appendTaskEvent(taskRun, 'system', message);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function testGithubIntegration() {
  const status = integrationStatus().github;
  const githubCfg = (appConfig && appConfig.integrations && appConfig.integrations.github) || {};
  if (!status.publicKeyPresent && !githubCfg.token) {
    return {
      provider: 'github',
      ok: false,
      message: 'No SSH key or token configured.',
      testedAt: new Date().toISOString()
    };
  }

  if (githubCfg.token) {
    try {
      const resp = await fetchWithTimeout('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${githubCfg.token}`,
          'User-Agent': 'HiveForge'
        }
      });
      if (!resp.ok) {
        return {
          provider: 'github',
          ok: false,
          message: `GitHub token test failed with HTTP ${resp.status}.`,
          testedAt: new Date().toISOString()
        };
      }
      const body = await resp.json();
      return {
        provider: 'github',
        ok: true,
        message: `Connected as ${body.login || 'GitHub user'}.`,
        testedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        provider: 'github',
        ok: false,
        message: `GitHub token test error: ${redactSensitive(err.message)}`,
        testedAt: new Date().toISOString()
      };
    }
  }

  return {
    provider: 'github',
    ok: true,
    message: 'SSH key detected. Add it to GitHub and test by performing a push/pull task.',
    testedAt: new Date().toISOString()
  };
}

async function testTelegramIntegration() {
  const telegramCfg = (appConfig && appConfig.integrations && appConfig.integrations.telegram) || {};
  if (!telegramCfg.botToken || !telegramCfg.chatId) {
    return {
      provider: 'telegram',
      ok: false,
      message: 'Missing botToken or chatId in integrations.telegram.',
      testedAt: new Date().toISOString()
    };
  }

  try {
    const resp = await fetchWithTimeout(`https://api.telegram.org/bot${telegramCfg.botToken}/getMe`);
    const body = await resp.json();
    if (!resp.ok || !body.ok) {
      return {
        provider: 'telegram',
        ok: false,
        message: `Telegram test failed: ${(body && body.description) ? body.description : `HTTP ${resp.status}`}`,
        testedAt: new Date().toISOString()
      };
    }
    return {
      provider: 'telegram',
      ok: true,
      message: `Telegram bot reachable: @${(body.result && body.result.username) || 'unknown'}`,
      testedAt: new Date().toISOString()
    };
  } catch (err) {
    return {
      provider: 'telegram',
      ok: false,
      message: `Telegram test error: ${redactSensitive(err.message)}`,
      testedAt: new Date().toISOString()
    };
  }
}

async function testWhatsappIntegration() {
  const whatsappCfg = (appConfig && appConfig.integrations && appConfig.integrations.whatsapp) || {};
  if (whatsappCfg.accessToken && whatsappCfg.phoneNumberId) {
    try {
      const resp = await fetchWithTimeout(`https://graph.facebook.com/v21.0/${whatsappCfg.phoneNumberId}`, {
        headers: {
          Authorization: `Bearer ${whatsappCfg.accessToken}`
        }
      });
      if (!resp.ok) {
        return {
          provider: 'whatsapp',
          ok: false,
          message: `WhatsApp Graph API test failed with HTTP ${resp.status}.`,
          testedAt: new Date().toISOString()
        };
      }
      return {
        provider: 'whatsapp',
        ok: true,
        message: 'WhatsApp Graph API reachable.',
        testedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        provider: 'whatsapp',
        ok: false,
        message: `WhatsApp test error: ${redactSensitive(err.message)}`,
        testedAt: new Date().toISOString()
      };
    }
  }

  if (whatsappCfg.sessionPath) {
    const sessionPath = path.isAbsolute(whatsappCfg.sessionPath)
      ? whatsappCfg.sessionPath
      : path.join(SANDBOX_ROOT, whatsappCfg.sessionPath);
    const exists = fs.existsSync(sessionPath);
    return {
      provider: 'whatsapp',
      ok: exists,
      message: exists ? 'WhatsApp local session path exists.' : 'WhatsApp session path does not exist.',
      testedAt: new Date().toISOString()
    };
  }

  return {
    provider: 'whatsapp',
    ok: false,
    message: 'Missing integrations.whatsapp config (accessToken + phoneNumberId or sessionPath).',
    testedAt: new Date().toISOString()
  };
}

async function testIntegration(provider) {
  if (provider === 'github') return testGithubIntegration();
  if (provider === 'telegram') return testTelegramIntegration();
  if (provider === 'whatsapp') return testWhatsappIntegration();
  return {
    provider,
    ok: false,
    message: 'Unknown integration provider.',
    testedAt: new Date().toISOString()
  };
}

function venvPython() {
  const venv = path.join(SANDBOX_ROOT, 'venv');
  const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
  const exe = process.platform === 'win32' ? 'python.exe' : 'python';
  return path.join(venv, bin, exe);
}

async function pingLMStudio(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const base = endpoint.replace(/\/$/, '');
    const rootNoV1 = base.replace(/\/(api\/)?v1$/, '');
    const candidates = [
      `${base}/models`,
      `${rootNoV1}/api/v1/models`,
      `${rootNoV1}/v1/models`,
      `${rootNoV1}/models`,
    ];

    for (const url of candidates) {
      try {
        const resp = await fetch(url, { signal: controller.signal });
        if (resp.ok) {
          clearTimeout(timeout);
          return true;
        }
      } catch (err) {
      }
    }

    clearTimeout(timeout);
    return false;
  } catch (err) {
    clearTimeout(timeout);
    return false;
  }
}

function serveStatic(req, res) {
  const rawPath = (req.url || '/').split('?')[0] || '/';
  // Root → redirect to the HiveForge dashboard
  if (rawPath === '/' || rawPath === '/index.html') {
    res.writeHead(302, { Location: '/dashboard/' });
    res.end();
    return;
  }
  // /dashboard/ → serve the dashboard index
  const dashboardRoot = path.join(WEBUI_ROOT, 'dashboard');
  let resolvedBase = WEBUI_ROOT;
  let normalizedPath = rawPath.replace(/^\/+/, '');
  if (normalizedPath === 'dashboard' || normalizedPath === 'dashboard/') {
    resolvedBase = dashboardRoot;
    normalizedPath = 'index.html';
  } else if (normalizedPath.startsWith('dashboard/')) {
    resolvedBase = dashboardRoot;
    normalizedPath = normalizedPath.slice('dashboard/'.length) || 'index.html';
  }
  const target = path.join(resolvedBase, normalizedPath);
  if (!target.startsWith(WEBUI_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function runAgentTask(task, responseStream) {
  const taskRun = createTaskRun(task, 'task');
  log(`Task ${taskRun.id} started: ${task}`);
  appendTaskEvent(taskRun, 'system', `Task ${taskRun.id} started`);

  const ready = ensurePythonRuntime(taskRun);
  if (!ready.ok) {
    completeTaskRun(taskRun, 'failed', 1, `Task ${taskRun.id} failed before execution`);
    if (responseStream && !responseStream.writableEnded) {
      responseStream.write(`\n[err] ${ready.message}`);
      responseStream.end();
    }
    return { taskRun, child: null };
  }

  const existingPythonPath = process.env.PYTHONPATH || '';
  const mergedPythonPath = existingPythonPath
    ? `${OPENCLAW_SRC_ROOT}${path.delimiter}${existingPythonPath}`
    : OPENCLAW_SRC_ROOT;

  const child = spawn(venvPython(), ['-m', 'openclaw.agent', task], {
    cwd: SANDBOX_ROOT,
    env: {
      ...process.env,
      HOME: SANDBOX_ROOT,
      USERPROFILE: SANDBOX_ROOT,
      HiveForge_CONFIG: CONFIG_PATH,
      PYTHONPATH: mergedPythonPath,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
  });

  activeTasks.set(taskRun.id, child);

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const safeText = redactSensitive(text);
    if (responseStream && !responseStream.writableEnded) {
      responseStream.write(safeText);
    }
    appendTaskEvent(taskRun, 'stdout', text);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    log(`Task ${taskRun.id} stderr: ${text.trim()}`);
    const safeText = redactSensitive(text);
    if (responseStream && !responseStream.writableEnded) {
      responseStream.write(`\n[err] ${safeText}`);
    }
    appendTaskEvent(taskRun, 'stderr', text);
  });

  child.on('close', (code) => {
    activeTasks.delete(taskRun.id);
    if (taskRun.status === 'running') {
      taskRun.status = code === 0 ? 'succeeded' : 'failed';
      taskRun.exitCode = code;
      taskRun.finishedAt = new Date().toISOString();
      verifySmokeArtifacts(taskRun);
      appendTaskEvent(taskRun, 'system', `Task ${taskRun.id} finished with code ${taskRun.exitCode}`);
    }

    log(`Task ${taskRun.id} finished with code ${taskRun.exitCode}`);
    if (responseStream && !responseStream.writableEnded) {
      responseStream.end();
    }
  });

  return { taskRun, child };
}

function runCanonicalSmokeTest(responseStream) {
  const smokePrompt = [
    'Run a real filesystem smoke test using the file tool only (no simulation).',
    '1) Create /sandbox/workspace/healthcheck directory.',
    '2) Write /sandbox/workspace/healthcheck/status.json with keys timestamp, writable_root, checks.',
    '3) Append "openclaw smoke test ok" plus newline to /sandbox/workspace/healthcheck/log.txt.',
    '4) Read back both files and report contents.',
    '5) List files in /sandbox/workspace/healthcheck.',
    'End with SMOKE_TEST_PASS only if all operations actually succeeded.'
  ].join(' ');

  const result = runAgentTask(smokePrompt, responseStream);
  result.taskRun.source = 'smoke-test';
  return result;
}

function runCanonicalBrowserSmokeTest(responseStream) {
  const prompt = [
    'Run a browser smoke test using the browser tool only.',
    '1) Fetch https://example.com and return status code, title, and first 200 chars.',
    '2) Fetch https://httpbin.org/get and return status code and origin field.',
    '3) If both succeed, end with BROWSER_SMOKE_TEST_PASS.'
  ].join(' ');

  const result = runAgentTask(prompt, responseStream);
  result.taskRun.source = 'smoke-browser';
  return result;
}

function isSmokePrompt(taskText) {
  const text = (taskText || '').toLowerCase();
  return text.includes('smoke test') || text.includes('healthcheck');
}

function verifySmokeArtifacts(taskRun) {
  if (!isSmokePrompt(taskRun.task) || !['task', 'smoke-test'].includes(taskRun.source)) {
    return;
  }

  const healthDir = path.join(SANDBOX_ROOT, 'workspace', 'healthcheck');
  const statusPath = path.join(healthDir, 'status.json');
  const logPath = path.join(healthDir, 'log.txt');

  const missing = [];
  if (!fs.existsSync(healthDir)) missing.push('healthcheck directory');
  if (!fs.existsSync(statusPath)) missing.push('healthcheck/status.json');
  if (!fs.existsSync(logPath)) missing.push('healthcheck/log.txt');

  if (missing.length) {
    taskRun.status = 'failed';
    taskRun.exitCode = taskRun.exitCode === 0 ? 2 : taskRun.exitCode;
    appendTaskEvent(taskRun, 'stderr', `Filesystem verification failed: missing ${missing.join(', ')}`);
    appendTaskEvent(taskRun, 'system', 'Filesystem verification verdict: FAIL');
    return;
  }

  try {
    const statusRaw = fs.readFileSync(statusPath, 'utf-8');
    const statusObj = JSON.parse(statusRaw);
    const logRaw = fs.readFileSync(logPath, 'utf-8');

    const checks = Array.isArray(statusObj.checks) ? statusObj.checks.map((v) => String(v).toLowerCase()) : [];
    const acceptedCheckSets = [
      ['write', 'read', 'list', 'append'],
      ['directory_creation', 'file_write', 'append_test']
    ];
    const checksOk = acceptedCheckSets.some((checkSet) => checkSet.every((name) => checks.includes(name)));

    const rootValue = statusObj.writable_root;
    const rootOk = (
      (typeof rootValue === 'string' && rootValue.length > 0) ||
      (typeof rootValue === 'boolean' && rootValue)
    );
    const logOk = logRaw.includes('openclaw smoke test ok');
    const timestampOk = typeof statusObj.timestamp === 'string' && statusObj.timestamp.length > 0;

    if (checksOk && rootOk && logOk && timestampOk) {
      appendTaskEvent(taskRun, 'system', 'Filesystem verification verdict: PASS (healthcheck artifacts confirmed)');
      return;
    }

    taskRun.status = 'failed';
    taskRun.exitCode = taskRun.exitCode === 0 ? 2 : taskRun.exitCode;
    appendTaskEvent(taskRun, 'stderr', 'Filesystem verification failed: artifact content did not match expected smoke-test markers');
    appendTaskEvent(taskRun, 'system', 'Filesystem verification verdict: FAIL');
  } catch (err) {
    taskRun.status = 'failed';
    taskRun.exitCode = taskRun.exitCode === 0 ? 2 : taskRun.exitCode;
    appendTaskEvent(taskRun, 'stderr', `Filesystem verification failed: ${err.message}`);
    appendTaskEvent(taskRun, 'system', 'Filesystem verification verdict: FAIL');
  }
}

function runPythonCheck(args) {
  return spawnSync(venvPython(), args, {
    cwd: __dirname,
    env: {
      ...process.env,
      HOME: SANDBOX_ROOT,
      USERPROFILE: SANDBOX_ROOT,
      HiveForge_CONFIG: CONFIG_PATH,
      PYTHONPATH: OPENCLAW_SRC_ROOT,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
    encoding: 'utf-8'
  });
}

function stopTaskById(taskId) {
  const child = activeTasks.get(taskId);
  if (!child) {
    return false;
  }
  try {
    child.kill();
  } catch (err) {
  }

  const taskRun = taskHistory.find((entry) => entry.id === taskId);
  if (taskRun && taskRun.status === 'running') {
    completeTaskRun(taskRun, 'failed', -1, `Task ${taskId} stopped by user`);
  }
  activeTasks.delete(taskId);
  return true;
}

function latestRunningTaskId() {
  const running = taskHistory.filter((entry) => entry.status === 'running');
  if (!running.length) return null;
  return running[running.length - 1].id;
}

function ensurePythonRuntime(taskRun) {
  if (pythonRuntimeReady) {
    return { ok: true };
  }

  const check = runPythonCheck(['-c', 'import openclaw, requests']);
  if (check.status === 0) {
    pythonRuntimeReady = true;
    return { ok: true };
  }

  appendTaskEvent(taskRun, 'system', 'Runtime check failed; attempting auto-repair for Python dependencies...');

  const install = runPythonCheck(['-m', 'pip', 'install', './openclaw']);
  if (install.status !== 0) {
    const stderr = redactSensitive((install.stderr || '').trim());
    const stdout = redactSensitive((install.stdout || '').trim());
    const details = stderr || stdout || 'Unknown pip install failure';
    appendTaskEvent(taskRun, 'stderr', `Auto-repair failed: ${details}`);
    return {
      ok: false,
      message: `Python runtime auto-repair failed: ${details}`
    };
  }

  const verify = runPythonCheck(['-c', 'import openclaw, requests']);
  if (verify.status !== 0) {
    const details = redactSensitive((verify.stderr || verify.stdout || '').trim()) || 'Unknown verification failure';
    appendTaskEvent(taskRun, 'stderr', `Auto-repair verification failed: ${details}`);
    return {
      ok: false,
      message: `Python runtime verification failed: ${details}`
    };
  }

  pythonRuntimeReady = true;
  appendTaskEvent(taskRun, 'system', 'Python runtime auto-repair completed successfully.');
  return { ok: true };
}

function recordIntegrationTestInHistory(result) {
  const taskRun = createTaskRun(`[integration] ${result.provider} connection test`, 'integration-test', {
    provider: result.provider
  });
  appendTaskEvent(taskRun, 'system', `Integration test started: ${result.provider}`);
  appendTaskEvent(taskRun, result.ok ? 'stdout' : 'stderr', result.message);
  completeTaskRun(
    taskRun,
    result.ok ? 'succeeded' : 'failed',
    result.ok ? 0 : 1,
    `Integration test finished: ${result.provider} (${result.ok ? 'pass' : 'fail'})`
  );
}

function verifyBrowserSmoke(taskRun) {
  if (taskRun.source !== 'smoke-browser') {
    return;
  }

  const hadBrowserToolSuccess = taskRun.events.some((event) =>
    event.type === 'stdout' && event.message.includes('[tool:browser] ok')
  );

  if (!hadBrowserToolSuccess) {
    taskRun.status = 'failed';
    taskRun.exitCode = taskRun.exitCode === 0 ? 3 : taskRun.exitCode;
    appendTaskEvent(taskRun, 'stderr', 'Browser smoke verification failed: no successful browser tool call detected');
    appendTaskEvent(taskRun, 'system', 'Browser smoke verification verdict: FAIL');
    return;
  }

  appendTaskEvent(taskRun, 'system', 'Browser smoke verification verdict: PASS');
}

function exportTaskTranscript(taskRun) {
  const lines = [];
  lines.push(`Task #${taskRun.id}`);
  lines.push(`Source: ${taskRun.source || 'task'}`);
  lines.push(`Prompt: ${taskRun.task}`);
  lines.push(`Status: ${taskRun.status}`);
  lines.push(`Started: ${taskRun.startedAt}`);
  lines.push(`Finished: ${taskRun.finishedAt || ''}`);
  lines.push(`Exit Code: ${taskRun.exitCode}`);
  lines.push('');
  lines.push('Events:');
  taskRun.events.forEach((event) => {
    lines.push(`[${event.ts}] [${event.phase || 'execution'}] [${event.type}] ${event.message}`);
  });
  return lines.join('\n');
}

function handleTask(req, res, body) {
  try {
    const { task } = JSON.parse(body || '{}');
    if (!task) {
      res.writeHead(400);
      res.end('Missing task');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    const { taskRun, child } = runAgentTask(task, res);
    req.on('close', () => {
      if (taskRun.status === 'running' && child) {
        child.kill();
        completeTaskRun(taskRun, 'failed', -1, `Task ${taskRun.id} interrupted by client disconnect`);
      }
    });
  } catch (err) {
    res.writeHead(500);
    res.end(`Task failed: ${err.message}`);
  }
}

function handlePublicKey(res) {
  const pub = path.join(SANDBOX_ROOT, '.ssh', 'id_rsa.pub');
  try {
    const key = fs.readFileSync(pub, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(key);
  } catch (err) {
    res.writeHead(500);
    res.end('Public key not found. Run install.js first.');
  }
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    log('Config missing. Run install.js first.');
    process.exit(1);
  }

  appConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const endpoint = appConfig.llm?.endpoint || 'http://127.0.0.1:1234/v1';
  appState.llm.endpoint = endpoint;
  const ok = await pingLMStudio(endpoint);
  appState.llm.reachable = ok;
  appState.llm.lastCheckedAt = new Date().toISOString();
  if (!ok) {
    log(`Warning: LM Studio is not reachable at ${endpoint}. UI will still start; tasks may fail until LM Studio API is enabled.`);
  }

  loadProjectsFromDisk();

  const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    const pathname = urlObj.pathname;

    if (pathname === '/events' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      if (!projectId || !projectRuntimes.has(projectId)) {
        writeJson(res, { error: 'Unknown projectId for event stream' }, 404);
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(': connected\n\n');
      const set = projectSseClients.get(projectId) || new Set();
      set.add(res);
      projectSseClients.set(projectId, set);
      req.on('close', () => {
        const activeSet = projectSseClients.get(projectId);
        if (activeSet) {
          activeSet.delete(res);
        }
      });
      return;
    }

    if (pathname === '/api/projects' && req.method === 'GET') {
      const projects = Array.from(projectRuntimes.values()).map((runtime) => summarizeProject(runtime.state));
      writeJson(res, projects);
      return;
    }

    if (pathname === '/api/projects' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const name = String(payload.name || '').trim();
        const template = String(payload.template || '').trim();
        if (!name || !template) {
          writeJson(res, { error: 'name and template are required' }, 400);
          return;
        }

        try {
          const project = createProjectFromTemplate({
            name,
            template,
            goal: String(payload.goal || '').trim()
          });
          writeJson(res, project, 201);
        } catch (err) {
          writeJson(res, { error: err.message }, 400);
        }
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname.startsWith('/api/projects/') && req.method === 'DELETE') {
      const projectId = pathname.replace('/api/projects/', '').trim();
      if (!projectId || !projectRuntimes.has(projectId)) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      removeProject(projectId);
      writeJson(res, { ok: true });
      return;
    }

    if (pathname === '/api/agents' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, []);
        return;
      }
      writeJson(res, runtime.state.agents);
      return;
    }

    if (pathname === '/api/agents' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const agentId = String(payload.agentId || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        if (!agentId) {
          writeJson(res, { error: 'agentId is required' }, 400);
          return;
        }

        const newAgent = {
          id: `${agentId}_${Date.now().toString(36)}`,
          name: agentId.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
          role: agentId,
          status: 'idle',
          currentTask: null,
          tasksDone: 0,
          tokens: 0,
          recentLog: ['Added from marketplace'],
          isCoordinator: false
        };
        runtime.state.agents.push(newAgent);
        appendProjectLog(runtime.state, 'message', {
          kind: 'agent_added',
          agentId: newAgent.id,
          role: newAgent.role
        });
        persistProjectState(runtime.state);
        writeJson(res, newAgent, 201);
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname.startsWith('/api/agents/') && req.method === 'DELETE') {
      const agentId = pathname.replace('/api/agents/', '').trim();
      const projectId = urlObj.searchParams.get('projectId') || '';
      const runtime = projectRuntimes.get(projectId);
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      const before = runtime.state.agents.length;
      runtime.state.agents = runtime.state.agents.filter((agent) => agent.id !== agentId || agent.isCoordinator);
      if (runtime.state.agents.length === before) {
        writeJson(res, { error: 'Agent not found or cannot remove coordinator' }, 404);
        return;
      }
      appendProjectLog(runtime.state, 'message', { kind: 'agent_removed', agentId });
      persistProjectState(runtime.state);
      writeJson(res, { ok: true });
      return;
    }

    if (pathname === '/api/tasks' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      writeJson(res, runtime ? runtime.state.tasks : []);
      return;
    }

    if (pathname === '/api/tasks' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const title = String(payload.title || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        if (!title) {
          writeJson(res, { error: 'title is required' }, 400);
          return;
        }

        const task = {
          id: `MANUAL-${Date.now().toString(36)}`,
          title,
          phase: 'manual',
          status: 'backlog',
          assignee: payload.assignee ? String(payload.assignee) : null,
          blockedBy: null,
          dependencies: [],
          createdAt: nowIso(),
          completedAt: null,
          startedAt: null,
          description: String(payload.description || '')
        };
        runtime.state.tasks.push(task);
        appendProjectLog(runtime.state, 'task', { kind: 'task_created', taskId: task.id, title: task.title });
        persistProjectState(runtime.state);
        writeJson(res, task, 201);
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/heartbeat' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, {
          status: 'unknown',
          uptime: '0m',
          lastBeat: null,
          autoFixCount: 0,
          log: []
        });
        return;
      }
      writeJson(res, {
        status: runtime.state.heartbeat.status,
        uptime: projectUptime(runtime.state),
        lastBeat: runtime.state.heartbeat.lastBeat,
        autoFixCount: runtime.state.heartbeat.autoFixCount,
        log: runtime.state.heartbeat.log.slice(0, 50)
      });
      return;
    }

    if (pathname === '/api/heartbeat' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }
        const projectId = String(payload.projectId || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        runProjectHeartbeat(runtime.state, 'manual');
        writeJson(res, { triggered: true, ts: nowIso() });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/credentials' && req.method === 'GET') {
      writeJson(res, readCredentialMetadata());
      return;
    }

    if (pathname === '/api/credentials' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const service = String(payload.service || '').trim();
        const token = String(payload.token || '').trim();
        if (!SUPPORTED_CREDENTIAL_SERVICES.includes(service)) {
          writeJson(res, { error: 'Unsupported credential service' }, 400);
          return;
        }
        if (!token) {
          writeJson(res, { error: 'token is required' }, 400);
          return;
        }
        const budget = typeof payload.budget === 'number' ? payload.budget : null;
        saveCredentialMetadata(service, token, budget);
        writeJson(res, { service, connected: true });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname.startsWith('/api/credentials/') && req.method === 'DELETE') {
      const service = pathname.replace('/api/credentials/', '').trim();
      if (!SUPPORTED_CREDENTIAL_SERVICES.includes(service)) {
        writeJson(res, { error: 'Unsupported credential service' }, 400);
        return;
      }
      deleteCredentialMetadata(service);
      writeJson(res, { ok: true });
      return;
    }

    if (pathname === '/api/analytics' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      writeJson(res, runtime ? makeAnalyticsSnapshot(runtime.state) : { kpi: ['-', '-', '-', '-', '-', '-'], lastUpdated: nowIso() });
      return;
    }

    if (pathname === '/api/logs' && req.method === 'GET') {
      const projectId = urlObj.searchParams.get('projectId');
      const filter = String(urlObj.searchParams.get('filter') || 'all');
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, []);
        return;
      }
      const allLogs = runtime.state.logs || [];
      const out = filter === 'all' ? allLogs : allLogs.filter((entry) => entry.type === filter);
      writeJson(res, out.slice(0, 500));
      return;
    }

    if (pathname === '/api/control' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const action = String(payload.action || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }

        if (action === 'pause') {
          runtime.state.status = 'paused';
          stopProjectLoop(projectId);
          appendProjectLog(runtime.state, 'message', { kind: 'project_paused' });
        } else if (action === 'resume') {
          runtime.state.status = 'running';
          appendProjectLog(runtime.state, 'message', { kind: 'project_resumed' });
          startProjectLoop(projectId);
        } else if (action === 'restart_agents') {
          runtime.state.agents.forEach((agent) => {
            if (agent.isCoordinator) {
              agent.status = 'running';
            } else {
              agent.status = 'idle';
              agent.currentTask = null;
            }
            markAgentLog(agent, 'Restarted by coordinator control');
          });
          appendProjectLog(runtime.state, 'fix', { kind: 'agents_restarted' });
        } else if (action === 'heartbeat') {
          runProjectHeartbeat(runtime.state, 'manual_control');
        } else if (action === 'export') {
          const exportPath = path.join(projectDir(projectId), `export_${Date.now()}.json`);
          fs.writeFileSync(exportPath, `${JSON.stringify(runtime.state, null, 2)}\n`, 'utf-8');
          appendProjectLog(runtime.state, 'message', { kind: 'project_exported', exportPath: path.basename(exportPath) });
        } else if (action === 'delete') {
          removeProject(projectId);
          writeJson(res, { ok: true, action, projectId });
          return;
        } else {
          writeJson(res, { error: `Unsupported action: ${action}` }, 400);
          return;
        }

        persistProjectState(runtime.state);
        writeJson(res, { ok: true, action, projectId });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/llm_health' && req.method === 'GET') {
      const model = (appConfig && appConfig.llm && appConfig.llm.model) || 'lm-studio-local';
      writeJson(res, appState.llm.reachable
        ? { status: 'ok', model, endpoint: appState.llm.endpoint }
        : { status: 'error', message: 'LM Studio not reachable', endpoint: appState.llm.endpoint });
      return;
    }

    if (pathname === '/api/integrations' && req.method === 'GET') {
      const status = integrationStatus();
      writeJson(res, {
        github: Boolean(status.github.configured || status.github.publicKeyPresent),
        clawhub: fs.existsSync(path.join(__dirname, '.clawhub'))
      });
      return;
    }

    if (req.url === '/api/task' && req.method === 'POST') {
      readRequestBody(req).then((body) => handleTask(req, res, body)).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (req.url === '/api/task/smoke' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      const { taskRun, child } = runCanonicalSmokeTest(res);
      req.on('close', () => {
        if (taskRun.status === 'running' && child) {
          child.kill();
          completeTaskRun(taskRun, 'failed', -1, `Task ${taskRun.id} interrupted by client disconnect`);
        }
      });
      return;
    }

    if (req.url === '/api/task/smoke-browser' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      const { taskRun, child } = runCanonicalBrowserSmokeTest(res);
      req.on('close', () => {
        if (taskRun.status === 'running' && child) {
          child.kill();
          completeTaskRun(taskRun, 'failed', -1, `Task ${taskRun.id} interrupted by client disconnect`);
        }
      });
      return;
    }

    if (req.url === '/api/task/stop' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const requested = payload.taskId ? Number(payload.taskId) : null;
        const targetTaskId = Number.isFinite(requested) && requested > 0 ? requested : latestRunningTaskId();
        if (!targetTaskId) {
          writeJson(res, { ok: false, message: 'No running task to stop.' }, 404);
          return;
        }

        const stopped = stopTaskById(targetTaskId);
        writeJson(res, {
          ok: stopped,
          taskId: targetTaskId,
          message: stopped ? `Stopped task ${targetTaskId}.` : `Task ${targetTaskId} is not running.`
        }, stopped ? 200 : 409);
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (req.url === '/api/public-key') {
      handlePublicKey(res);
      return;
    }

    if (req.url === '/api/state') {
      writeJson(res, {
        llm: appState.llm,
        metrics: getMetrics(),
        history: taskHistory.slice().reverse().map(summarizeTask),
        integrations: integrationStatus()
      });
      return;
    }

    if (req.url === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    if (req.url === '/api/llm/check') {
      pingLMStudio(appState.llm.endpoint).then((reachable) => {
        appState.llm.reachable = reachable;
        appState.llm.lastCheckedAt = new Date().toISOString();
        writeJson(res, appState.llm);
      }).catch(() => {
        appState.llm.reachable = false;
        appState.llm.lastCheckedAt = new Date().toISOString();
        writeJson(res, appState.llm);
      });
      return;
    }

    if (req.url === '/api/integrations/test' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        testIntegration(payload.provider).then((result) => {
          recordIntegrationTestInHistory(result);
          writeJson(res, result);
        }).catch((err) => {
          writeJson(res, {
            provider: payload.provider,
            ok: false,
            message: `Integration test failed: ${redactSensitive(err.message)}`,
            testedAt: new Date().toISOString()
          }, 500);
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (req.url === '/api/task/rerun' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = JSON.parse(body || '{}');
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const taskId = Number(payload.taskId);
        const existing = taskHistory.find((entry) => entry.id === taskId);
        if (!existing) {
          writeJson(res, { error: 'Task not found' }, 404);
          return;
        }

        if (existing.source === 'integration-test') {
          const provider = existing.meta && existing.meta.provider;
          testIntegration(provider).then((result) => {
            recordIntegrationTestInHistory(result);
            writeJson(res, {
              ok: true,
              rerunType: 'integration-test',
              result
            });
          }).catch((err) => {
            writeJson(res, {
              ok: false,
              error: redactSensitive(err.message)
            }, 500);
          });
          return;
        }

        const { taskRun } = runAgentTask(existing.task, null);
        writeJson(res, {
          ok: true,
          rerunType: 'task',
          taskId: taskRun.id,
          message: 'Task rerun queued.'
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (req.url && req.url.startsWith('/api/history/') && req.url.endsWith('/export')) {
      const parts = req.url.split('/').filter(Boolean);
      const id = Number(parts[2]);
      const taskRun = taskHistory.find((entry) => entry.id === id);
      if (!taskRun) {
        writeJson(res, { error: 'Task not found' }, 404);
        return;
      }
      const transcript = exportTaskTranscript(taskRun);
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="HiveForge-task-${id}.txt"`
      });
      res.end(transcript);
      return;
    }

    if (req.url && req.url.startsWith('/api/history/')) {
      const id = Number(req.url.split('/').pop());
      const taskRun = taskHistory.find((entry) => entry.id === id);
      if (!taskRun) {
        writeJson(res, { error: 'Task not found' }, 404);
        return;
      }
      writeJson(res, taskRun);
      return;
    }

    if (req.url === '/workspace') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Workspace lives inside /sandbox/workspace within the Pinokio sandbox.');
      return;
    }

    serveStatic(req, res);
  });

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => log(`HiveForge UI running at http://localhost:${port}`));
}

main().catch((err) => {
  log(`Start failed: ${err.message}`);
  process.exit(1);
});
