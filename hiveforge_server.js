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
const CREDENTIAL_POLICIES_ROOT = path.join(CREDENTIALS_ROOT, 'policies');
const CREDENTIAL_AUDIT_LOG_PATH = path.join(CREDENTIALS_ROOT, 'audit.log.ndjson');
const CREDENTIAL_BUDGET_COUNTERS_PATH = path.join(CREDENTIALS_ROOT, 'budget_counters.json');
const AGENTS_RUNTIME_ROOT = path.join(SANDBOX_ROOT, 'agents');
const MESSAGE_BUS_PATH = path.join(AGENTS_RUNTIME_ROOT, 'messages.db');
const PRODUCTION_CERTIFICATION_SCRIPT_PATH = path.join(__dirname, 'scripts', 'production_certification.js');
const MAX_TASK_HISTORY = 100;
const MAX_EVENTS_PER_TASK = 500;
const DEFAULT_RUNTIME_SETTINGS = {
  heartbeatIntervalMs: 30000,
  stallTimeoutMs: 10 * 60 * 1000,
  maxAutoFixes: 5,
  countManualHeartbeatForStall: false,
};
const AUTO_ACTION_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 30 * 1000,
  maxDelayMs: 30 * 60 * 1000,
};
const CONNECTOR_EXECUTION_STALE_MS = 15 * 60 * 1000;
const MAX_CONNECTOR_EXECUTIONS = 2000;
const DEFAULT_CONNECTOR_RETRY_POLICIES = {
  default: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 30 * 60 * 1000 },
  github: { maxAttempts: 2, baseDelayMs: 20 * 1000, maxDelayMs: 10 * 60 * 1000 },
  netlify: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 30 * 60 * 1000 },
  google_ads: { maxAttempts: 4, baseDelayMs: 45 * 1000, maxDelayMs: 45 * 60 * 1000 },
  analytics: { maxAttempts: 3, baseDelayMs: 20 * 1000, maxDelayMs: 20 * 60 * 1000 },
  stripe: { maxAttempts: 2, baseDelayMs: 60 * 1000, maxDelayMs: 60 * 60 * 1000 },
  email_provider: { maxAttempts: 3, baseDelayMs: 30 * 1000, maxDelayMs: 20 * 60 * 1000 },
  telegram: { maxAttempts: 3, baseDelayMs: 15 * 1000, maxDelayMs: 10 * 60 * 1000 },
  whatsapp: { maxAttempts: 3, baseDelayMs: 15 * 1000, maxDelayMs: 10 * 60 * 1000 },
};
const DEFAULT_KPI_GOALS = {
  weeklyTasksDoneTarget: 15,
  maxBacklog: 10,
  maxMonthlySpend: 500,
};
const DEFAULT_RECURRING_SCHEDULE = [
  { key: 'maintenance_health', title: 'Run maintenance health check', phase: 'maintenance', everyMs: 60 * 60 * 1000 },
  { key: 'growth_review', title: 'Review growth metrics and next actions', phase: 'growth', everyMs: 3 * 60 * 60 * 1000 },
];
const RECURRING_SCHEDULE_BY_TEMPLATE = {
  business: [
    { key: 'business_content_cycle', title: 'Create weekly marketing content batch', phase: 'marketing', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'business_pipeline_review', title: 'Review sales pipeline and optimize outreach', phase: 'sales', everyMs: 4 * 60 * 60 * 1000 },
  ],
  software_agency: [
    { key: 'agency_deploy_audit', title: 'Run deployment readiness and rollback audit', phase: 'engineering', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'agency_client_update', title: 'Generate client progress report and roadmap updates', phase: 'operations', everyMs: 4 * 60 * 60 * 1000 },
  ],
  game_studio: [
    { key: 'studio_build_validation', title: 'Run gameplay build validation pass', phase: 'development', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'studio_player_insights', title: 'Review player feedback and balancing priorities', phase: 'analysis', everyMs: 5 * 60 * 60 * 1000 },
  ],
  publishing_house: [
    { key: 'publishing_editorial_cycle', title: 'Plan and assign next editorial content cycle', phase: 'editorial', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'publishing_distribution_check', title: 'Audit distribution channels and update release queue', phase: 'distribution', everyMs: 5 * 60 * 60 * 1000 },
  ],
  music_production: [
    { key: 'music_release_ops', title: 'Prepare release operations and channel sync', phase: 'release', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'music_campaign_review', title: 'Review audience engagement and campaign adjustments', phase: 'marketing', everyMs: 5 * 60 * 60 * 1000 },
  ],
  research_lab: [
    { key: 'research_literature_scan', title: 'Run recurring literature scan and update findings', phase: 'research', everyMs: 6 * 60 * 60 * 1000 },
    { key: 'research_experiment_review', title: 'Review experiment backlog and reprioritize hypotheses', phase: 'analysis', everyMs: 5 * 60 * 60 * 1000 },
  ],
  content_creator: [
    { key: 'creator_content_schedule', title: 'Plan and draft next content publishing batch', phase: 'content', everyMs: 4 * 60 * 60 * 1000 },
    { key: 'creator_engagement_review', title: 'Review engagement metrics and optimize hooks', phase: 'analytics', everyMs: 3 * 60 * 60 * 1000 },
  ],
};
const DEFAULT_OPERATING_MODE_BY_TEMPLATE = {
  business: 'continuous_business',
  software_agency: 'continuous_business',
  content_creator: 'continuous_business',
  game_studio: 'finite_delivery',
  publishing_house: 'finite_delivery',
  music_production: 'finite_delivery',
  research_lab: 'finite_delivery',
};
const DEFAULT_AUTO_STAFFING_POLICY = {
  enabled: true,
  cooldownMs: 60 * 60 * 1000,
  backlogPerAgentThreshold: 2,
  maxOptionalAdds: 3,
};
const DEFAULT_ROLE_CAPABILITIES = {
  'DevOps Automator': { canDeploy: true, canSpend: true, allowedConnectors: ['netlify', 'github'] },
  'Backend Architect': { canDeploy: false, canSpend: false, allowedConnectors: ['github'] },
  'Senior Project Manager': { canDeploy: false, canSpend: false, allowedConnectors: [] },
  'Reality Checker': { canDeploy: false, canSpend: false, allowedConnectors: ['analytics'] },
  'Growth Hacker + Content Creator': { canDeploy: false, canSpend: true, allowedConnectors: ['google_ads', 'analytics'] },
  'Support Responder': { canDeploy: false, canSpend: false, allowedConnectors: ['email_provider'] },
  'Finance Tracker': { canDeploy: false, canSpend: true, allowedConnectors: ['analytics', 'stripe', 'google_ads'] },
};
const OPTIONAL_AGENT_PERSONALITY_PATHS = {
  'Security Engineer': ['../agency-agents/engineering/engineering-security-engineer.md'],
  'Reality Checker': ['../agency-agents/testing/testing-reality-checker.md'],
  'PPC Campaign Strategist': ['../agency-agents/marketing/marketing-ppc-campaign-strategist.md'],
  'Brand Guardian': ['../agency-agents/marketing/marketing-brand-guardian.md'],
  'Legal Compliance Checker': ['../agency-agents/support/support-legal-compliance-checker.md'],
  'SEO Specialist': ['../agency-agents/marketing/marketing-seo-specialist.md'],
  'Analytics Reporter': ['../agency-agents/support/support-analytics-reporter.md'],
  'API Tester': ['../agency-agents/testing/testing-api-tester.md'],
  'Incident Response Commander': ['../agency-agents/support/support-incident-response-commander.md'],
  'Technical Writer': ['../agency-agents/engineering/engineering-technical-writer.md'],
  'Feedback Synthesizer': ['../agency-agents/support/support-feedback-synthesizer.md'],
  'Sprint Prioritizer': ['../agency-agents/project-management/project-manager-sprint-prioritizer.md'],
  'Performance Benchmarker': ['../agency-agents/testing/testing-performance-benchmarker.md'],
  'Narrative Designer': ['../agency-agents/game-development/game-narrative-designer.md'],
  'Level Designer': ['../agency-agents/game-development/game-level-designer.md'],
  'Technical Artist': ['../agency-agents/game-development/game-technical-artist.md'],
  'Paid Social Strategist': ['../agency-agents/marketing/marketing-paid-social-strategist.md'],
  'TikTok Strategist': ['../agency-agents/marketing/marketing-tiktok-strategist.md'],
  'Instagram Curator': ['../agency-agents/marketing/marketing-instagram-curator.md'],
  'LinkedIn Content Creator': ['../agency-agents/marketing/marketing-linkedin-content-creator.md'],
};
const AGENT_PERSONALITY_ROOTS = [
  path.resolve(__dirname, 'agency-agents'),
  path.resolve(__dirname, '..', 'agency-agents'),
  path.resolve(__dirname),
];
const sseClients = new Set();
const projectSseClients = new Map();
const activeTasks = new Map();
const projectRuntimes = new Map();
let pythonRuntimeReady = false;
let sqliteMessageBus = null;

let nextTaskId = 1;
const taskHistory = [];
let appConfig = null;
const appState = {
  llm: {
    endpoint: 'http://127.0.0.1:1234/v1',
    reachable: false,
    model: null,
    lastCheckedAt: null
  }
};

const SUPPORTED_CREDENTIAL_SERVICES = ['github', 'netlify', 'stripe', 'google_ads', 'analytics', 'email_provider'];
const CONNECTOR_REGISTRY = {
  github: { id: 'github', label: 'GitHub', credentialService: 'github' },
  telegram: { id: 'telegram', label: 'Telegram', provider: 'telegram' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', provider: 'whatsapp' },
  netlify: { id: 'netlify', label: 'Netlify', credentialService: 'netlify' },
  stripe: { id: 'stripe', label: 'Stripe', credentialService: 'stripe' },
  google_ads: { id: 'google_ads', label: 'Google Ads', credentialService: 'google_ads' },
  analytics: { id: 'analytics', label: 'Analytics', credentialService: 'analytics' },
  email_provider: { id: 'email_provider', label: 'Email Provider', credentialService: 'email_provider' },
};
const MUTATING_CONNECTOR_OPERATIONS = {
  netlify: new Set(['trigger_deploy']),
};

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeRetryPolicyEntry(entry = {}, fallback = DEFAULT_CONNECTOR_RETRY_POLICIES.default) {
  return {
    maxAttempts: clampInt(entry.maxAttempts, fallback.maxAttempts, 1, 20),
    baseDelayMs: clampInt(entry.baseDelayMs, fallback.baseDelayMs, 1000, 12 * 60 * 60 * 1000),
    maxDelayMs: clampInt(entry.maxDelayMs, fallback.maxDelayMs, 1000, 24 * 60 * 60 * 1000),
  };
}

function retryPoliciesSummary() {
  const configured = (appConfig && appConfig.retryPolicies && typeof appConfig.retryPolicies === 'object')
    ? appConfig.retryPolicies
    : {};
  const merged = {};
  Object.entries(DEFAULT_CONNECTOR_RETRY_POLICIES).forEach(([key, fallback]) => {
    const cfg = configured[key] && typeof configured[key] === 'object' ? configured[key] : {};
    merged[key] = normalizeRetryPolicyEntry(cfg, fallback);
  });

  Object.entries(configured).forEach(([key, cfg]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey || merged[normalizedKey]) return;
    if (!cfg || typeof cfg !== 'object') return;
    merged[normalizedKey] = normalizeRetryPolicyEntry(cfg, DEFAULT_CONNECTOR_RETRY_POLICIES.default);
  });

  return merged;
}

function retryPolicyForConnector(connectorId) {
  const key = String(connectorId || '').trim().toLowerCase();
  const all = retryPoliciesSummary();
  return all[key] || all.default || normalizeRetryPolicyEntry();
}

function applyRetryPoliciesUpdate(partial = {}) {
  if (!partial || typeof partial !== 'object') return;
  appConfig.retryPolicies = appConfig.retryPolicies && typeof appConfig.retryPolicies === 'object'
    ? appConfig.retryPolicies
    : {};
  Object.entries(partial).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey || !value || typeof value !== 'object') return;
    const fallback = DEFAULT_CONNECTOR_RETRY_POLICIES[normalizedKey] || DEFAULT_CONNECTOR_RETRY_POLICIES.default;
    appConfig.retryPolicies[normalizedKey] = normalizeRetryPolicyEntry(value, fallback);
  });
  persistAppConfig();
}

function startOfUtcWeekIso(ts = nowIso()) {
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return nowIso();
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : (1 - day);
  dt.setUTCDate(dt.getUTCDate() + diff);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.toISOString();
}

function ensureDeadLetterState(projectState) {
  if (!Array.isArray(projectState.deadLetters)) {
    projectState.deadLetters = [];
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function connectorExecutionKey(task) {
  const connector = String(task && task.autoAction && task.autoAction.connector ? task.autoAction.connector : '').trim().toLowerCase();
  const operation = String(task && task.autoAction && task.autoAction.operation ? task.autoAction.operation : '').trim().toLowerCase();
  const input = task && task.autoAction && task.autoAction.input && typeof task.autoAction.input === 'object'
    ? task.autoAction.input
    : {};
  const inputHash = crypto.createHash('sha256').update(canonicalJson(input)).digest('hex').slice(0, 16);
  return `${String(task && task.id ? task.id : 'task')}::${connector}::${operation}::${inputHash}`;
}

function connectorMutationExecutionKey(connectorId, operation, input = {}) {
  const connector = String(connectorId || '').trim().toLowerCase();
  const operationKey = String(operation || '').trim().toLowerCase();
  const safeInput = input && typeof input === 'object' ? input : {};
  const inputHash = crypto.createHash('sha256').update(canonicalJson(safeInput)).digest('hex').slice(0, 16);
  return `${connector}::${operationKey}::${inputHash}`;
}

function isMutatingConnectorOperation(connectorId, operation) {
  const connector = String(connectorId || '').trim().toLowerCase();
  const operationKey = String(operation || '').trim().toLowerCase();
  const allowed = MUTATING_CONNECTOR_OPERATIONS[connector];
  return Boolean(allowed && allowed.has(operationKey));
}

function ensureConnectorExecutionState(projectState) {
  if (!projectState.connectorExecutions || typeof projectState.connectorExecutions !== 'object') {
    projectState.connectorExecutions = {};
  }
}

function markConnectorExecutionRecord(projectState, executionKey, patch = {}) {
  ensureConnectorExecutionState(projectState);
  const existing = projectState.connectorExecutions[executionKey] && typeof projectState.connectorExecutions[executionKey] === 'object'
    ? projectState.connectorExecutions[executionKey]
    : {};
  const next = {
    ...existing,
    ...patch,
    executionKey,
    updatedAt: patch.updatedAt || nowIso(),
  };
  projectState.connectorExecutions[executionKey] = next;

  const keys = Object.keys(projectState.connectorExecutions);
  if (keys.length > MAX_CONNECTOR_EXECUTIONS) {
    const sorted = keys
      .map((key) => ({ key, updatedAt: Date.parse(projectState.connectorExecutions[key]?.updatedAt || '') || 0 }))
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const removeCount = Math.max(0, keys.length - MAX_CONNECTOR_EXECUTIONS);
    for (let idx = 0; idx < removeCount; idx += 1) {
      delete projectState.connectorExecutions[sorted[idx].key];
    }
  }

  return next;
}

function ensureKpiGoalState(projectState) {
  if (!projectState.kpiGoals || typeof projectState.kpiGoals !== 'object') {
    projectState.kpiGoals = {
      ...DEFAULT_KPI_GOALS,
      weeklyPlan: {
        weekStart: startOfUtcWeekIso(),
        lastPlannedAt: null,
        nextReviewAt: null,
        summary: null,
      },
    };
  }
  const goals = projectState.kpiGoals;
  goals.weeklyTasksDoneTarget = clampInt(goals.weeklyTasksDoneTarget, DEFAULT_KPI_GOALS.weeklyTasksDoneTarget, 1, 5000);
  goals.maxBacklog = clampInt(goals.maxBacklog, DEFAULT_KPI_GOALS.maxBacklog, 0, 10000);
  goals.maxMonthlySpend = clampNumber(goals.maxMonthlySpend, DEFAULT_KPI_GOALS.maxMonthlySpend, 0, 100000000);
  if (!goals.weeklyPlan || typeof goals.weeklyPlan !== 'object') {
    goals.weeklyPlan = {
      weekStart: startOfUtcWeekIso(),
      lastPlannedAt: null,
      nextReviewAt: null,
      summary: null,
    };
  }
  if (!goals.weeklyPlan.weekStart) goals.weeklyPlan.weekStart = startOfUtcWeekIso();
}

function connectorRetryPlan(connectorId, attemptNumber, reason, detail = {}) {
  if (typeof connectorId === 'number') {
    detail = reason || {};
    reason = attemptNumber;
    attemptNumber = connectorId;
    connectorId = 'default';
  }
  const reasonText = String(reason || detail?.errorCode || '').toLowerCase();
  const retryable = (
    reasonText.includes('timeout')
    || reasonText.includes('timed out')
    || reasonText.includes('econnreset')
    || reasonText.includes('enetdown')
    || reasonText.includes('connect')
    || reasonText.includes('temporar')
    || reasonText.includes('rate limit')
    || reasonText.includes('429')
    || reasonText.includes('5xx')
    || reasonText.includes('http 5')
    || reasonText.includes('execution_failed')
  );
  const nextAttempt = Math.max(1, Number(attemptNumber || 1));
  const policy = retryPolicyForConnector(connectorId);
  const rawDelay = policy.baseDelayMs * Math.pow(2, Math.max(0, nextAttempt - 1));
  return {
    retryable,
    delayMs: Math.min(policy.maxDelayMs, rawDelay),
  };
}

function assessApprovalRisk(task, detail = {}) {
  let score = 15;
  const checks = Array.isArray(detail.checks) ? detail.checks : [];
  const estimatedCost = Number(detail.estimatedCost || task?.autoAction?.estimatedCost || 0);
  const hasPolicyDeny = checks.some((entry) => !entry.ok && (entry.type === 'project_policy' || entry.type === 'budget_cap' || entry.type === 'role_capability' || entry.type === 'role_deploy'));
  const connector = String(detail.connector || task?.autoAction?.connector || '').toLowerCase();
  const operation = String(detail.operation || task?.autoAction?.operation || '').toLowerCase();

  if (hasPolicyDeny) score += 25;
  if (connector === 'netlify' && operation === 'trigger_deploy') score += 20;
  if (connector === 'stripe') score += 18;
  if (connector === 'google_ads') score += 16;
  if (estimatedCost >= 1000) score += 25;
  else if (estimatedCost >= 250) score += 15;
  else if (estimatedCost > 0) score += 8;
  if (String(detail.reason || '').toLowerCase().includes('permission')) score += 8;

  const bounded = Math.max(0, Math.min(100, score));
  let level = 'low';
  if (bounded >= 70) level = 'high';
  else if (bounded >= 40) level = 'medium';
  return { score: bounded, level, requiresHuman: bounded >= 40 };
}

function projectActualMetrics(projectState) {
  const weekStart = startOfUtcWeekIso(nowIso());
  const weekStartMs = Date.parse(weekStart);
  const monthlySpend = Object.values(getCredentialBudgetSnapshot(projectState.id) || {}).reduce((sum, entry) => {
    return sum + (Number(entry && entry.monthlySpent) || 0);
  }, 0);
  const tasksDoneThisWeek = projectState.tasks.filter((task) => {
    if (task.status !== 'done' || !task.completedAt) return false;
    const completedMs = Date.parse(task.completedAt);
    return Number.isFinite(completedMs) && completedMs >= weekStartMs;
  }).length;
  const backlog = projectState.tasks.filter((task) => task.status === 'backlog').length;
  return {
    tasksDoneThisWeek,
    backlog,
    monthlySpend: Number(monthlySpend.toFixed(2)),
  };
}

function computeKpiVarianceAndAlerts(projectState) {
  ensureKpiGoalState(projectState);
  ensureDeadLetterState(projectState);
  const goals = projectState.kpiGoals;
  const actual = projectActualMetrics(projectState);
  const variance = {
    weeklyTasksDone: actual.tasksDoneThisWeek - goals.weeklyTasksDoneTarget,
    backlog: actual.backlog - goals.maxBacklog,
    monthlySpend: Number((actual.monthlySpend - goals.maxMonthlySpend).toFixed(2)),
  };
  const alerts = [];
  if (variance.weeklyTasksDone < 0) {
    alerts.push(`Weekly throughput below target by ${Math.abs(variance.weeklyTasksDone)} tasks.`);
  }
  if (variance.backlog > 0) {
    alerts.push(`Backlog is ${variance.backlog} over the configured limit.`);
  }
  if (variance.monthlySpend > 0) {
    alerts.push(`Monthly spend is $${variance.monthlySpend.toFixed(2)} above target.`);
  }
  if (projectState.deadLetters.length > 0) {
    alerts.push(`${projectState.deadLetters.length} task(s) are in dead-letter queue.`);
  }
  return { goals, actual, variance, alerts };
}

function evaluateAndNotifyKpiAlerts(projectState, ts = nowIso()) {
  const settings = notificationSettingsSummary();
  const kpiAlertsEnabled = settings.kpiAlerts && settings.kpiAlerts.enabled !== false;
  if (!kpiAlertsEnabled) return;

  const insight = computeKpiVarianceAndAlerts(projectState);
  const alerts = Array.isArray(insight.alerts) ? insight.alerts : [];
  const signature = alerts.join(' | ');
  if (!projectState.kpiAlerting || typeof projectState.kpiAlerting !== 'object') {
    projectState.kpiAlerting = {
      lastSentAt: null,
      lastSignature: null,
    };
  }

  if (!alerts.length) {
    projectState.kpiAlerting.lastSignature = null;
    return;
  }

  const nowMs = Date.parse(ts);
  const lastSentMs = Date.parse(projectState.kpiAlerting.lastSentAt || '');
  const cooldownMs = clampInt(settings.kpiAlerts.cooldownMinutes, 120, 1, 7 * 24 * 60) * 60 * 1000;
  const signatureChanged = projectState.kpiAlerting.lastSignature !== signature;
  const cooldownElapsed = Number.isNaN(lastSentMs) || nowMs - lastSentMs >= cooldownMs;
  if (!signatureChanged && !cooldownElapsed) return;

  const summary = `KPI alerts triggered (${alerts.length}): ${alerts.join(' ')}`;
  notifyOperator(projectState, summary, {
    alertCount: alerts.length,
    alerts,
    variance: insight.variance,
    actual: insight.actual,
    goals: {
      weeklyTasksDoneTarget: insight.goals.weeklyTasksDoneTarget,
      maxBacklog: insight.goals.maxBacklog,
      maxMonthlySpend: insight.goals.maxMonthlySpend,
    },
  }).catch(() => {});

  projectState.kpiAlerting.lastSentAt = ts;
  projectState.kpiAlerting.lastSignature = signature;
}

function runtimeSettings() {
  const raw = (appConfig && appConfig.runtime) || {};
  return {
    heartbeatIntervalMs: clampInt(raw.heartbeatIntervalMs, DEFAULT_RUNTIME_SETTINGS.heartbeatIntervalMs, 5000, 10 * 60 * 1000),
    stallTimeoutMs: clampInt(raw.stallTimeoutMs, DEFAULT_RUNTIME_SETTINGS.stallTimeoutMs, 15 * 1000, 24 * 60 * 60 * 1000),
    maxAutoFixes: clampInt(raw.maxAutoFixes, DEFAULT_RUNTIME_SETTINGS.maxAutoFixes, 1, 1000),
    countManualHeartbeatForStall: typeof raw.countManualHeartbeatForStall === 'boolean'
      ? raw.countManualHeartbeatForStall
      : DEFAULT_RUNTIME_SETTINGS.countManualHeartbeatForStall,
  };
}

function persistAppConfig() {
  ensureDir(path.dirname(CONFIG_PATH));
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(appConfig, null, 2)}\n`, 'utf-8');
}

function applyRuntimeSettingsUpdate(partial = {}) {
  const merged = {
    ...runtimeSettings(),
    ...partial,
  };
  appConfig.runtime = {
    heartbeatIntervalMs: clampInt(merged.heartbeatIntervalMs, DEFAULT_RUNTIME_SETTINGS.heartbeatIntervalMs, 5000, 10 * 60 * 1000),
    stallTimeoutMs: clampInt(merged.stallTimeoutMs, DEFAULT_RUNTIME_SETTINGS.stallTimeoutMs, 15 * 1000, 24 * 60 * 60 * 1000),
    maxAutoFixes: clampInt(merged.maxAutoFixes, DEFAULT_RUNTIME_SETTINGS.maxAutoFixes, 1, 1000),
    countManualHeartbeatForStall: typeof merged.countManualHeartbeatForStall === 'boolean'
      ? merged.countManualHeartbeatForStall
      : DEFAULT_RUNTIME_SETTINGS.countManualHeartbeatForStall,
  };
  persistAppConfig();

  // Restart active loops so interval changes apply immediately.
  projectRuntimes.forEach((runtime, projectId) => {
    if (runtime && runtime.state && runtime.state.status === 'running') {
      stopProjectLoop(projectId);
      startProjectLoop(projectId);
    }
  });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeJsonRead(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const normalized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    return JSON.parse(normalized);
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

  const payload = data || {};
  const kind = String(payload.kind || payload.event || '').toLowerCase();
  const hasDecision = typeof payload.approved === 'boolean' || typeof payload.decision === 'string' || typeof payload.error_code === 'string';
  const isPolicyKind = kind === 'skill_response' || kind === 'browser_response' || kind === 'credential_response';
  if (hasDecision || isPolicyKind) {
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'coordinator',
      to: 'policy_engine',
      kind: 'policy_decision',
      payload,
    });
  }

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

function normalizeOperatingMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'continuous_business' || normalized === 'finite_delivery') {
    return normalized;
  }
  return 'finite_delivery';
}

function templateOperatingMode(templateKey, templateData) {
  if (templateData && typeof templateData.operating_mode === 'string') {
    return normalizeOperatingMode(templateData.operating_mode);
  }
  const fallback = DEFAULT_OPERATING_MODE_BY_TEMPLATE[String(templateKey || '').toLowerCase()] || 'finite_delivery';
  return normalizeOperatingMode(fallback);
}

function normalizeRecurringLoopSpec(spec, idx = 0) {
  const key = String(spec && spec.key ? spec.key : `template_loop_${idx + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return {
    key: key || `template_loop_${idx + 1}`,
    title: String(spec && spec.title ? spec.title : `Recurring loop ${idx + 1}`),
    phase: String(spec && spec.phase ? spec.phase : 'maintenance'),
    ownerRole: String(spec && spec.owner_role ? spec.owner_role : ''),
    everyMs: clampInt(spec && spec.every_ms, 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    action: spec && spec.action && typeof spec.action === 'object'
      ? {
          type: String(spec.action.type || '').trim().toLowerCase(),
          connector: String(spec.action.connector || '').trim().toLowerCase(),
          operation: String(spec.action.operation || '').trim(),
          estimatedCost: Number.isFinite(Number(spec.action.estimated_cost)) ? Number(spec.action.estimated_cost) : 0,
          input: spec.action.input && typeof spec.action.input === 'object' ? spec.action.input : {},
          requiresPermission: Boolean(spec.action.requires_permission),
        }
      : null,
  };
}

function recurringScheduleForTemplate(templateKey, templateData = null) {
  const fromTemplate = Array.isArray(templateData && templateData.recurring_loops)
    ? templateData.recurring_loops
      .filter((entry) => entry && entry.enabled !== false)
      .map((entry, idx) => normalizeRecurringLoopSpec(entry, idx))
    : [];
  const templateSchedule = RECURRING_SCHEDULE_BY_TEMPLATE[String(templateKey || '').toLowerCase()] || [];
  const merged = fromTemplate.length ? [...DEFAULT_RECURRING_SCHEDULE, ...fromTemplate] : [...DEFAULT_RECURRING_SCHEDULE, ...templateSchedule];
  return merged.map((entry, idx) => normalizeRecurringLoopSpec({
    key: entry.key,
    title: entry.title,
    phase: entry.phase,
    owner_role: entry.ownerRole,
    every_ms: entry.everyMs,
  }, idx));
}

function templateAutoStaffingPolicy(templateData = null, subordinateCount = 0) {
  const raw = templateData && typeof templateData.auto_staffing_policy === 'object'
    ? templateData.auto_staffing_policy
    : {};
  const maxOptionalAdds = clampInt(
    raw.max_optional_adds,
    DEFAULT_AUTO_STAFFING_POLICY.maxOptionalAdds,
    0,
    20,
  );
  const maxAgents = clampInt(
    raw.max_agents,
    Math.max(subordinateCount + maxOptionalAdds, subordinateCount),
    subordinateCount,
    100,
  );
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_AUTO_STAFFING_POLICY.enabled,
    cooldownMs: clampInt(raw.cooldown_minutes, DEFAULT_AUTO_STAFFING_POLICY.cooldownMs / 60000, 1, 24 * 60) * 60 * 1000,
    backlogPerAgentThreshold: clampInt(raw.backlog_per_agent_threshold, DEFAULT_AUTO_STAFFING_POLICY.backlogPerAgentThreshold, 1, 20),
    maxOptionalAdds,
    maxAgents,
  };
}

function templateRoleCapabilities(templateData = null, agents = []) {
  const capabilities = {};
  agents.forEach((agent) => {
    if (agent.isCoordinator) return;
    const key = String(agent.role || '').trim();
    if (!key) return;
    const defaults = DEFAULT_ROLE_CAPABILITIES[key] || { canDeploy: false, canSpend: false, allowedConnectors: [] };
    capabilities[key] = {
      canDeploy: Boolean(defaults.canDeploy),
      canSpend: Boolean(defaults.canSpend),
      allowedConnectors: Array.isArray(defaults.allowedConnectors) ? [...defaults.allowedConnectors] : [],
    };
  });
  const overrides = templateData && typeof templateData.role_capabilities === 'object'
    ? templateData.role_capabilities
    : {};
  Object.entries(overrides).forEach(([role, cfg]) => {
    if (!cfg || typeof cfg !== 'object') return;
    const base = capabilities[role] || { canDeploy: false, canSpend: false, allowedConnectors: [] };
    capabilities[role] = {
      canDeploy: typeof cfg.can_deploy === 'boolean' ? cfg.can_deploy : base.canDeploy,
      canSpend: typeof cfg.can_spend === 'boolean' ? cfg.can_spend : base.canSpend,
      allowedConnectors: Array.isArray(cfg.allowed_connectors)
        ? cfg.allowed_connectors.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
        : base.allowedConnectors,
    };
  });
  return capabilities;
}

function findRuntimeAgentByRole(projectState, role) {
  const wanted = String(role || '').trim().toLowerCase();
  if (!wanted) return null;
  return projectState.agents.find((agent) => !agent.isCoordinator && String(agent.role || '').trim().toLowerCase() === wanted) || null;
}

function optionalAgentPersonalityPaths(role) {
  const mapped = OPTIONAL_AGENT_PERSONALITY_PATHS[String(role || '')];
  return Array.isArray(mapped) ? [...mapped] : [];
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
    isCoordinator: true,
    personalityPromptPaths: [],
    templateRole: 'Coordinator Agent',
    sourceRole: 'Coordinator Agent',
  });

  const subordinates = Array.isArray(template.subordinate_agents) ? template.subordinate_agents : [];
  subordinates.forEach((agentSpec, idx) => {
    const role = agentSpec.alias || agentSpec.role || `Agent ${idx + 1}`;
    agents.push({
      id: roleToAgentId(role, idx),
      name: role,
      role: role,
      templateRole: String(agentSpec.role || role),
      sourceRole: String(agentSpec.role || role),
      status: 'idle',
      currentTask: null,
      tasksDone: 0,
      tokens: 0,
      recentLog: ['Idle'],
      isCoordinator: false,
      personalityPromptPaths: Array.isArray(agentSpec.personality_prompt_paths)
        ? agentSpec.personality_prompt_paths.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [],
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
    executionState: 'queued',
    retryCount: 0,
    lastFailedAt: null,
    lastError: null,
    lastProgressAt: null,
    executionTaskRunId: null,
    inprogressCycles: 0,
    pendingApproval: null,
    autoActionNotBeforeAt: null,
    deadLetteredAt: null,
    createdAt,
    completedAt: null,
    startedAt: null,
    description: ''
  }));
}

function humanizeDurationMs(ms) {
  const totalMinutes = Math.max(1, Math.round(Number(ms || 0) / 60000));
  if (totalMinutes % (24 * 60) === 0) return `${totalMinutes / (24 * 60)}d`;
  if (totalMinutes % 60 === 0) return `${totalMinutes / 60}h`;
  return `${totalMinutes}m`;
}

function summarizeProjectAutomation(projectState) {
  ensureRecurringState(projectState);
  ensureDeadLetterState(projectState);
  return {
    recurring: {
      enabled: Boolean(projectState.recurring.enabled),
      lastRunAt: projectState.recurring.lastRunAt || {},
      operatingMode: projectState.operatingMode || 'finite_delivery',
    },
    schedule: projectState.recurring.schedule.map((entry) => ({
      ...entry,
      everyHuman: humanizeDurationMs(entry.everyMs),
    })),
    staffing: {
      enabled: Boolean(projectState.staffing && projectState.staffing.enabled),
      optionalPoolSize: Array.isArray(projectState.staffing && projectState.staffing.optionalPool)
        ? projectState.staffing.optionalPool.length
        : 0,
      maxAgents: Number(projectState.staffing && projectState.staffing.maxAgents) || 0,
    },
    deadLetters: {
      count: projectState.deadLetters.length,
    },
  };
}

function ensureRecurringState(projectState) {
  if (!projectState.recurring || typeof projectState.recurring !== 'object') {
    projectState.recurring = { enabled: true, lastRunAt: {}, lastIdleNoticeAt: null };
  }
  if (typeof projectState.recurring.enabled !== 'boolean') {
    projectState.recurring.enabled = true;
  }
  if (!projectState.recurring.lastRunAt || typeof projectState.recurring.lastRunAt !== 'object') {
    projectState.recurring.lastRunAt = {};
  }
  if (!Array.isArray(projectState.recurring.schedule)) {
    projectState.recurring.schedule = recurringScheduleForTemplate(projectState.template);
  }
  if (typeof projectState.recurring.lastIdleNoticeAt === 'undefined') {
    projectState.recurring.lastIdleNoticeAt = null;
  }
}

function ensureStaffingState(projectState) {
  if (!projectState.staffing || typeof projectState.staffing !== 'object') {
    const subordinates = projectState.agents.filter((agent) => !agent.isCoordinator).length;
    projectState.staffing = {
      enabled: DEFAULT_AUTO_STAFFING_POLICY.enabled,
      cooldownMs: DEFAULT_AUTO_STAFFING_POLICY.cooldownMs,
      backlogPerAgentThreshold: DEFAULT_AUTO_STAFFING_POLICY.backlogPerAgentThreshold,
      maxOptionalAdds: DEFAULT_AUTO_STAFFING_POLICY.maxOptionalAdds,
      maxAgents: subordinates + DEFAULT_AUTO_STAFFING_POLICY.maxOptionalAdds,
      baseSubordinateCount: subordinates,
      optionalPool: [],
      lastScaledAt: null,
    };
  }
  if (!Array.isArray(projectState.staffing.optionalPool)) projectState.staffing.optionalPool = [];
  if (typeof projectState.staffing.lastScaledAt === 'undefined') projectState.staffing.lastScaledAt = null;
  if (!Number.isFinite(Number(projectState.staffing.baseSubordinateCount))) {
    projectState.staffing.baseSubordinateCount = projectState.agents.filter((agent) => !agent.isCoordinator).length;
  }
}

function shouldKeepRunningForRecurring(projectState) {
  ensureRecurringState(projectState);
  return projectState.operatingMode === 'continuous_business'
    && Boolean(projectState.recurring.enabled)
    && Array.isArray(projectState.recurring.schedule)
    && projectState.recurring.schedule.length > 0;
}

function hasPendingRecurringTask(projectState, recurringKey) {
  return projectState.tasks.some((task) =>
    task.recurringKey === recurringKey && (task.status === 'backlog' || task.status === 'inprogress')
  );
}

function enqueueRecurringTasks(projectState, ts, source = 'interval') {
  ensureRecurringState(projectState);
  if (!projectState.recurring.enabled) return 0;

  const nowMs = Date.parse(ts || nowIso());
  const schedule = projectState.recurring.schedule;
  let inserted = 0;

  for (const spec of schedule) {
    if (inserted >= 2) break;
    const lastRun = Date.parse(projectState.recurring.lastRunAt[spec.key] || '');
    const due = Number.isNaN(lastRun) || (nowMs - lastRun >= spec.everyMs);
    if (!due) continue;
    if (hasPendingRecurringTask(projectState, spec.key)) continue;

    const task = {
      id: `RECUR-${spec.key}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      title: spec.title,
      phase: spec.phase,
      status: 'backlog',
      assignee: null,
      blockedBy: null,
      dependencies: [],
      recurringKey: spec.key,
      autoAction: spec.action && spec.action.type === 'connector'
        ? {
            type: 'connector',
            connector: spec.action.connector,
            operation: spec.action.operation,
            input: spec.action.input || {},
            estimatedCost: Number(spec.action.estimatedCost || 0),
            actorRole: spec.ownerRole || null,
            requiresPermission: Boolean(spec.action.requiresPermission),
          }
        : null,
      executionState: 'queued',
      retryCount: 0,
      lastFailedAt: null,
      lastError: null,
      lastProgressAt: null,
      executionTaskRunId: null,
      inprogressCycles: 0,
      pendingApproval: null,
      autoActionNotBeforeAt: null,
      deadLetteredAt: null,
      createdAt: ts,
      completedAt: null,
      startedAt: null,
      description: `Recurring task scheduled by coordinator (${source}).`,
    };

    projectState.tasks.push(task);
    projectState.recurring.lastRunAt[spec.key] = ts;
    inserted += 1;

    appendProjectLog(projectState, 'task', {
      kind: 'recurring_task_scheduled',
      taskId: task.id,
      recurringKey: spec.key,
      title: spec.title,
      source,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'coordinator',
      to: 'scheduler',
      kind: 'recurring_task_enqueued',
      payload: {
        taskId: task.id,
        recurringKey: spec.key,
        title: spec.title,
        autoAction: task.autoAction ? {
          type: task.autoAction.type,
          connector: task.autoAction.connector,
          operation: task.autoAction.operation,
          actorRole: task.autoAction.actorRole,
        } : null,
      },
    });
    emitProjectEvent(projectState.id, 'task_update', task);
  }

  return inserted;
}

function agentAlreadyPresent(projectState, roleName) {
  const target = String(roleName || '').toLowerCase();
  return projectState.agents.some((agent) => String(agent.role || '').toLowerCase() === target);
}

function pickAutoStaffingRole(projectState) {
  const pool = Array.isArray(projectState.staffing && projectState.staffing.optionalPool)
    ? projectState.staffing.optionalPool
    : [];
  if (!pool.length) return null;

  const backlogText = projectState.tasks
    .filter((task) => task.status === 'backlog')
    .map((task) => `${task.title || ''} ${task.phase || ''} ${task.description || ''}`.toLowerCase())
    .join(' ');

  const priorities = [
    { role: 'Legal Compliance Checker', keywords: ['legal', 'privacy', 'contract', 'policy', 'compliance'] },
    { role: 'Security Engineer', keywords: ['security', 'incident', 'vulnerability', 'auth', 'breach'] },
    { role: 'SEO Specialist', keywords: ['seo', 'ranking', 'search', 'metadata', 'backlink'] },
    { role: 'Analytics Reporter', keywords: ['analytics', 'kpi', 'roi', 'cohort', 'funnel'] },
    { role: 'PPC Campaign Strategist', keywords: ['ads', 'campaign', 'cac', 'cpc', 'ctr'] },
    { role: 'Reality Checker', keywords: ['qa', 'test', 'verify', 'review', 'audit'] },
  ];

  for (const priority of priorities) {
    if (!pool.includes(priority.role)) continue;
    if (agentAlreadyPresent(projectState, priority.role)) continue;
    const match = priority.keywords.some((kw) => backlogText.includes(kw));
    if (match) return priority.role;
  }

  return pool.find((roleName) => !agentAlreadyPresent(projectState, roleName)) || null;
}

function evaluateAutoStaffing(projectState, ts) {
  ensureStaffingState(projectState);
  const staffing = projectState.staffing;
  if (!staffing.enabled) return null;

  const nowMs = Date.parse(ts || nowIso());
  const lastScaledMs = Date.parse(staffing.lastScaledAt || '');
  if (!Number.isNaN(lastScaledMs) && nowMs - lastScaledMs < staffing.cooldownMs) {
    return null;
  }

  const workers = projectState.agents.filter((agent) => !agent.isCoordinator);
  const backlog = projectState.tasks.filter((task) => task.status === 'backlog').length;
  const running = workers.filter((agent) => agent.status === 'running').length;
  const optionalCount = Math.max(0, workers.length - Number(staffing.baseSubordinateCount || workers.length));
  const shouldScale = backlog >= Math.max(1, workers.length) * staffing.backlogPerAgentThreshold && running >= workers.length;

  if (!shouldScale) return null;
  if (workers.length >= staffing.maxAgents) return null;
  if (optionalCount >= staffing.maxOptionalAdds) return null;

  const role = pickAutoStaffingRole(projectState);
  if (!role) return null;

  const newAgent = {
    id: roleToAgentId(role, projectState.agents.length),
    name: role,
    role,
    templateRole: role,
    sourceRole: role,
    status: 'idle',
    currentTask: null,
    tasksDone: 0,
    tokens: 0,
    recentLog: ['Auto-added by coordinator'],
    isCoordinator: false,
    personalityPromptPaths: optionalAgentPersonalityPaths(role),
  };
  projectState.agents.push(newAgent);
  staffing.lastScaledAt = ts || nowIso();

  appendProjectLog(projectState, 'task', {
    kind: 'agent_auto_added',
    agentId: newAgent.id,
    role: newAgent.role,
    reason: 'backlog_pressure',
    backlog,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: newAgent.id,
    kind: 'agent_auto_added',
    payload: {
      agentId: newAgent.id,
      role: newAgent.role,
      backlog,
      optionalCount: optionalCount + 1,
    },
  });
  emitProjectEvent(projectState.id, 'agent_message', {
    agentId: newAgent.id,
    name: newAgent.name,
    role: newAgent.role,
    status: newAgent.status,
    currentTask: newAgent.currentTask,
    tasksDone: newAgent.tasksDone,
    recentLog: newAgent.recentLog,
  });
  return newAgent;
}

function pickRunnableAutoActionTask(projectState) {
  const done = projectDoneTaskIds(projectState);
  const nowMs = Date.now();
  return projectState.tasks.find((task) => {
    if (task.status !== 'backlog') return false;
    if (!task.autoAction || task.autoAction.type !== 'connector') return false;
    if (task.autoActionNotBeforeAt) {
      const notBeforeMs = Date.parse(task.autoActionNotBeforeAt);
      if (Number.isFinite(notBeforeMs) && nowMs < notBeforeMs) return false;
    }
    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
    return deps.every((depId) => done.has(depId));
  }) || null;
}

function finalizeAutoActionTask(projectState, task, ok, reason, detail = {}) {
  task.status = 'done';
  task.completedAt = nowIso();
  task.executionState = ok ? 'done' : 'failed';
  task.lastError = ok ? null : String(reason || 'auto_action_failed');
  task.lastProgressAt = nowIso();
  task.autoActionNotBeforeAt = null;
  task.pendingApproval = null;
  appendProjectLog(projectState, ok ? 'task' : 'error', {
    kind: ok ? 'recurring_auto_action_completed' : 'recurring_auto_action_failed',
    taskId: task.id,
    recurringKey: task.recurringKey,
    reason,
    detail,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'automation_engine',
    kind: ok ? 'recurring_auto_action_completed' : 'recurring_auto_action_failed',
    payload: {
      taskId: task.id,
      recurringKey: task.recurringKey,
      reason,
      detail,
    },
  });
  emitProjectEvent(projectState.id, 'task_update', task);
}

function sendTaskToDeadLetter(projectState, task, reason, detail = {}) {
  ensureDeadLetterState(projectState);
  ensureConnectorExecutionState(projectState);
  const at = nowIso();
  task.status = 'done';
  task.executionState = 'failed';
  task.completedAt = at;
  task.lastFailedAt = at;
  task.lastProgressAt = at;
  task.lastError = String(reason || 'dead_lettered');
  task.deadLetteredAt = at;
  task.autoActionNotBeforeAt = null;

  const record = {
    taskId: task.id,
    title: task.title,
    recurringKey: task.recurringKey || null,
    connector: task.autoAction?.connector || null,
    operation: task.autoAction?.operation || null,
    retryCount: Number(task.retryCount || 0),
    failedAt: at,
    reason: String(reason || 'dead_lettered'),
    detail,
  };
  projectState.deadLetters.unshift(record);
  if (projectState.deadLetters.length > 200) projectState.deadLetters.length = 200;

  const executionKey = String(detail && detail.executionKey ? detail.executionKey : '').trim();
  if (executionKey) {
    markConnectorExecutionRecord(projectState, executionKey, {
      status: 'dead_lettered',
      lastError: String(reason || 'dead_lettered'),
      deadLetteredAt: at,
    });
  }

  appendProjectLog(projectState, 'error', {
    kind: 'recurring_auto_action_dead_lettered',
    ...record,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'dlq',
    kind: 'task_dead_lettered',
    payload: record,
  });
  emitProjectEvent(projectState.id, 'task_update', task);
}

function scheduleAutoActionRetry(projectState, task, reason, detail = {}) {
  const nextRetryCount = Number(task.retryCount || 0) + 1;
  const connectorId = String(task && task.autoAction && task.autoAction.connector ? task.autoAction.connector : '').trim().toLowerCase();
  const retryPlan = connectorRetryPlan(connectorId, nextRetryCount, reason, detail);
  const policy = retryPolicyForConnector(connectorId);
  if (!retryPlan.retryable || nextRetryCount > policy.maxAttempts) {
    sendTaskToDeadLetter(projectState, task, reason, detail);
    return false;
  }

  const at = nowIso();
  const notBeforeAt = new Date(Date.now() + retryPlan.delayMs).toISOString();
  task.status = 'backlog';
  task.executionState = 'queued';
  task.assignee = null;
  task.startedAt = null;
  task.inprogressCycles = 0;
  task.retryCount = nextRetryCount;
  task.lastFailedAt = at;
  task.lastProgressAt = at;
  task.lastError = String(reason || 'retry_scheduled');
  task.autoActionNotBeforeAt = notBeforeAt;

  appendProjectLog(projectState, 'fix', {
    kind: 'recurring_auto_action_retry_scheduled',
    taskId: task.id,
    recurringKey: task.recurringKey,
    reason,
    retryCount: nextRetryCount,
    retryDelayMs: retryPlan.delayMs,
    notBeforeAt,
    detail,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'automation_engine',
    kind: 'recurring_auto_action_retry_scheduled',
    payload: {
      taskId: task.id,
      reason,
      retryCount: nextRetryCount,
      retryDelayMs: retryPlan.delayMs,
      notBeforeAt,
    },
  });
  emitProjectEvent(projectState.id, 'task_update', task);
  return true;
}

function executeRecurringAutoAction(projectState, task, source = 'interval') {
  const runtime = projectRuntimes.get(projectState.id);
  if (!runtime || runtime.execution || runtime.recurringAction) {
    return false;
  }
  const action = task.autoAction;
  if (!action || action.type !== 'connector') {
    return false;
  }

  ensureConnectorExecutionState(projectState);
  const executionKey = connectorExecutionKey(task);
  const previousExecution = projectState.connectorExecutions[executionKey] || null;
  if (previousExecution && previousExecution.status === 'succeeded') {
    finalizeAutoActionTask(projectState, task, true, previousExecution.message || 'idempotent_replay_success', {
      connector: action.connector,
      operation: action.operation,
      source,
      idempotentReplay: true,
      executionKey,
      originalCompletedAt: previousExecution.completedAt || null,
    });
    persistProjectState(projectState);
    return true;
  }

  if (previousExecution && previousExecution.status === 'running') {
    const startedMs = Date.parse(previousExecution.startedAt || previousExecution.updatedAt || '');
    if (Number.isFinite(startedMs) && (Date.now() - startedMs) < CONNECTOR_EXECUTION_STALE_MS) {
      return false;
    }
    markConnectorExecutionRecord(projectState, executionKey, {
      status: 'stale_running',
      staleAt: nowIso(),
      message: 'Marked stale after runtime recovery timeout.',
    });
  }

  const actorRole = String(action.actorRole || '').trim();
  const actor = actorRole ? findRuntimeAgentByRole(projectState, actorRole) : null;
  task.status = 'inprogress';
  task.assignee = actor ? actor.id : null;
  task.startedAt = nowIso();
  task.executionState = 'running';
  task.lastProgressAt = task.startedAt;
  emitProjectEvent(projectState.id, 'task_update', task);

  runtime.recurringAction = {
    taskId: task.id,
    startedAt: task.startedAt,
    connector: action.connector,
    operation: action.operation,
    actorRole,
    executionKey,
  };

  markConnectorExecutionRecord(projectState, executionKey, {
    taskId: task.id,
    connector: String(action.connector || '').trim().toLowerCase(),
    operation: String(action.operation || '').trim().toLowerCase(),
    status: 'running',
    startedAt: task.startedAt,
    attempts: Number(previousExecution && previousExecution.attempts || 0) + 1,
    source,
    lastError: null,
  });

  executeConnectorPolicy(action.connector, {
    dryRun: false,
    projectId: projectState.id,
    estimatedCost: Number(action.estimatedCost || 0),
    actorRole,
    operation: action.operation,
  }).then(async (policyResult) => {
    if (!policyResult.ok) {
      const needsPermission = Boolean(action.requiresPermission);
      if (needsPermission) {
        await notifyOperator(projectState, `Permission needed for ${action.connector}:${action.operation}`, {
          taskId: task.id,
          actorRole,
          reason: policyResult.reason,
          checks: policyResult.checks,
        });
        markTaskAwaitingApproval(projectState, task, policyResult.reason, {
          connector: action.connector,
          operation: action.operation,
          actorRole,
          source,
          requiresPermission: true,
          checks: policyResult.checks,
          executionKey,
        });
        markConnectorExecutionRecord(projectState, executionKey, {
          status: 'awaiting_approval',
          lastError: policyResult.reason,
          checks: policyResult.checks,
        });
        persistProjectState(projectState);
        return;
      }
      scheduleAutoActionRetry(projectState, task, policyResult.reason, {
        connector: action.connector,
        operation: action.operation,
        actorRole,
        source,
        requiresPermission: needsPermission,
        checks: policyResult.checks,
        executionKey,
      });
      markConnectorExecutionRecord(projectState, executionKey, {
        status: 'failed',
        lastError: policyResult.reason,
      });
      persistProjectState(projectState);
      return;
    }

    const execution = await executeLiveConnector(action.connector, {
      operation: action.operation,
      input: action.input || {},
      projectId: projectState.id,
      estimatedCost: Number(action.estimatedCost || 0),
      idempotencyKey: executionKey,
    });

    if (!execution.ok) {
      const failureReason = execution.message || execution.errorCode || 'execution_failed';
      scheduleAutoActionRetry(projectState, task, failureReason, {
        connector: action.connector,
        operation: action.operation,
        actorRole,
        source,
        errorCode: execution.errorCode || null,
        executionKey,
      });
      markConnectorExecutionRecord(projectState, executionKey, {
        status: 'failed',
        lastError: failureReason,
      });
      persistProjectState(projectState);
      return;
    }

    const actualCost = Number.isFinite(Number(execution.actualCost)) ? Number(execution.actualCost) : Number(action.estimatedCost || 0);
    if (actualCost > 0 && policyResult.credentialService) {
      recordCredentialSpend(projectState.id, policyResult.credentialService, actualCost, nowIso());
    }

    finalizeAutoActionTask(projectState, task, true, execution.message || 'ok', {
      connector: action.connector,
      operation: action.operation,
      actorRole,
      source,
      actualCost,
      executionKey,
    });
    markConnectorExecutionRecord(projectState, executionKey, {
      status: 'succeeded',
      message: execution.message || 'ok',
      completedAt: nowIso(),
      actualCost,
      result: execution.data || null,
    });
    persistProjectState(projectState);
  }).catch(async (err) => {
    const errMsg = redactSensitive(err.message);
    await notifyOperator(projectState, `Auto action error on ${action.connector}:${action.operation}`, {
      taskId: task.id,
      actorRole,
      reason: errMsg,
    });
    scheduleAutoActionRetry(projectState, task, errMsg, {
      connector: action.connector,
      operation: action.operation,
      actorRole,
      source,
      executionKey,
    });
    markConnectorExecutionRecord(projectState, executionKey, {
      status: 'failed',
      lastError: errMsg,
    });
    persistProjectState(projectState);
  }).finally(() => {
    const rt = projectRuntimes.get(projectState.id);
    if (rt) rt.recurringAction = null;
  });

  appendProjectLog(projectState, 'task', {
    kind: 'recurring_auto_action_started',
    taskId: task.id,
    connector: action.connector,
    operation: action.operation,
    actorRole,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: actor ? actor.id : 'automation_engine',
    kind: 'recurring_auto_action_started',
    payload: {
      taskId: task.id,
      connector: action.connector,
      operation: action.operation,
      actorRole,
      source,
    },
  });

  persistProjectState(projectState);
  return true;
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
    currentTask: inProgress ? inProgress.title : null,
    completedAt: projectState.completedAt || null,
    failedAt: projectState.failedAt || null
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

function normalizeConnectorId(value) {
  return String(value || '').trim().toLowerCase();
}

function taskCapabilityRequirements(task) {
  const title = String(task && task.title ? task.title : '').toLowerCase();
  const phase = String(task && task.phase ? task.phase : '').toLowerCase();
  const req = {
    requiredRole: String(task && task.requiredRole ? task.requiredRole : '').trim() || null,
    connector: null,
    canDeploy: false,
    canSpend: false,
  };

  if (task && task.autoAction && task.autoAction.type === 'connector') {
    req.connector = normalizeConnectorId(task.autoAction.connector);
    req.requiredRole = req.requiredRole || String(task.autoAction.actorRole || '').trim() || null;
    req.canDeploy = req.connector === 'netlify' && String(task.autoAction.operation || '').toLowerCase() === 'trigger_deploy';
    req.canSpend = Number(task.autoAction.estimatedCost || 0) > 0;
    return req;
  }

  const looksLikeDeploy = phase.includes('deploy') || phase.includes('release') || title.includes('deploy') || title.includes('release') || title.includes('launch');
  if (looksLikeDeploy) req.canDeploy = true;
  return req;
}

function roleCapabilitiesFor(projectState, role) {
  const roleName = String(role || '').trim();
  const caps = projectState && projectState.roleCapabilities && typeof projectState.roleCapabilities === 'object'
    ? projectState.roleCapabilities[roleName]
    : null;
  return caps || { canDeploy: false, canSpend: false, allowedConnectors: [] };
}

function agentCanHandleTask(projectState, agent, task) {
  if (!agent || agent.isCoordinator || !task) return false;
  const req = taskCapabilityRequirements(task);
  const agentRole = String(agent.role || '').trim();
  const caps = roleCapabilitiesFor(projectState, agentRole);

  if (req.requiredRole && agentRole.toLowerCase() !== String(req.requiredRole).toLowerCase()) {
    return false;
  }
  if (req.connector) {
    const allowed = Array.isArray(caps.allowedConnectors)
      ? caps.allowedConnectors.map((entry) => normalizeConnectorId(entry))
      : [];
    if (!allowed.includes(req.connector)) {
      return false;
    }
  }
  if (req.canDeploy && !caps.canDeploy) {
    return false;
  }
  if (req.canSpend && !caps.canSpend) {
    return false;
  }
  return true;
}

function pickWorkerAgent(projectState, task = null) {
  const candidates = projectState.agents.filter((agent) => !agent.isCoordinator);
  if (!candidates.length) return null;
  const eligible = task ? candidates.filter((agent) => agentCanHandleTask(projectState, agent, task)) : candidates;
  if (!eligible.length) return null;
  const index = projectState.heartbeat?.cycleCount ? projectState.heartbeat.cycleCount % eligible.length : 0;
  return eligible[index];
}

function markTaskAwaitingApproval(projectState, task, reason, detail = {}) {
  const at = nowIso();
  const risk = assessApprovalRisk(task, { ...detail, reason });
  task.status = 'review';
  task.executionState = 'awaiting_approval';
  task.lastError = String(reason || 'approval_required');
  task.lastProgressAt = at;
  task.pendingApproval = {
    requestedAt: at,
    reason: String(reason || 'approval_required'),
    risk,
    detail,
  };
  appendProjectLog(projectState, 'task', {
    kind: 'task_awaiting_approval',
    taskId: task.id,
    reason,
    risk,
    detail,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'operator',
    kind: 'task_awaiting_approval',
    payload: {
      taskId: task.id,
      title: task.title,
      reason,
      risk,
      detail,
    },
  });
  emitProjectEvent(projectState.id, 'task_update', task);
}

function applyTaskApprovalDecision(projectState, task, decision, note = '', actor = 'operator') {
  const decidedAt = nowIso();
  const priorPending = task.pendingApproval || {};
  task.pendingApproval = {
    ...priorPending,
    decision,
    decidedAt,
    note: note || null,
  };

  if (decision === 'approve') {
    if (task.autoAction && task.autoAction.type === 'connector') {
      task.autoAction.requiresPermission = false;
    }
    task.status = 'backlog';
    task.executionState = 'queued';
    task.lastError = null;
    task.lastProgressAt = decidedAt;
    task.assignee = null;
    task.startedAt = null;
    task.inprogressCycles = 0;
    appendProjectLog(projectState, 'task', {
      kind: 'task_approval_granted',
      taskId: task.id,
      note,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: actor,
      to: 'coordinator',
      kind: 'task_approval_granted',
      payload: { taskId: task.id, note: note || null },
    });
  } else {
    task.status = 'done';
    task.executionState = 'failed';
    task.lastError = note || 'approval_denied';
    task.lastFailedAt = decidedAt;
    task.lastProgressAt = decidedAt;
    task.completedAt = decidedAt;
    appendProjectLog(projectState, 'task', {
      kind: 'task_approval_denied',
      taskId: task.id,
      note,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: actor,
      to: 'coordinator',
      kind: 'task_approval_denied',
      payload: { taskId: task.id, note: note || null },
    });
  }

  emitProjectEvent(projectState.id, 'task_update', task);
  return task;
}

function markAgentLog(agent, message) {
  const line = `${new Date().toISOString().slice(11, 19)} ${message}`;
  agent.recentLog = Array.isArray(agent.recentLog) ? agent.recentLog : [];
  agent.recentLog.unshift(line);
  if (agent.recentLog.length > 10) {
    agent.recentLog.length = 10;
  }
}

function ensureMessageBus() {
  ensureDir(AGENTS_RUNTIME_ROOT);
  if (sqliteMessageBus) return;

  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(MESSAGE_BUS_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_bus (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        project_id TEXT,
        from_actor TEXT,
        to_actor TEXT,
        kind TEXT,
        payload_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_message_bus_project_ts ON message_bus(project_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_message_bus_ts ON message_bus(ts DESC);
    `);
    sqliteMessageBus = db;
    return;
  } catch (err) {
    sqliteMessageBus = null;
  }

  if (!fs.existsSync(MESSAGE_BUS_PATH)) {
    fs.writeFileSync(MESSAGE_BUS_PATH, '', 'utf-8');
  }
}

function appendMessageBusEntry({ projectId, from, to, kind, payload = {} }) {
  ensureMessageBus();
  const entry = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    projectId: String(projectId || ''),
    from: String(from || 'unknown'),
    to: String(to || 'unknown'),
    kind: String(kind || 'message'),
    payload,
  };
  if (sqliteMessageBus) {
    try {
      const stmt = sqliteMessageBus.prepare(`
        INSERT INTO message_bus (id, ts, project_id, from_actor, to_actor, kind, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        entry.id,
        entry.ts,
        entry.projectId,
        entry.from,
        entry.to,
        entry.kind,
        JSON.stringify(entry.payload || {})
      );
    } catch (err) {
      // SQLite may return ERR_SQLITE_ERROR/"database is locked" under parallel
      // test workers. Message-bus durability is best-effort in that edge case.
      const msg = String(err && err.message ? err.message : '').toLowerCase();
      if (!msg.includes('database is locked')) {
        throw err;
      }
    }
    return entry;
  }

  fs.appendFileSync(MESSAGE_BUS_PATH, `${JSON.stringify(entry)}\n`, 'utf-8');
  return entry;
}

function readMessageBusEntries(projectId, limit = 200, filters = {}) {
  ensureMessageBus();
  const max = clampInt(limit, 200, 1, 2000);
  const kind = String(filters.kind || '').trim().toLowerCase();
  const actor = String(filters.actor || '').trim().toLowerCase();
  const query = String(filters.query || '').trim().toLowerCase();

  if (sqliteMessageBus) {
    const where = [];
    const values = [];
    if (projectId) {
      where.push('project_id = ?');
      values.push(String(projectId));
    }
    if (kind) {
      where.push('kind = ?');
      values.push(kind);
    }
    if (actor) {
      where.push('(LOWER(from_actor) LIKE ? OR LOWER(to_actor) LIKE ?)');
      values.push(`%${actor}%`, `%${actor}%`);
    }
    if (query) {
      where.push('(LOWER(kind) LIKE ? OR LOWER(from_actor) LIKE ? OR LOWER(to_actor) LIKE ? OR LOWER(payload_json) LIKE ?)');
      values.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }
    const sql = `
      SELECT id, ts, project_id, from_actor, to_actor, kind, payload_json
      FROM message_bus
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ts DESC
      LIMIT ?
    `;
    values.push(max);
    const stmt = sqliteMessageBus.prepare(sql);
    return stmt.all(...values).map((row) => ({
      id: row.id,
      ts: row.ts,
      projectId: row.project_id,
      from: row.from_actor,
      to: row.to_actor,
      kind: row.kind,
      payload: safeJsonReadFromText(row.payload_json, {}),
    }));
  }

  const raw = fs.readFileSync(MESSAGE_BUS_PATH, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const out = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (out.length >= max) break;
    try {
      const entry = JSON.parse(lines[i]);
      if (projectId && entry.projectId !== projectId) continue;
      if (kind && String(entry.kind || '').toLowerCase() !== kind) continue;
      if (actor) {
        const fromMatch = String(entry.from || '').toLowerCase().includes(actor);
        const toMatch = String(entry.to || '').toLowerCase().includes(actor);
        if (!fromMatch && !toMatch) continue;
      }
      if (query) {
        const haystack = JSON.stringify(entry).toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      out.push(entry);
    } catch (err) {
    }
  }
  return out;
}

function safeJsonReadFromText(raw, fallback = {}) {
  try {
    if (typeof raw !== 'string') return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

// ── Shared task-requeue helper ────────────────────────────────────────────
// All code paths that return a task to backlog must use this so fields stay
// consistent and debug metadata (lastError, lastFailedAt) is preserved.
function requeueTaskToBacklog(task, reason = 'requeued', bumpRetry = true) {
  task.status = 'backlog';
  task.assignee = null;
  task.startedAt = null;
  task.executionState = 'queued';
  task.inprogressCycles = 0;
  task.executionTaskRunId = null;
  task.lastProgressAt = null;
  if (bumpRetry) {
    task.retryCount = Number(task.retryCount || 0) + 1;
    task.lastFailedAt = nowIso();
    task.lastError = reason;
  }
}

function cancelProjectExecution(projectId, reason = 'cancelled', requeueTask = true) {
  const runtime = projectRuntimes.get(projectId);
  if (!runtime || !runtime.execution) return false;

  const execution = runtime.execution;
  runtime.execution = null;

  if (execution.child) {
    try {
      execution.child.kill();
    } catch (err) {
    }
  }

  const task = runtime.state.tasks.find((t) => t.id === execution.taskId);
  if (task && task.status === 'inprogress') {
    if (requeueTask) {
      requeueTaskToBacklog(task, reason, false);
    }
    emitProjectEvent(projectId, 'task_update', task);
  }

  const worker = runtime.state.agents.find((a) => a.id === execution.agentId);
  if (worker) {
    worker.status = 'idle';
    worker.currentTask = null;
    markAgentLog(worker, `Execution cancelled (${reason})`);
    emitProjectEvent(projectId, 'agent_message', {
      agentId: worker.id,
      name: worker.name,
      role: worker.role,
      status: worker.status,
      currentTask: worker.currentTask,
      tasksDone: worker.tasksDone,
      recentLog: worker.recentLog,
    });
  }

  appendProjectLog(runtime.state, 'message', {
    kind: 'task_execution_cancelled',
    reason,
    taskId: execution.taskId,
    agentId: execution.agentId,
  });
  appendMessageBusEntry({
    projectId,
    from: 'coordinator',
    to: execution.agentId || 'unknown',
    kind: 'execution_cancelled',
    payload: { reason, taskId: execution.taskId },
  });
  persistProjectState(runtime.state);
  return true;
}

function finalizeProjectTaskExecution(projectId, taskId, taskRunId, exitCode) {
  const runtime = projectRuntimes.get(projectId);
  if (!runtime || !runtime.execution) return;
  if (runtime.execution.taskRunId !== taskRunId || runtime.execution.taskId !== taskId) return;

  const settings = runtimeSettings();
  const execution = runtime.execution;
  runtime.execution = null;

  const task = runtime.state.tasks.find((t) => t.id === taskId);
  if (!task || task.status !== 'inprogress') return;

  const worker = runtime.state.agents.find((a) => a.id === task.assignee);
  if (exitCode === 0) {
    task.status = 'done';
    task.completedAt = nowIso();
    task.executionState = 'done';
    task.inprogressCycles = 0;
    task.executionTaskRunId = null;
    task.lastError = null;

    if (worker) {
      worker.status = 'idle';
      worker.currentTask = null;
      worker.tasksDone = Number(worker.tasksDone || 0) + 1;
      markAgentLog(worker, `Completed ${task.id}`);
      emitProjectEvent(projectId, 'agent_message', {
        agentId: worker.id,
        name: worker.name,
        role: worker.role,
        status: worker.status,
        currentTask: null,
        tasksDone: worker.tasksDone,
        recentLog: worker.recentLog,
      });
    }

    appendProjectLog(runtime.state, 'task', {
      kind: 'task_completed',
      taskId: task.id,
      title: task.title,
      assignee: execution.agentId,
      source: 'agent_execution',
    });
    appendMessageBusEntry({
      projectId,
      from: execution.agentId || 'unknown',
      to: 'coordinator',
      kind: 'task_completed',
      payload: { taskId: task.id, taskRunId, exitCode },
    });
    emitProjectEvent(projectId, 'task_update', task);

    const allDone = runtime.state.tasks.length > 0 && runtime.state.tasks.every((t) => t.status === 'done');
    if (allDone && !shouldKeepRunningForRecurring(runtime.state)) {
      markProjectCompleted(runtime.state);
      return;
    }
  } else {
    requeueTaskToBacklog(task, `exit_code_${exitCode}`, true);
    runtime.state.heartbeat.autoFixCount = (runtime.state.heartbeat.autoFixCount || 0) + 1;

    if (worker) {
      worker.status = 'idle';
      worker.currentTask = null;
      markAgentLog(worker, `Execution failed for ${task.id} (exit ${exitCode})`);
      emitProjectEvent(projectId, 'agent_message', {
        agentId: worker.id,
        name: worker.name,
        role: worker.role,
        status: worker.status,
        currentTask: null,
        tasksDone: worker.tasksDone,
        recentLog: worker.recentLog,
      });
    }

    appendProjectLog(runtime.state, 'fix', {
      kind: 'task_execution_failed_requeued',
      taskId: task.id,
      exitCode,
      autoFixCount: runtime.state.heartbeat.autoFixCount,
    });
    appendMessageBusEntry({
      projectId,
      from: execution.agentId || 'unknown',
      to: 'coordinator',
      kind: 'task_failed',
      payload: { taskId: task.id, taskRunId, exitCode },
    });
    emitProjectEvent(projectId, 'task_update', task);

    if (runtime.state.heartbeat.autoFixCount >= settings.maxAutoFixes) {
      markProjectFailed(runtime.state);
      return;
    }
  }

  persistProjectState(runtime.state);
}

function loadAgentPersonalityPrompt(paths) {
  if (!Array.isArray(paths) || !paths.length) return '';
  const snippets = [];
  paths.forEach((entry) => {
    const rel = String(entry || '').trim();
    if (!rel) return;
    const resolved = path.resolve(__dirname, rel);
    const allowed = AGENT_PERSONALITY_ROOTS.some((root) => resolved.startsWith(root));
    if (!allowed || !fs.existsSync(resolved)) return;
    try {
      const text = fs.readFileSync(resolved, 'utf-8').trim();
      if (!text) return;
      snippets.push(`# Personality Source: ${path.basename(resolved)}\n${text.slice(0, 12000)}`);
    } catch (err) {
    }
  });
  return snippets.join('\n\n');
}

function startProjectTaskExecution(projectState, task, assignee) {
  const runtime = projectRuntimes.get(projectState.id);
  if (!runtime || runtime.execution) return false;

  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: assignee.id,
    kind: 'task_assigned',
    payload: {
      taskId: task.id,
      title: task.title,
      projectName: projectState.name,
    },
  });

  const personalityPrompt = loadAgentPersonalityPrompt(assignee.personalityPromptPaths);
  const prompt = [
    `Project: ${projectState.name}`,
    `Goal: ${projectState.goal || 'N/A'}`,
    `Assigned Agent Role: ${assignee.role}`,
    `Task ${task.id}: ${task.title}`,
    personalityPrompt ? `Agent Personality Guidance:\n${personalityPrompt}` : '',
    'Execute the task and provide concrete output artifacts or decisions. End with TASK_DONE when complete.'
  ].filter(Boolean).join('\n\n');

  const { taskRun, child } = runAgentTask(prompt, null);
  if (!child) {
    return false;
  }

  runtime.execution = {
    taskId: task.id,
    taskRunId: taskRun.id,
    agentId: assignee.id,
    child,
    startedAt: nowIso(),
    lastProgressAt: nowIso(),
    progressChunks: 0,
  };
  task.executionTaskRunId = taskRun.id;
  task.executionState = 'running';
  task.lastProgressAt = runtime.execution.lastProgressAt;
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: assignee.id,
    kind: 'task_started',
    payload: {
      taskId: task.id,
      taskRunId: taskRun.id,
      title: task.title,
    },
  });

  child.stdout.on('data', (chunk) => {
    const rt = projectRuntimes.get(projectState.id);
    if (rt && rt.execution && rt.execution.taskRunId === taskRun.id) {
      rt.execution.lastProgressAt = nowIso();
      rt.execution.progressChunks = Number(rt.execution.progressChunks || 0) + 1;
      const active = rt.state.tasks.find((t) => t.id === task.id);
      if (active) {
        active.lastProgressAt = rt.execution.lastProgressAt;
        emitProjectEvent(projectState.id, 'task_update', active);
      }
      if (rt.execution.progressChunks === 1 || rt.execution.progressChunks % 5 === 0) {
        appendMessageBusEntry({
          projectId: projectState.id,
          from: assignee.id,
          to: 'coordinator',
          kind: 'task_progress',
          payload: {
            taskId: task.id,
            taskRunId: taskRun.id,
            stream: 'stdout',
            chunkSize: String(chunk || '').length,
            progressChunks: rt.execution.progressChunks,
          },
        });
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    const rt = projectRuntimes.get(projectState.id);
    if (rt && rt.execution && rt.execution.taskRunId === taskRun.id) {
      rt.execution.lastProgressAt = nowIso();
      rt.execution.progressChunks = Number(rt.execution.progressChunks || 0) + 1;
      const active = rt.state.tasks.find((t) => t.id === task.id);
      if (active) {
        active.lastProgressAt = rt.execution.lastProgressAt;
        emitProjectEvent(projectState.id, 'task_update', active);
      }
      if (rt.execution.progressChunks === 1 || rt.execution.progressChunks % 5 === 0) {
        appendMessageBusEntry({
          projectId: projectState.id,
          from: assignee.id,
          to: 'coordinator',
          kind: 'task_progress',
          payload: {
            taskId: task.id,
            taskRunId: taskRun.id,
            stream: 'stderr',
            chunkSize: String(chunk || '').length,
            progressChunks: rt.execution.progressChunks,
          },
        });
      }
    }
  });
  child.on('close', (code) => {
    finalizeProjectTaskExecution(projectState.id, task.id, taskRun.id, code);
  });

  return true;
}

function markProjectCompleted(projectState) {
  projectState.status = 'completed';
  projectState.completedAt = nowIso();
  projectState.heartbeat.status = 'completed';
  projectState.agents.forEach((agent) => {
    if (!agent.isCoordinator) {
      agent.status = 'idle';
      agent.currentTask = null;
      markAgentLog(agent, 'Project completed');
    } else {
      markAgentLog(agent, 'All tasks complete — project finished');
    }
  });
  appendProjectLog(projectState, 'message', { kind: 'project_completed', tasksTotal: projectState.tasks.length });
  emitProjectEvent(projectState.id, 'project_status', { status: 'completed', projectId: projectState.id });
  stopProjectLoop(projectState.id);
  persistProjectState(projectState);
}

function markProjectFailed(projectState) {
  projectState.status = 'failed';
  projectState.failedAt = nowIso();
  projectState.heartbeat.status = 'failed';
  projectState.agents.forEach((agent) => {
    if (!agent.isCoordinator) {
      agent.status = 'error';
      markAgentLog(agent, 'Project failed — max auto-fixes reached');
    }
  });
  appendProjectLog(projectState, 'error', { kind: 'project_failed', autoFixCount: projectState.heartbeat.autoFixCount });
  emitProjectEvent(projectState.id, 'project_status', { status: 'failed', projectId: projectState.id });
  stopProjectLoop(projectState.id);
  persistProjectState(projectState);
}

function runProjectHeartbeat(projectState, source = 'interval') {
  if (projectState.status !== 'running') {
    return;
  }
  const settings = runtimeSettings();

  const beatTs = nowIso();
  ensureRecurringState(projectState);
  ensureStaffingState(projectState);
  ensureKpiGoalState(projectState);
  ensureDeadLetterState(projectState);
  projectState.heartbeat.lastBeat = beatTs;
  projectState.heartbeat.status = 'alive';
  projectState.heartbeat.cycleCount = (projectState.heartbeat.cycleCount || 0) + 1;
  refreshWeeklyKpiPlan(projectState, beatTs);
  evaluateAndNotifyKpiAlerts(projectState, beatTs);
  enqueueRecurringTasks(projectState, beatTs, source);
  evaluateAutoStaffing(projectState, beatTs);

  // ── Stall detection + auto-fix ───────────────────────────────────────────
  const runtime = projectRuntimes.get(projectState.id);
  const activeTask = projectState.tasks.find((task) => task.status === 'inprogress');
  if (activeTask) {
    activeTask.inprogressCycles = (activeTask.inprogressCycles || 0) + 1;

    const progressTs = (runtime && runtime.execution && runtime.execution.lastProgressAt)
      ? runtime.execution.lastProgressAt
      : (activeTask.startedAt || beatTs);
    const progressAtMs = Date.parse(progressTs);
    const elapsedMs = Number.isNaN(progressAtMs) ? 0 : Math.max(0, Date.now() - progressAtMs);
    const canCountForStall = settings.countManualHeartbeatForStall || source === 'interval' || source === 'startup';

    if (canCountForStall && elapsedMs >= settings.stallTimeoutMs) {
      // Stall detected — auto-fix: cancel execution and requeue
      const cancelled = cancelProjectExecution(projectState.id, 'stall_timeout', true);
      if (!cancelled) {
        requeueTaskToBacklog(activeTask, 'stall_timeout', true);
      }
      projectState.heartbeat.autoFixCount = (projectState.heartbeat.autoFixCount || 0) + 1;
      appendProjectLog(projectState, 'fix', {
        kind: 'task_stall_recovered',
        taskId: activeTask.id,
        title: activeTask.title,
        autoFixCount: projectState.heartbeat.autoFixCount
      });
      emitProjectEvent(projectState.id, 'task_update', activeTask);

      if (projectState.heartbeat.autoFixCount >= settings.maxAutoFixes) {
        markProjectFailed(projectState);
        return;
      }
    }
  } else {
    const autoActionTask = pickRunnableAutoActionTask(projectState);
    if (autoActionTask) {
      const startedAutoAction = executeRecurringAutoAction(projectState, autoActionTask, source);
      if (startedAutoAction) {
        appendProjectLog(projectState, 'message', {
          kind: 'heartbeat',
          message: `Heartbeat cycle ${projectState.heartbeat.cycleCount} (${source})`,
        });
        persistProjectState(projectState);
        return;
      }
    }

    // ── Start next available task ────────────────────────────────────────
    const nextTask = nextRunnableTask(projectState);
    if (nextTask) {
      const assignee = pickWorkerAgent(projectState, nextTask);
      if (assignee) {
        nextTask.status = 'inprogress';
        nextTask.assignee = assignee.id;
        nextTask.startedAt = beatTs;
        nextTask.executionState = 'running';
        nextTask.lastProgressAt = beatTs;
        nextTask.blockedBy = null;
        nextTask.inprogressCycles = 0;
        assignee.status = 'running';
        assignee.currentTask = nextTask.title;
        markAgentLog(assignee, `Started ${nextTask.id}`);
        appendMessageBusEntry({
          projectId: projectState.id,
          from: 'coordinator',
          to: assignee.id,
          kind: 'task_start_requested',
          payload: { taskId: nextTask.id, title: nextTask.title }
        });
        appendProjectLog(projectState, 'task', {
          kind: 'task_started',
          taskId: nextTask.id,
          title: nextTask.title,
          assignee: assignee.id,
          source
        });
        emitProjectEvent(projectState.id, 'task_update', nextTask);
        emitProjectEvent(projectState.id, 'agent_message', {
          agentId: assignee.id, name: assignee.name, role: assignee.role,
          status: assignee.status, currentTask: assignee.currentTask,
          tasksDone: assignee.tasksDone, recentLog: assignee.recentLog
        });
        const started = startProjectTaskExecution(projectState, nextTask, assignee);
        if (!started) {
          requeueTaskToBacklog(nextTask, 'spawn_failed', true);
          assignee.status = 'idle';
          assignee.currentTask = null;
          projectState.heartbeat.autoFixCount = (projectState.heartbeat.autoFixCount || 0) + 1;
          appendProjectLog(projectState, 'fix', {
            kind: 'task_start_failed_requeued',
            taskId: nextTask.id,
            autoFixCount: projectState.heartbeat.autoFixCount
          });
          emitProjectEvent(projectState.id, 'task_update', nextTask);
          emitProjectEvent(projectState.id, 'agent_message', {
            agentId: assignee.id, name: assignee.name, role: assignee.role,
            status: assignee.status, currentTask: assignee.currentTask,
            tasksDone: assignee.tasksDone, recentLog: assignee.recentLog
          });
          if (projectState.heartbeat.autoFixCount >= settings.maxAutoFixes) {
            markProjectFailed(projectState);
            return;
          }
        }
      } else {
        const req = taskCapabilityRequirements(nextTask);
        const summaryBits = [];
        if (req.requiredRole) summaryBits.push(`role=${req.requiredRole}`);
        if (req.connector) summaryBits.push(`connector=${req.connector}`);
        if (req.canDeploy) summaryBits.push('requires_deploy=true');
        if (req.canSpend) summaryBits.push('requires_spend=true');
        const reason = summaryBits.length
          ? `No eligible agent for capability requirements (${summaryBits.join(', ')}).`
          : 'No eligible agent for task capability requirements.';
        markTaskAwaitingApproval(projectState, nextTask, reason, {
          requirement: req,
          source,
        });
        notifyOperator(projectState, `Approval needed: ${nextTask.title}`, {
          taskId: nextTask.id,
          reason,
          requirement: req,
        }).catch(() => {});
      }
    } else {
      // No runnable backlog tasks and no inprogress — check if everything is done
      const allDone = projectState.tasks.length > 0 && projectState.tasks.every((t) => t.status === 'done');
      if (allDone && !shouldKeepRunningForRecurring(projectState)) {
        markProjectCompleted(projectState);
        return;
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
  const intervalMs = runtimeSettings().heartbeatIntervalMs;
  runtime.timer = setInterval(() => runProjectHeartbeat(runtime.state, 'interval'), intervalMs);
  appendProjectLog(runtime.state, 'message', { kind: 'project_loop_started' });
  persistProjectState(runtime.state);
}

function stopProjectLoop(projectId) {
  const runtime = projectRuntimes.get(projectId);
  if (!runtime || !runtime.timer) return;
  clearInterval(runtime.timer);
  runtime.timer = null;
}

function recoverProjectStateAfterRestart(state) {
  if (!state || !state.id) {
    return { requeuedTaskIds: [], allDoneAfterRecovery: false };
  }

  if (!Array.isArray(state.logs)) state.logs = [];
  if (!Array.isArray(state.tasks)) state.tasks = [];
  if (!Array.isArray(state.agents)) state.agents = [];
  if (!state.heartbeat) {
    state.heartbeat = { status: 'unknown', lastBeat: null, autoFixCount: 0, cycleCount: 0, log: [] };
  }

  state.tasks.forEach((t) => { if (typeof t.inprogressCycles !== 'number') t.inprogressCycles = 0; });
  state.tasks.forEach((t) => {
    if (!t.executionState) t.executionState = t.status === 'done' ? 'done' : (t.status === 'inprogress' ? 'running' : 'queued');
    if (typeof t.retryCount !== 'number') t.retryCount = 0;
    if (typeof t.lastFailedAt === 'undefined') t.lastFailedAt = null;
    if (typeof t.lastError === 'undefined') t.lastError = null;
    if (typeof t.lastProgressAt === 'undefined') t.lastProgressAt = null;
    if (typeof t.executionTaskRunId === 'undefined') t.executionTaskRunId = null;
    if (typeof t.recurringKey === 'undefined') t.recurringKey = null;
    if (typeof t.pendingApproval === 'undefined') t.pendingApproval = null;
    if (typeof t.autoActionNotBeforeAt === 'undefined') t.autoActionNotBeforeAt = null;
    if (typeof t.deadLetteredAt === 'undefined') t.deadLetteredAt = null;
  });
  if (typeof state.operatingMode !== 'string') {
    state.operatingMode = templateOperatingMode(state.template, null);
  } else {
    state.operatingMode = normalizeOperatingMode(state.operatingMode);
  }
  ensureRecurringState(state);
  ensureStaffingState(state);
  ensureKpiGoalState(state);
  ensureDeadLetterState(state);
  ensureConnectorExecutionState(state);
  if (!state.kpiAlerting || typeof state.kpiAlerting !== 'object') {
    state.kpiAlerting = { lastSentAt: null, lastSignature: null };
  }
  if (!state.roleCapabilities || typeof state.roleCapabilities !== 'object') {
    state.roleCapabilities = {};
    state.agents.forEach((agent) => {
      if (agent.isCoordinator) return;
      const defaults = DEFAULT_ROLE_CAPABILITIES[String(agent.role || '').trim()] || { canDeploy: false, canSpend: false, allowedConnectors: [] };
      state.roleCapabilities[String(agent.role || '').trim()] = {
        canDeploy: Boolean(defaults.canDeploy),
        canSpend: Boolean(defaults.canSpend),
        allowedConnectors: Array.isArray(defaults.allowedConnectors) ? [...defaults.allowedConnectors] : [],
      };
    });
  }

  const requeuedTaskIds = [];
  state.tasks.forEach((t) => {
    if (t.status === 'inprogress') {
      const previousAssignee = t.assignee;
      requeueTaskToBacklog(t, 'process_restart', false);
      requeuedTaskIds.push(t.id);
      appendMessageBusEntry({
        projectId: state.id,
        from: 'coordinator',
        to: previousAssignee || 'unknown',
        kind: 'task_requeued_on_restart',
        payload: { taskId: t.id, title: t.title, reason: 'process_restart' },
      });
    }
  });

  state.agents.forEach((agent) => {
    if (!agent.isCoordinator && agent.status === 'running') {
      agent.status = 'idle';
      agent.currentTask = null;
    }
  });

  const allDoneAfterRecovery = state.tasks.length > 0 && state.tasks.every((t) => t.status === 'done');
  if (state.status === 'running' && allDoneAfterRecovery && !shouldKeepRunningForRecurring(state)) {
    state.status = 'completed';
    state.completedAt = state.completedAt || nowIso();
    state.heartbeat.status = 'completed';
  }

  return { requeuedTaskIds, allDoneAfterRecovery };
}

function loadProjectsFromDisk() {
  ensureDir(PROJECTS_ROOT);
  const children = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
  children.forEach((entry) => {
    if (!entry.isDirectory()) return;
    const state = safeJsonRead(path.join(PROJECTS_ROOT, entry.name, 'state.json'), null);
    if (!state || !state.id) return;
    const runtime = { state, timer: null, execution: null, recurringAction: null };
    projectRuntimes.set(state.id, runtime);
    recoverProjectStateAfterRestart(state);

    // Recovery: resume running projects, or persist completed normalization.
    if (state.status === 'running') {
      startProjectLoop(state.id);
    } else {
      persistProjectState(state);
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
  const initialAgents = createInitialAgents(id, tpl);
  const subordinateCount = initialAgents.filter((agent) => !agent.isCoordinator).length;
  const operatingMode = templateOperatingMode(template, tpl);
  const staffingPolicy = templateAutoStaffingPolicy(tpl, subordinateCount);
  const state = {
    id,
    name,
    template,
    operatingMode,
    goal: goal || tpl.goal_definition || '',
    status: 'running',
    startedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    lastActivity: createdAt,
    completedAt: null,
    failedAt: null,
    recurring: {
      enabled: true,
      lastRunAt: {},
      schedule: recurringScheduleForTemplate(template, tpl),
      lastIdleNoticeAt: null,
    },
    staffing: {
      enabled: staffingPolicy.enabled,
      cooldownMs: staffingPolicy.cooldownMs,
      backlogPerAgentThreshold: staffingPolicy.backlogPerAgentThreshold,
      maxOptionalAdds: staffingPolicy.maxOptionalAdds,
      maxAgents: staffingPolicy.maxAgents,
      baseSubordinateCount: subordinateCount,
      optionalPool: Array.isArray(tpl.optional_agents) ? tpl.optional_agents.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
      lastScaledAt: null,
    },
    roleCapabilities: templateRoleCapabilities(tpl, initialAgents),
    kpiGoals: {
      ...DEFAULT_KPI_GOALS,
      weeklyPlan: {
        weekStart: startOfUtcWeekIso(createdAt),
        lastPlannedAt: null,
        nextReviewAt: null,
        summary: null,
      },
    },
    deadLetters: [],
    connectorExecutions: {},
    kpiAlerting: {
      lastSentAt: null,
      lastSignature: null,
    },
    agents: initialAgents,
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

  const runtime = { state, timer: null, execution: null, recurringAction: null };
  projectRuntimes.set(id, runtime);

  ensureDir(projectDir(id));
  fs.writeFileSync(projectTemplateSnapshotPath(id), `${JSON.stringify(tpl, null, 2)}\n`, 'utf-8');
  persistProjectState(state);
  startProjectLoop(id);
  runProjectHeartbeat(state, 'startup');
  return summarizeProject(state);
}

function removeProject(projectId) {
  cancelProjectExecution(projectId, 'project_deleted', false);
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

function ensureCredentialStorage() {
  ensureDir(CREDENTIALS_ROOT);
  ensureDir(CREDENTIAL_POLICIES_ROOT);
}

function readCredentialToken(service) {
  const target = credentialTokenPath(service);
  if (!fs.existsSync(target)) return null;
  try {
    const encoded = fs.readFileSync(target, 'utf-8').trim();
    if (!encoded) return null;
    return Buffer.from(encoded, 'base64').toString('utf-8');
  } catch (err) {
    return null;
  }
}

function credentialPolicyPath(projectId, service) {
  const safeProject = String(projectId || '').trim();
  const safeService = String(service || '').trim();
  return path.join(CREDENTIAL_POLICIES_ROOT, `${safeProject}__${safeService}.json`);
}

function defaultCredentialPolicy(projectId, service) {
  return {
    projectId: String(projectId || ''),
    service: String(service || ''),
    enabled: true,
    monthlyCap: null,
    updatedAt: null,
  };
}

function getProjectCredentialPolicy(projectId, service) {
  const fallback = defaultCredentialPolicy(projectId, service);
  if (!projectId || !service) return fallback;
  ensureDir(CREDENTIAL_POLICIES_ROOT);
  const stored = safeJsonRead(credentialPolicyPath(projectId, service), null);
  if (!stored || typeof stored !== 'object') return fallback;
  return {
    ...fallback,
    ...stored,
    projectId: String(projectId || ''),
    service: String(service || ''),
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : true,
    monthlyCap: typeof stored.monthlyCap === 'number' && Number.isFinite(stored.monthlyCap) ? stored.monthlyCap : null,
  };
}

function listProjectCredentialPolicies(projectId) {
  return SUPPORTED_CREDENTIAL_SERVICES.map((service) => getProjectCredentialPolicy(projectId, service));
}

function upsertProjectCredentialPolicy(projectId, service, patch = {}) {
  const next = {
    ...getProjectCredentialPolicy(projectId, service),
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : getProjectCredentialPolicy(projectId, service).enabled,
    monthlyCap: typeof patch.monthlyCap === 'number' && Number.isFinite(patch.monthlyCap)
      ? patch.monthlyCap
      : (patch.monthlyCap === null ? null : getProjectCredentialPolicy(projectId, service).monthlyCap),
    updatedAt: nowIso(),
  };
  ensureDir(CREDENTIAL_POLICIES_ROOT);
  fs.writeFileSync(credentialPolicyPath(projectId, service), `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return next;
}

function currentBudgetPeriods(ts = nowIso()) {
  const iso = String(ts || nowIso());
  return {
    day: iso.slice(0, 10),
    month: iso.slice(0, 7),
  };
}

function readCredentialBudgetCounters() {
  ensureCredentialStorage();
  return safeJsonRead(CREDENTIAL_BUDGET_COUNTERS_PATH, {});
}

function writeCredentialBudgetCounters(counters) {
  ensureCredentialStorage();
  fs.writeFileSync(CREDENTIAL_BUDGET_COUNTERS_PATH, `${JSON.stringify(counters, null, 2)}\n`, 'utf-8');
}

function normalizeBudgetCounterEntry(entry, ts = nowIso()) {
  const periods = currentBudgetPeriods(ts);
  const next = {
    dailyPeriod: periods.day,
    monthlyPeriod: periods.month,
    dailySpent: 0,
    monthlySpent: 0,
    updatedAt: null,
    ...(entry && typeof entry === 'object' ? entry : {}),
  };

  if (next.dailyPeriod !== periods.day) {
    next.dailyPeriod = periods.day;
    next.dailySpent = 0;
  }
  if (next.monthlyPeriod !== periods.month) {
    next.monthlyPeriod = periods.month;
    next.monthlySpent = 0;
  }
  return next;
}

function getCredentialBudgetSnapshot(projectId) {
  const counters = readCredentialBudgetCounters();
  const projectCounters = counters[String(projectId || '')] || {};
  const snapshot = {};
  SUPPORTED_CREDENTIAL_SERVICES.forEach((service) => {
    snapshot[service] = normalizeBudgetCounterEntry(projectCounters[service], nowIso());
  });
  return snapshot;
}

function recordCredentialSpend(projectId, service, amount, ts = nowIso()) {
  const safeProjectId = String(projectId || '').trim();
  const safeService = String(service || '').trim();
  const increment = Number(amount);
  if (!safeProjectId || !safeService || !Number.isFinite(increment) || increment <= 0) {
    return normalizeBudgetCounterEntry({}, ts);
  }

  const counters = readCredentialBudgetCounters();
  counters[safeProjectId] = counters[safeProjectId] || {};
  const current = normalizeBudgetCounterEntry(counters[safeProjectId][safeService], ts);
  current.dailySpent = Number((current.dailySpent + increment).toFixed(2));
  current.monthlySpent = Number((current.monthlySpent + increment).toFixed(2));
  current.updatedAt = ts;
  counters[safeProjectId][safeService] = current;
  writeCredentialBudgetCounters(counters);
  return current;
}

function appendCredentialAudit(record = {}) {
  ensureCredentialStorage();
  const entry = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    projectId: record.projectId ? String(record.projectId) : null,
    service: record.service ? String(record.service) : null,
    operation: record.operation ? String(record.operation) : null,
    action: record.action ? String(record.action) : 'credential_event',
    decision: record.decision ? String(record.decision) : null,
    errorCode: record.errorCode ? String(record.errorCode) : null,
    cost: typeof record.cost === 'number' && Number.isFinite(record.cost) ? record.cost : 0,
    dryRun: Boolean(record.dryRun),
    reason: record.reason ? redactSensitive(String(record.reason)) : null,
    meta: record.meta && typeof record.meta === 'object' ? record.meta : {},
  };
  fs.appendFileSync(CREDENTIAL_AUDIT_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf-8');
  return entry;
}

function readCredentialAudit(projectId, limit = 100) {
  ensureCredentialStorage();
  if (!fs.existsSync(CREDENTIAL_AUDIT_LOG_PATH)) return [];
  const raw = fs.readFileSync(CREDENTIAL_AUDIT_LOG_PATH, 'utf-8');
  const rows = raw.split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      return null;
    }
  }).filter(Boolean);

  const filtered = projectId
    ? rows.filter((entry) => String(entry.projectId || '') === String(projectId))
    : rows;
  return filtered.slice(-clampInt(limit, 100, 1, 500)).reverse();
}

function readCredentialMetadata() {
  ensureCredentialStorage();
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
  ensureCredentialStorage();
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
  appendCredentialAudit({
    service,
    action: 'credential_upsert',
    decision: 'allow',
    reason: 'Credential metadata updated.',
    meta: {
      monthlyBudget: meta.budget.monthly,
    },
  });
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
  appendCredentialAudit({
    service,
    action: 'credential_delete',
    decision: 'allow',
    reason: 'Credential removed.',
  });
}

function refreshWeeklyKpiPlan(projectState, ts = nowIso()) {
  ensureKpiGoalState(projectState);
  const plan = projectState.kpiGoals.weeklyPlan;
  const nowMs = Date.parse(ts);
  const weekStart = startOfUtcWeekIso(ts);
  if (plan.weekStart !== weekStart) {
    plan.weekStart = weekStart;
    plan.lastPlannedAt = null;
    plan.nextReviewAt = null;
    plan.summary = null;
  }
  const nextReviewMs = Date.parse(plan.nextReviewAt || '');
  if (plan.lastPlannedAt && Number.isFinite(nextReviewMs) && nowMs < nextReviewMs) {
    return;
  }

  const { goals, actual, variance } = computeKpiVarianceAndAlerts(projectState);
  const summary = `Weekly plan: target ${goals.weeklyTasksDoneTarget} tasks, cap backlog ${goals.maxBacklog}, cap monthly spend $${goals.maxMonthlySpend}. Current: ${actual.tasksDoneThisWeek} tasks done this week, backlog ${actual.backlog}, monthly spend $${actual.monthlySpend}. Variance: throughput ${variance.weeklyTasksDone}, backlog ${variance.backlog}, spend ${variance.monthlySpend}.`;
  plan.lastPlannedAt = ts;
  plan.nextReviewAt = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString();
  plan.summary = summary;

  appendProjectLog(projectState, 'message', {
    kind: 'weekly_kpi_plan_generated',
    weekStart: plan.weekStart,
    summary,
  });
  appendMessageBusEntry({
    projectId: projectState.id,
    from: 'coordinator',
    to: 'analytics_engine',
    kind: 'weekly_kpi_plan_generated',
    payload: {
      weekStart: plan.weekStart,
      summary,
    },
  });
}

function makeAnalyticsSnapshot(projectState) {
  ensureKpiGoalState(projectState);
  const done = projectState.tasks.filter((t) => t.status === 'done').length;
  const inProgress = projectState.tasks.filter((t) => t.status === 'inprogress').length;
  const backlog = projectState.tasks.filter((t) => t.status === 'backlog').length;
  const agentsActive = projectState.agents.filter((a) => a.status === 'running').length;
  const totalAgents = projectState.agents.length;
  const totalTokens = projectState.agents.reduce((sum, a) => sum + (Number(a.tokens) || 0), 0);
  const uptime = projectUptime(projectState);
  const insight = computeKpiVarianceAndAlerts(projectState);

  return {
    kpi: [
      String(done),
      String(inProgress),
      String(backlog),
      `${agentsActive}/${totalAgents}`,
      String(totalTokens),
      uptime
    ],
    metrics: insight.actual,
    goals: {
      weeklyTasksDoneTarget: insight.goals.weeklyTasksDoneTarget,
      maxBacklog: insight.goals.maxBacklog,
      maxMonthlySpend: insight.goals.maxMonthlySpend,
    },
    variance: insight.variance,
    alerts: insight.alerts,
    weeklyPlan: insight.goals.weeklyPlan,
    deadLetters: Array.isArray(projectState.deadLetters) ? projectState.deadLetters.slice(0, 20) : [],
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

function notificationSettingsSummary() {
  const integrations = (appConfig && appConfig.integrations) || {};
  const whatsapp = integrations.whatsapp || {};
  const telegram = integrations.telegram || {};
  return {
    preferredChannel: String((appConfig && appConfig.notifications && appConfig.notifications.preferredChannel) || 'whatsapp').toLowerCase() === 'telegram'
      ? 'telegram'
      : 'whatsapp',
    whatsapp: {
      notifyTo: String(whatsapp.notifyTo || ''),
      enabled: Boolean(whatsapp.accessToken && whatsapp.phoneNumberId && whatsapp.notifyTo),
    },
    telegram: {
      chatId: String(telegram.chatId || ''),
      enabled: Boolean(telegram.botToken && telegram.chatId),
    },
    kpiAlerts: {
      enabled: appConfig && appConfig.notifications && appConfig.notifications.kpiAlerts
        ? Boolean(appConfig.notifications.kpiAlerts.enabled)
        : true,
      cooldownMinutes: clampInt(
        appConfig && appConfig.notifications && appConfig.notifications.kpiAlerts
          ? appConfig.notifications.kpiAlerts.cooldownMinutes
          : 120,
        120,
        1,
        7 * 24 * 60,
      ),
    },
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

function runProductionCertification(baseUrl) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [PRODUCTION_CERTIFICATION_SCRIPT_PATH], {
      cwd: __dirname,
      env: {
        ...process.env,
        HIVEFORGE_BASE_URL: baseUrl,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      resolve({
        ok: false,
        exitCode: -1,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: `${stderr}${err.message}\n`,
      });
    });

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
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

async function sendWhatsAppNotification(message) {
  const whatsappCfg = (appConfig && appConfig.integrations && appConfig.integrations.whatsapp) || {};
  if (!whatsappCfg.accessToken || !whatsappCfg.phoneNumberId || !whatsappCfg.notifyTo) {
    return { ok: false, provider: 'whatsapp', reason: 'notifyTo/accessToken/phoneNumberId not configured' };
  }
  try {
    const resp = await fetchWithTimeout(`https://graph.facebook.com/v21.0/${whatsappCfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsappCfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: String(whatsappCfg.notifyTo),
        type: 'text',
        text: { body: String(message || '').slice(0, 1024) },
      }),
    }, 10000);
    if (!resp.ok) {
      return { ok: false, provider: 'whatsapp', reason: `HTTP ${resp.status}` };
    }
    return { ok: true, provider: 'whatsapp' };
  } catch (err) {
    return { ok: false, provider: 'whatsapp', reason: redactSensitive(err.message) };
  }
}

async function sendTelegramNotification(message) {
  const telegramCfg = (appConfig && appConfig.integrations && appConfig.integrations.telegram) || {};
  if (!telegramCfg.botToken || !telegramCfg.chatId) {
    return { ok: false, provider: 'telegram', reason: 'botToken/chatId not configured' };
  }
  try {
    const resp = await fetchWithTimeout(`https://api.telegram.org/bot${telegramCfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramCfg.chatId,
        text: String(message || '').slice(0, 3500),
      }),
    }, 10000);
    if (!resp.ok) {
      return { ok: false, provider: 'telegram', reason: `HTTP ${resp.status}` };
    }
    return { ok: true, provider: 'telegram' };
  } catch (err) {
    return { ok: false, provider: 'telegram', reason: redactSensitive(err.message) };
  }
}

async function notifyOperator(projectState, summary, detail = {}) {
  const projectName = projectState && projectState.name ? projectState.name : 'Unknown Project';
  const msg = `[HiveForge Coordinator] ${projectName}: ${summary}`;
  const preferred = String((appConfig && appConfig.notifications && appConfig.notifications.preferredChannel) || 'whatsapp').trim().toLowerCase();
  let sent = { ok: false, provider: preferred, reason: 'not_sent' };
  if (preferred === 'telegram') {
    sent = await sendTelegramNotification(msg);
    if (!sent.ok) sent = await sendWhatsAppNotification(msg);
  } else {
    sent = await sendWhatsAppNotification(msg);
    if (!sent.ok) sent = await sendTelegramNotification(msg);
  }

  if (projectState) {
    appendProjectLog(projectState, 'message', {
      kind: 'operator_notification',
      summary,
      channel: sent.provider,
      delivered: Boolean(sent.ok),
      detail,
    });
    appendMessageBusEntry({
      projectId: projectState.id,
      from: 'coordinator',
      to: 'operator',
      kind: 'operator_notification',
      payload: {
        summary,
        channel: sent.provider,
        delivered: Boolean(sent.ok),
        reason: sent.reason || null,
        detail,
      },
    });
  }
  return sent;
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

async function executeConnectorPolicy(connectorId, options = {}) {
  const connectorKey = String(connectorId || '').trim().toLowerCase();
  const connector = CONNECTOR_REGISTRY[connectorKey];
  if (!connector) {
    return {
      connector: connectorKey,
      ok: false,
      decision: 'deny',
      reason: 'Unsupported connector.',
      errorCode: 'unknown_connector',
      dryRun: Boolean(options.dryRun),
      checkedAt: nowIso(),
      checks: []
    };
  }

  const checks = [];

  if (connector.provider) {
    const result = await testIntegration(connector.provider);
    checks.push({
      type: 'integration',
      target: connector.provider,
      ok: Boolean(result.ok),
      message: String(result.message || ''),
    });
  }

  if (connector.credentialService) {
    const metadata = readCredentialMetadata();
    const found = metadata.find((entry) => entry.service === connector.credentialService);
    const connected = Boolean(found && found.connected);
    const policy = options.projectId ? getProjectCredentialPolicy(options.projectId, connector.credentialService) : null;
    const budgetEntry = options.projectId ? getCredentialBudgetSnapshot(options.projectId)[connector.credentialService] : null;
    const estimatedCost = typeof options.estimatedCost === 'number' && Number.isFinite(options.estimatedCost) ? options.estimatedCost : 0;
    checks.push({
      type: 'credential',
      target: connector.credentialService,
      ok: connected,
      message: connected
        ? `Credential ${connector.credentialService} is connected.`
        : `Credential ${connector.credentialService} is not connected.`
    });

    if (policy) {
      checks.push({
        type: 'project_policy',
        target: connector.credentialService,
        ok: policy.enabled,
        message: policy.enabled
          ? `Project policy allows ${connector.credentialService}.`
          : `Project policy disabled ${connector.credentialService}.`
      });

      if (typeof options.estimatedCost === 'number' && Number.isFinite(options.estimatedCost) && typeof policy.monthlyCap === 'number') {
        const projectedMonthly = Number(((budgetEntry?.monthlySpent || 0) + estimatedCost).toFixed(2));
        checks.push({
          type: 'budget_cap',
          target: connector.credentialService,
          ok: projectedMonthly <= policy.monthlyCap,
          message: projectedMonthly <= policy.monthlyCap
            ? `Projected monthly spend $${projectedMonthly} is within cap $${policy.monthlyCap}.`
            : `Projected monthly spend $${projectedMonthly} exceeds cap $${policy.monthlyCap}.`
        });
      }

      if (budgetEntry) {
        checks.push({
          type: 'budget_snapshot',
          target: connector.credentialService,
          ok: true,
          message: `Current spend: daily $${Number(budgetEntry.dailySpent || 0).toFixed(2)}, monthly $${Number(budgetEntry.monthlySpent || 0).toFixed(2)}.`
        });
      }
    }
  }

  if (options.projectId && options.actorRole) {
    const runtime = projectRuntimes.get(options.projectId);
    const roleCapabilities = (options.roleCapabilities && typeof options.roleCapabilities === 'object')
      ? options.roleCapabilities
      : (runtime && runtime.state && runtime.state.roleCapabilities
        ? runtime.state.roleCapabilities
        : {});
    const roleName = String(options.actorRole || '').trim();
    const caps = roleCapabilities[roleName] || null;
    if (!caps) {
      checks.push({
        type: 'role_capability',
        target: roleName,
        ok: false,
        message: `Role ${roleName} has no capability contract for ${connector.id}.`,
      });
    } else {
      const allowedConnectors = Array.isArray(caps.allowedConnectors) ? caps.allowedConnectors : [];
      const connectorAllowed = allowedConnectors.includes(connector.id);
      checks.push({
        type: 'role_capability',
        target: roleName,
        ok: connectorAllowed,
        message: connectorAllowed
          ? `Role ${roleName} is allowed to use ${connector.id}.`
          : `Role ${roleName} is not allowed to use ${connector.id}.`,
      });
      if (options.estimatedCost > 0) {
        checks.push({
          type: 'role_budget',
          target: roleName,
          ok: Boolean(caps.canSpend),
          message: caps.canSpend
            ? `Role ${roleName} can execute costed actions.`
            : `Role ${roleName} cannot execute costed actions.`,
        });
      }
      if (connector.id === 'netlify' && String(options.operation || '').toLowerCase() === 'trigger_deploy') {
        checks.push({
          type: 'role_deploy',
          target: roleName,
          ok: Boolean(caps.canDeploy),
          message: caps.canDeploy
            ? `Role ${roleName} can trigger deploy operations.`
            : `Role ${roleName} cannot trigger deploy operations.`,
        });
      }
    }
  }

  const ok = checks.length > 0 && checks.every((entry) => Boolean(entry.ok));
  const failedChecks = checks.filter((entry) => !entry.ok).map((entry) => entry.message).filter(Boolean);

  return {
    connector: connector.id,
    label: connector.label,
    credentialService: connector.credentialService || null,
    ok,
    decision: ok ? 'allow' : 'deny',
    reason: ok
      ? `${connector.label} connector passed policy checks.`
      : (failedChecks.join(' ') || `${connector.label} connector did not pass policy checks.`),
    dryRun: Boolean(options.dryRun),
    checkedAt: nowIso(),
    checks,
  };
}

async function executeNetlifyConnector(options = {}) {
  const operation = String(options.operation || 'list_sites').trim() || 'list_sites';
  const token = readCredentialToken('netlify');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Netlify credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'HiveForge',
  };

  if (operation === 'get_account') {
    const resp = await fetchWithTimeout('https://api.netlify.com/api/v1/user', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Netlify account request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    return {
      ok: true,
      message: 'Fetched Netlify account summary.',
      operation,
      actualCost: 0,
      data: {
        id: body?.id || null,
        email: body?.email || null,
        fullName: body?.full_name || null,
      },
    };
  }

  if (operation === 'list_sites') {
    const resp = await fetchWithTimeout('https://api.netlify.com/api/v1/sites', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Netlify sites request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    const sites = Array.isArray(body) ? body.slice(0, 20).map((site) => ({
      id: site?.id || null,
      name: site?.name || null,
      url: site?.url || null,
      state: site?.state || null,
      sslUrl: site?.ssl_url || null,
    })) : [];
    return {
      ok: true,
      message: `Fetched ${sites.length} Netlify site${sites.length === 1 ? '' : 's'}.`,
      operation,
      actualCost: 0,
      data: { sites },
    };
  }

  if (operation === 'trigger_deploy') {
    const siteId = String(options.siteId || '').trim();
    if (!siteId) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'siteId is required for trigger_deploy.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const triggerHeaders = {
      ...headers,
    };
    if (options.idempotencyKey) {
      // Netlify does not guarantee this header today, but forwarding it keeps parity with providers that do.
      triggerHeaders['Idempotency-Key'] = String(options.idempotencyKey);
      triggerHeaders['X-Idempotency-Key'] = String(options.idempotencyKey);
    }
    const resp = await fetchWithTimeout(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/builds`,
      { method: 'POST', headers: triggerHeaders },
      15000,
    );
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Netlify trigger_deploy failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json().catch(() => ({}));
    return {
      ok: true,
      message: `Deploy triggered for site ${siteId}.`,
      operation,
      actualCost: 0,
      data: {
        id: body?.id || null,
        state: body?.state || null,
        createdAt: body?.created_at || null,
        idempotencyKey: options.idempotencyKey || null,
        deployUrl: `https://app.netlify.com/sites/${siteId}/deploys`,
      },
    };
  }

  if (operation === 'list_deploys') {
    const siteId = String(options.siteId || '').trim();
    if (!siteId) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'siteId is required for list_deploys.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const resp = await fetchWithTimeout(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/deploys?per_page=10`,
      { headers },
      10000,
    );
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Netlify list_deploys failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const rawDeploys = await resp.json().catch(() => []);
    const deploys = (Array.isArray(rawDeploys) ? rawDeploys : []).slice(0, 10).map((d) => ({
      id: d?.id || null,
      state: d?.state || null,
      createdAt: d?.created_at || null,
      publishedAt: d?.published_at || null,
      branch: d?.branch || null,
      commitRef: d?.commit_ref ? String(d.commit_ref).slice(0, 7) : null,
      errorMessage: d?.error_message || null,
      deployUrl: d?.deploy_url || null,
    }));
    return {
      ok: true,
      message: `Fetched ${deploys.length} recent deploy${deploys.length === 1 ? '' : 's'} for site ${siteId}.`,
      operation,
      actualCost: 0,
      data: { deploys },
    };
  }

  return {
    ok: false,
    errorCode: 'VALIDATION_ERROR',
    message: `Unsupported Netlify operation: ${operation}.`,
    operation,
    actualCost: 0,
    data: null,
  };
}

async function executeGithubConnector(options = {}) {
  const operation = String(options.operation || 'get_user').trim() || 'get_user';
  const token = readCredentialToken('github');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'GitHub credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'HiveForge',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (operation === 'get_user') {
    const resp = await fetchWithTimeout('https://api.github.com/user', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `GitHub user request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    return {
      ok: true,
      message: `Fetched GitHub user ${body?.login || 'unknown'}.`,
      operation,
      actualCost: 0,
      data: {
        login: body?.login || null,
        name: body?.name || null,
        publicRepos: body?.public_repos ?? null,
      },
    };
  }

  if (operation === 'list_repos') {
    const resp = await fetchWithTimeout('https://api.github.com/user/repos?per_page=20&sort=updated', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `GitHub repos request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    const repos = Array.isArray(body) ? body.slice(0, 20).map((repo) => ({
      id: repo?.id || null,
      name: repo?.name || null,
      fullName: repo?.full_name || null,
      private: Boolean(repo?.private),
      url: repo?.html_url || null,
      pushedAt: repo?.pushed_at || null,
    })) : [];
    return {
      ok: true,
      message: `Fetched ${repos.length} GitHub repo${repos.length === 1 ? '' : 's'}.`,
      operation,
      actualCost: 0,
      data: { repos },
    };
  }

  return {
    ok: false,
    errorCode: 'VALIDATION_ERROR',
    message: `Unsupported GitHub operation: ${operation}. Use get_user or list_repos.`,
    operation,
    actualCost: 0,
    data: null,
  };
}

async function executeAnalyticsConnector(options = {}) {
  const operation = String(options.operation || 'list_accounts').trim() || 'list_accounts';
  const token = readCredentialToken('analytics');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Google Analytics credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'HiveForge',
  };

  if (operation === 'get_profile') {
    const resp = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/userinfo', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Google profile request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    return {
      ok: true,
      message: 'Fetched Google profile for analytics credential.',
      operation,
      actualCost: 0,
      data: {
        email: body?.email || null,
        name: body?.name || null,
        subject: body?.sub || null,
      },
    };
  }

  if (operation === 'list_accounts') {
    const resp = await fetchWithTimeout('https://analyticsadmin.googleapis.com/v1beta/accounts?pageSize=20', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Analytics accounts request failed with HTTP ${resp.status}. Try get_profile to validate token scope first.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    const accounts = Array.isArray(body?.accounts) ? body.accounts.slice(0, 20).map((account) => ({
      name: account?.name || null,
      displayName: account?.displayName || null,
      regionCode: account?.regionCode || null,
    })) : [];
    return {
      ok: true,
      message: `Fetched ${accounts.length} Analytics account${accounts.length === 1 ? '' : 's'}.`,
      operation,
      actualCost: 0,
      data: { accounts },
    };
  }

  return {
    ok: false,
    errorCode: 'VALIDATION_ERROR',
    message: `Unsupported Analytics operation: ${operation}. Use list_accounts or get_profile.`,
    operation,
    actualCost: 0,
    data: null,
  };
}

async function executeGoogleAdsConnector(options = {}) {
  const operation = String(options.operation || 'get_profile').trim() || 'get_profile';
  const token = readCredentialToken('google_ads');
  if (!token) {
    return {
      ok: false,
      errorCode: 'SECRET_MISSING',
      message: 'Google Ads credential token is missing.',
      operation,
      actualCost: 0,
      data: null,
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'HiveForge',
  };

  if (operation === 'get_profile') {
    const resp = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/userinfo', { headers }, 10000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Google profile request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    return {
      ok: true,
      message: 'Fetched Google profile for ads credential.',
      operation,
      actualCost: 0,
      data: {
        email: body?.email || null,
        name: body?.name || null,
        subject: body?.sub || null,
      },
    };
  }

  if (operation === 'list_accessible_customers') {
    const developerToken = String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
    if (!developerToken) {
      return {
        ok: false,
        errorCode: 'VALIDATION_ERROR',
        message: 'GOOGLE_ADS_DEVELOPER_TOKEN is required for list_accessible_customers. Use get_profile if you only want token validation.',
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const resp = await fetchWithTimeout('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
      method: 'POST',
      headers: {
        ...headers,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }, 12000);
    if (!resp.ok) {
      return {
        ok: false,
        errorCode: 'CONNECTOR_FAILURE',
        message: `Google Ads customers request failed with HTTP ${resp.status}.`,
        operation,
        actualCost: 0,
        data: null,
      };
    }
    const body = await resp.json();
    const resourceNames = Array.isArray(body?.resourceNames) ? body.resourceNames : [];
    return {
      ok: true,
      message: `Fetched ${resourceNames.length} accessible Google Ads customer${resourceNames.length === 1 ? '' : 's'}.`,
      operation,
      actualCost: 0,
      data: { resourceNames },
    };
  }

  return {
    ok: false,
    errorCode: 'VALIDATION_ERROR',
    message: `Unsupported Google Ads operation: ${operation}. Use get_profile or list_accessible_customers.`,
    operation,
    actualCost: 0,
    data: null,
  };
}

async function executeLiveConnector(connectorId, options = {}) {
  const connectorKey = String(connectorId || '').trim().toLowerCase();
  if (connectorKey === 'github') {
    return executeGithubConnector(options);
  }
  if (connectorKey === 'netlify') {
    return executeNetlifyConnector(options);
  }
  if (connectorKey === 'analytics') {
    return executeAnalyticsConnector(options);
  }
  if (connectorKey === 'google_ads') {
    return executeGoogleAdsConnector(options);
  }
  return {
    ok: false,
    errorCode: 'CONNECTOR_NOT_IMPLEMENTED',
    message: `No live adapter implemented yet for ${connectorKey}.`,
    operation: String(options.operation || 'default'),
    actualCost: 0,
    data: null,
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
          let model = null;
          try {
            const data = await resp.json();
            model = (Array.isArray(data?.data) && data.data[0]?.id) ? data.data[0].id : null;
          } catch {}
          return { reachable: true, model };
        }
      } catch (err) {
      }
    }

    clearTimeout(timeout);
    return { reachable: false, model: null };
  } catch (err) {
    clearTimeout(timeout);
    return { reachable: false, model: null };
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
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg']);
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

  fs.readFile(target, (err, data) => {
    if (err && imageExts.has(ext) && !normalizedPath.includes('/') && !normalizedPath.includes('\\')) {
      // Fall back to project root for top-level image assets (e.g. /icon_hiveforge.png)
      const rootAsset = path.join(__dirname, normalizedPath);
      if (!rootAsset.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.readFile(rootAsset, (err2, data2) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data2);
      });
      return;
    }
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const contentTypes2 = {
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
    const contentType2 = contentTypes2[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType2 });
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
  appConfig.runtime = runtimeSettings();
  persistAppConfig();
  ensureMessageBus();
  const endpoint = appConfig.llm?.endpoint || 'http://127.0.0.1:1234/v1';
  appState.llm.endpoint = endpoint;
  const lmResult = await pingLMStudio(endpoint);
  appState.llm.reachable = lmResult.reachable;
  if (lmResult.model) appState.llm.model = lmResult.model;
  appState.llm.lastCheckedAt = new Date().toISOString();
  if (!lmResult.reachable) {
    log(`Warning: LM Studio is not reachable at ${endpoint}. UI will still start; tasks may fail until LM Studio API is enabled.`);
  }

  loadProjectsFromDisk();

  // Log template discovery once at startup (not per request)
  try {
    ensureDir(TEMPLATES_ROOT);
    const foundTemplates = fs.readdirSync(TEMPLATES_ROOT)
      .filter((f) => f.endsWith('.json') && f !== 'schema.json')
      .map((f) => f.replace('.json', ''));
    log(`Templates available (${foundTemplates.length}): ${foundTemplates.join(', ') || 'NONE — check templates/ directory'}`);
  } catch (err) {
    log(`Warning: could not read templates directory: ${err.message}`);
  }

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
          executionState: 'queued',
          retryCount: 0,
          lastFailedAt: null,
          lastError: null,
          lastProgressAt: null,
          executionTaskRunId: null,
          pendingApproval: null,
          autoActionNotBeforeAt: null,
          deadLetteredAt: null,
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

    if (pathname === '/api/approvals' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const sortBy = String(urlObj.searchParams.get('sortBy') || 'risk').trim().toLowerCase();
      const direction = String(urlObj.searchParams.get('direction') || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
      const minRisk = String(urlObj.searchParams.get('minRisk') || 'all').trim().toLowerCase();
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      const riskThreshold = minRisk === 'high' ? 70 : minRisk === 'medium' ? 40 : 0;
      const approvals = runtime.state.tasks
        .filter((task) => task.status === 'review' && task.executionState === 'awaiting_approval')
        .map((task) => ({
          taskId: task.id,
          title: task.title,
          phase: task.phase,
          assignee: task.assignee,
          requestedAt: task.pendingApproval && task.pendingApproval.requestedAt ? task.pendingApproval.requestedAt : task.lastProgressAt,
          reason: task.pendingApproval && task.pendingApproval.reason ? task.pendingApproval.reason : task.lastError,
          risk: task.pendingApproval && task.pendingApproval.risk ? task.pendingApproval.risk : { score: 0, level: 'low', requiresHuman: true },
          detail: task.pendingApproval && task.pendingApproval.detail ? task.pendingApproval.detail : {},
        }))
        .filter((entry) => Number(entry.risk && entry.risk.score || 0) >= riskThreshold);

      approvals.sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'requestedat') {
          const av = Date.parse(a.requestedAt || '');
          const bv = Date.parse(b.requestedAt || '');
          cmp = (Number.isFinite(av) ? av : 0) - (Number.isFinite(bv) ? bv : 0);
        } else if (sortBy === 'title') {
          cmp = String(a.title || '').localeCompare(String(b.title || ''));
        } else {
          cmp = Number(a.risk && a.risk.score || 0) - Number(b.risk && b.risk.score || 0);
        }
        return direction === 'asc' ? cmp : -cmp;
      });

      writeJson(res, { projectId, sortBy, direction, minRisk, items: approvals });
      return;
    }

    if (pathname === '/api/retry_policy/test' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const connector = String(payload.connector || 'default').trim().toLowerCase() || 'default';
        const reason = String(payload.reason || 'HTTP 503 timeout').trim();
        const policy = retryPolicyForConnector(connector);
        const attempts = [];
        for (let attempt = 1; attempt <= policy.maxAttempts + 1; attempt += 1) {
          const plan = connectorRetryPlan(connector, attempt, reason, {});
          attempts.push({
            attempt,
            retryable: Boolean(plan.retryable && attempt <= policy.maxAttempts),
            delayMs: Number(plan.delayMs || 0),
          });
        }
        writeJson(res, {
          ok: true,
          connector,
          reason,
          policy,
          attempts,
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/task_approval' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const taskId = String(payload.taskId || '').trim();
        const decision = String(payload.decision || '').trim().toLowerCase();
        const note = String(payload.note || '').trim();
        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        if (!taskId || (decision !== 'approve' && decision !== 'deny')) {
          writeJson(res, { error: 'taskId and decision (approve|deny) are required' }, 400);
          return;
        }

        const task = runtime.state.tasks.find((entry) => entry.id === taskId);
        if (!task) {
          writeJson(res, { error: 'Task not found' }, 404);
          return;
        }
        if (!(task.status === 'review' && task.executionState === 'awaiting_approval')) {
          writeJson(res, { error: 'Task is not awaiting approval' }, 400);
          return;
        }

        applyTaskApprovalDecision(runtime.state, task, decision, note, 'operator');
        persistProjectState(runtime.state);
        writeJson(res, { ok: true, task });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/task_approval/batch' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const decision = String(payload.decision || '').trim().toLowerCase();
        const note = String(payload.note || '').trim();
        const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }
        if (!taskIds.length || (decision !== 'approve' && decision !== 'deny')) {
          writeJson(res, { error: 'taskIds[] and decision (approve|deny) are required' }, 400);
          return;
        }

        const results = [];
        taskIds.forEach((taskId) => {
          const task = runtime.state.tasks.find((entry) => entry.id === taskId);
          if (!task) {
            results.push({ taskId, ok: false, error: 'Task not found' });
            return;
          }
          if (!(task.status === 'review' && task.executionState === 'awaiting_approval')) {
            results.push({ taskId, ok: false, error: 'Task is not awaiting approval' });
            return;
          }
          applyTaskApprovalDecision(runtime.state, task, decision, note, 'operator_batch');
          results.push({ taskId, ok: true, task });
        });

        persistProjectState(runtime.state);
        writeJson(res, {
          ok: true,
          projectId,
          decision,
          results,
          successCount: results.filter((entry) => entry.ok).length,
          failureCount: results.filter((entry) => !entry.ok).length,
        });
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

    if (pathname === '/api/credential_budget' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      if (!projectId) {
        writeJson(res, { error: 'projectId is required' }, 400);
        return;
      }

      const snapshot = getCredentialBudgetSnapshot(projectId);
      const policies = listProjectCredentialPolicies(projectId);
      writeJson(res, {
        projectId,
        services: SUPPORTED_CREDENTIAL_SERVICES.map((service) => {
          const policy = policies.find((entry) => entry.service === service) || defaultCredentialPolicy(projectId, service);
          const budget = snapshot[service] || normalizeBudgetCounterEntry({}, nowIso());
          return {
            service,
            dailySpent: budget.dailySpent,
            monthlySpent: budget.monthlySpent,
            dailyPeriod: budget.dailyPeriod,
            monthlyPeriod: budget.monthlyPeriod,
            monthlyCap: policy.monthlyCap,
            enabled: policy.enabled,
          };
        }),
      });
      return;
    }

    if (pathname === '/api/credential_audit' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const limit = Number(urlObj.searchParams.get('limit') || 80);
      writeJson(res, readCredentialAudit(projectId || null, limit));
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
      writeJson(res, runtime ? makeAnalyticsSnapshot(runtime.state) : {
        kpi: ['-', '-', '-', '-', '-', '-'],
        metrics: { tasksDoneThisWeek: 0, backlog: 0, monthlySpend: 0 },
        goals: { ...DEFAULT_KPI_GOALS },
        variance: { weeklyTasksDone: 0, backlog: 0, monthlySpend: 0 },
        alerts: [],
        weeklyPlan: null,
        deadLetters: [],
        lastUpdated: nowIso(),
      });
      return;
    }

    if (pathname === '/api/kpi_goals' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      ensureKpiGoalState(runtime.state);
      writeJson(res, {
        projectId,
        goals: {
          weeklyTasksDoneTarget: runtime.state.kpiGoals.weeklyTasksDoneTarget,
          maxBacklog: runtime.state.kpiGoals.maxBacklog,
          maxMonthlySpend: runtime.state.kpiGoals.maxMonthlySpend,
        },
        weeklyPlan: runtime.state.kpiGoals.weeklyPlan,
      });
      return;
    }

    if (pathname === '/api/kpi_goals' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }
        const projectId = String(payload.projectId || '').trim();
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }

        ensureKpiGoalState(runtime.state);
        const goalsPatch = payload.goals && typeof payload.goals === 'object' ? payload.goals : {};
        runtime.state.kpiGoals.weeklyTasksDoneTarget = clampInt(goalsPatch.weeklyTasksDoneTarget, runtime.state.kpiGoals.weeklyTasksDoneTarget, 1, 5000);
        runtime.state.kpiGoals.maxBacklog = clampInt(goalsPatch.maxBacklog, runtime.state.kpiGoals.maxBacklog, 0, 10000);
        runtime.state.kpiGoals.maxMonthlySpend = clampNumber(goalsPatch.maxMonthlySpend, runtime.state.kpiGoals.maxMonthlySpend, 0, 100000000);
        runtime.state.kpiGoals.weeklyPlan.lastPlannedAt = null;
        runtime.state.kpiGoals.weeklyPlan.nextReviewAt = null;

        refreshWeeklyKpiPlan(runtime.state, nowIso());
        persistProjectState(runtime.state);
        writeJson(res, {
          ok: true,
          projectId,
          goals: {
            weeklyTasksDoneTarget: runtime.state.kpiGoals.weeklyTasksDoneTarget,
            maxBacklog: runtime.state.kpiGoals.maxBacklog,
            maxMonthlySpend: runtime.state.kpiGoals.maxMonthlySpend,
          },
          weeklyPlan: runtime.state.kpiGoals.weeklyPlan,
          analytics: makeAnalyticsSnapshot(runtime.state),
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      writeJson(res, {
        runtime: runtimeSettings(),
        defaults: DEFAULT_RUNTIME_SETTINGS,
        retryPolicies: retryPoliciesSummary(),
        llm: {
          endpoint: appState.llm.endpoint,
        },
        lastCertification: (appConfig && appConfig.lastCertification) || null,
        notifications: notificationSettingsSummary(),
      });
      return;
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const runtimePatch = payload.runtime && typeof payload.runtime === 'object' ? payload.runtime : {};
        const retryPolicyPatch = payload.retryPolicies && typeof payload.retryPolicies === 'object' ? payload.retryPolicies : {};
        const nextEndpoint = payload.llm && typeof payload.llm === 'object' ? String(payload.llm.endpoint || '').trim() : '';
        const notificationPatch = payload.notifications && typeof payload.notifications === 'object' ? payload.notifications : {};

        applyRuntimeSettingsUpdate(runtimePatch);

        if (nextEndpoint) {
          appConfig.llm = appConfig.llm || {};
          appConfig.llm.endpoint = nextEndpoint;
          appState.llm.endpoint = nextEndpoint;
          persistAppConfig();
        }

        if (notificationPatch && typeof notificationPatch === 'object') {
          appConfig.integrations = appConfig.integrations || {};
          appConfig.integrations.whatsapp = appConfig.integrations.whatsapp || {};
          appConfig.integrations.telegram = appConfig.integrations.telegram || {};
          appConfig.notifications = appConfig.notifications || {};
          appConfig.notifications.kpiAlerts = appConfig.notifications.kpiAlerts || {};

          const nextNotifyTo = String(notificationPatch.whatsappNotifyTo || '').trim();
          const nextTelegramChatId = String(notificationPatch.telegramChatId || '').trim();
          const nextChannel = String(notificationPatch.preferredChannel || '').trim().toLowerCase();
          const nextKpiAlertsEnabled = typeof notificationPatch.kpiAlertsEnabled === 'boolean'
            ? notificationPatch.kpiAlertsEnabled
            : null;
          const nextKpiAlertCooldownMinutes = notificationPatch.kpiAlertCooldownMinutes;

          if (nextNotifyTo || notificationPatch.whatsappNotifyTo === '') {
            appConfig.integrations.whatsapp.notifyTo = nextNotifyTo;
          }
          if (nextTelegramChatId || notificationPatch.telegramChatId === '') {
            appConfig.integrations.telegram.chatId = nextTelegramChatId;
          }
          if (nextChannel === 'whatsapp' || nextChannel === 'telegram') {
            appConfig.notifications.preferredChannel = nextChannel;
          }
          if (nextKpiAlertsEnabled !== null) {
            appConfig.notifications.kpiAlerts.enabled = nextKpiAlertsEnabled;
          }
          if (typeof nextKpiAlertCooldownMinutes !== 'undefined') {
            appConfig.notifications.kpiAlerts.cooldownMinutes = clampInt(nextKpiAlertCooldownMinutes, 120, 1, 7 * 24 * 60);
          }
          persistAppConfig();
        }

        if (retryPolicyPatch && typeof retryPolicyPatch === 'object') {
          applyRetryPoliciesUpdate(retryPolicyPatch);
        }

        writeJson(res, {
          ok: true,
          runtime: runtimeSettings(),
          defaults: DEFAULT_RUNTIME_SETTINGS,
          retryPolicies: retryPoliciesSummary(),
          llm: {
            endpoint: appState.llm.endpoint,
          },
          notifications: notificationSettingsSummary(),
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/settings/reset' && req.method === 'POST') {
      applyRuntimeSettingsUpdate(DEFAULT_RUNTIME_SETTINGS);
      writeJson(res, {
        ok: true,
        runtime: runtimeSettings(),
        defaults: DEFAULT_RUNTIME_SETTINGS,
        retryPolicies: retryPoliciesSummary(),
        llm: {
          endpoint: appState.llm.endpoint,
        },
        notifications: notificationSettingsSummary(),
      });
      return;
    }

    if (pathname === '/api/production_certification' && req.method === 'POST') {
      const port = Number(process.env.PORT || 3000);
      const baseUrl = `http://127.0.0.1:${port}`;
      runProductionCertification(baseUrl).then((result) => {
        appConfig.lastCertification = {
          at: new Date().toISOString(),
          passed: result.ok,
          durationMs: result.durationMs,
        };
        persistAppConfig();
        writeJson(res, result, result.ok ? 200 : 500);
      }).catch((err) => {
        writeJson(res, {
          ok: false,
          exitCode: -1,
          durationMs: 0,
          stdout: '',
          stderr: redactSensitive(err.message),
        }, 500);
      });
      return;
    }

    if (pathname === '/api/netlify/deploy' && req.method === 'POST') {
      readRequestBody(req).then(async (body) => {
        let payload = {};
        try { payload = parseJsonBodySafe(body); } catch (_) {}
        const siteId = String(payload.siteId || '').trim();
        if (!siteId) {
          writeJson(res, { ok: false, error: 'siteId is required.' }, 400);
          return;
        }
        try {
          const result = await executeNetlifyConnector({ operation: 'trigger_deploy', siteId });
          if (result.ok) {
            await appendMessageBusEntry({
              kind: 'netlify_deploy_triggered',
              projectId: null,
              agentId: null,
              payload: { siteId, deployId: result.data?.id, state: result.data?.state },
            });
          }
          writeJson(res, result, result.ok ? 200 : 500);
        } catch (err) {
          writeJson(res, { ok: false, error: redactSensitive(err.message) }, 500);
        }
      }).catch(() => writeJson(res, { ok: false, error: 'Invalid request body.' }, 400));
      return;
    }

    if (pathname === '/api/netlify/deploys' && req.method === 'GET') {
      const siteId = String(urlObj.searchParams.get('siteId') || '').trim();
      if (!siteId) {
        writeJson(res, { ok: false, error: 'siteId query parameter is required.' }, 400);
        return;
      }
      executeNetlifyConnector({ operation: 'list_deploys', siteId }).then((result) => {
        writeJson(res, result, result.ok ? 200 : 500);
      }).catch((err) => {
        writeJson(res, { ok: false, error: redactSensitive(err.message) }, 500);
      });
      return;
    }

    if (pathname === '/api/project_settings' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const runtime = projectId ? projectRuntimes.get(projectId) : null;
      if (!runtime) {
        writeJson(res, { error: 'Project not found' }, 404);
        return;
      }
      writeJson(res, summarizeProjectAutomation(runtime.state));
      return;
    }

    if (pathname === '/api/project_settings' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }

        ensureRecurringState(runtime.state);
        const recurring = payload.recurring && typeof payload.recurring === 'object' ? payload.recurring : {};
        let enqueuedNow = 0;
        if (typeof recurring.enabled === 'boolean') {
          runtime.state.recurring.enabled = recurring.enabled;
          appendProjectLog(runtime.state, 'message', {
            kind: 'project_recurring_updated',
            enabled: recurring.enabled,
          });
          appendMessageBusEntry({
            projectId,
            from: 'coordinator',
            to: 'scheduler',
            kind: 'project_recurring_updated',
            payload: { enabled: recurring.enabled },
          });
        }

        if (recurring.enqueueNow === true) {
          enqueuedNow = enqueueRecurringTasks(runtime.state, nowIso(), 'manual_trigger');
          appendProjectLog(runtime.state, 'message', {
            kind: 'project_recurring_run_now',
            enqueued: enqueuedNow,
          });
          appendMessageBusEntry({
            projectId,
            from: 'coordinator',
            to: 'scheduler',
            kind: 'project_recurring_run_now',
            payload: { enqueued: enqueuedNow },
          });
        }

        persistProjectState(runtime.state);
        writeJson(res, {
          ...summarizeProjectAutomation(runtime.state),
          enqueuedNow,
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/credential_policy' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      if (!projectId) {
        writeJson(res, { error: 'projectId is required' }, 400);
        return;
      }
      writeJson(res, {
        projectId,
        services: listProjectCredentialPolicies(projectId),
      });
      return;
    }

    if (pathname === '/api/credential_policy' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const projectId = String(payload.projectId || '').trim();
        const service = String(payload.service || '').trim();
        if (!projectId) {
          writeJson(res, { error: 'projectId is required' }, 400);
          return;
        }
        if (!SUPPORTED_CREDENTIAL_SERVICES.includes(service)) {
          writeJson(res, { error: 'Unsupported credential service' }, 400);
          return;
        }

        const runtime = projectRuntimes.get(projectId);
        if (!runtime) {
          writeJson(res, { error: 'Project not found' }, 404);
          return;
        }

        const policyPatch = payload.policy && typeof payload.policy === 'object' ? payload.policy : {};
        const nextPolicy = upsertProjectCredentialPolicy(projectId, service, {
          enabled: typeof policyPatch.enabled === 'boolean' ? policyPatch.enabled : undefined,
          monthlyCap: typeof policyPatch.monthlyCap === 'number'
            ? policyPatch.monthlyCap
            : (policyPatch.monthlyCap === null ? null : undefined),
        });

        appendProjectLog(runtime.state, nextPolicy.enabled ? 'policy_allow' : 'policy_deny', {
          kind: 'credential_policy_updated',
          service,
          approved: nextPolicy.enabled,
          decision: nextPolicy.enabled ? 'allow' : 'deny',
          monthlyCap: nextPolicy.monthlyCap,
        });
        appendMessageBusEntry({
          projectId,
          from: 'coordinator',
          to: 'policy_engine',
          kind: 'credential_policy_updated',
          payload: {
            service,
            enabled: nextPolicy.enabled,
            monthlyCap: nextPolicy.monthlyCap,
          },
        });
        appendCredentialAudit({
          projectId,
          service,
          action: 'policy_update',
          decision: nextPolicy.enabled ? 'allow' : 'deny',
          reason: nextPolicy.enabled ? 'Credential policy enabled.' : 'Credential policy disabled.',
          meta: {
            monthlyCap: nextPolicy.monthlyCap,
          },
        });
        persistProjectState(runtime.state);

        writeJson(res, {
          projectId,
          services: listProjectCredentialPolicies(projectId),
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
      return;
    }

    if (pathname === '/api/connectors/execute' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }

        const connector = String(payload.connector || '').trim();
        const projectId = String(payload.projectId || '').trim();
        const dryRun = Boolean(payload.dryRun);
        const estimatedCost = typeof payload.estimatedCost === 'number' ? payload.estimatedCost : null;
        const operation = String(payload.operation || '').trim();
        const input = payload.input && typeof payload.input === 'object' ? payload.input : {};
        const actorRole = String(payload.actorRole || '').trim();
        const requiresPermission = Boolean(payload.requiresPermission);

        if (!connector) {
          writeJson(res, { error: 'connector is required' }, 400);
          return;
        }

        executeConnectorPolicy(connector, { dryRun, projectId, estimatedCost, actorRole, operation }).then(async (result) => {
          let response = { ...result, operation, execution: null };
          let auditDecision = result.decision;
          let auditReason = result.reason;
          let auditErrorCode = result.errorCode || null;
          let actualCost = 0;
          const isMutating = isMutatingConnectorOperation(connector, operation);
          const executionKey = (!dryRun && isMutating)
            ? String(payload.idempotencyKey || '').trim() || connectorMutationExecutionKey(connector, operation, input)
            : null;

          if (result.ok && !dryRun && projectId && executionKey) {
            const runtime = projectRuntimes.get(projectId);
            if (runtime && runtime.state) {
              ensureConnectorExecutionState(runtime.state);
              const previousExecution = runtime.state.connectorExecutions[executionKey] || null;
              if (previousExecution && previousExecution.status === 'succeeded') {
                response.reason = previousExecution.message || 'idempotent_replay_success';
                response.execution = {
                  ok: true,
                  operation,
                  actualCost: 0,
                  message: response.reason,
                  data: previousExecution.result || null,
                  idempotentReplay: true,
                  executionKey,
                };
              } else if (previousExecution && previousExecution.status === 'running') {
                const startedMs = Date.parse(previousExecution.startedAt || previousExecution.updatedAt || '');
                if (Number.isFinite(startedMs) && (Date.now() - startedMs) < CONNECTOR_EXECUTION_STALE_MS) {
                  response.reason = 'Duplicate mutating connector execution suppressed while prior run is still active.';
                  response.execution = {
                    ok: true,
                    operation,
                    actualCost: 0,
                    message: response.reason,
                    data: previousExecution.result || null,
                    idempotentReplay: true,
                    executionKey,
                    pending: true,
                  };
                } else {
                  markConnectorExecutionRecord(runtime.state, executionKey, {
                    status: 'stale_running',
                    staleAt: nowIso(),
                    message: 'Marked stale after manual connector execution recovery timeout.',
                  });
                }
              }
            }
          }

          if (result.ok && !dryRun) {
            if (!response.execution) {
              if (projectId && executionKey) {
                const runtime = projectRuntimes.get(projectId);
                if (runtime && runtime.state) {
                  markConnectorExecutionRecord(runtime.state, executionKey, {
                    connector: String(connector || '').trim().toLowerCase(),
                    operation: String(operation || '').trim().toLowerCase(),
                    status: 'running',
                    startedAt: nowIso(),
                    attempts: 1,
                    source: 'manual_execute',
                    lastError: null,
                  });
                  persistProjectState(runtime.state);
                }
              }

              const execution = await executeLiveConnector(connector, {
                operation,
                input,
                projectId,
                estimatedCost,
                idempotencyKey: executionKey || undefined,
              });
              response.execution = execution;
              if (!execution.ok) {
                response.ok = false;
                response.decision = 'deny';
                response.reason = execution.message;
                response.errorCode = execution.errorCode;
                auditDecision = 'deny';
                auditReason = execution.message;
                auditErrorCode = execution.errorCode;
                if (projectId && executionKey) {
                  const runtime = projectRuntimes.get(projectId);
                  if (runtime && runtime.state) {
                    markConnectorExecutionRecord(runtime.state, executionKey, {
                      status: 'failed',
                      lastError: execution.message || execution.errorCode || 'execution_failed',
                    });
                    persistProjectState(runtime.state);
                  }
                }
              } else {
                actualCost = typeof execution.actualCost === 'number' && Number.isFinite(execution.actualCost)
                  ? execution.actualCost
                  : (typeof estimatedCost === 'number' ? estimatedCost : 0);
                response.reason = execution.message || response.reason;
                auditDecision = 'allow';
                auditReason = response.reason;
                if (projectId && executionKey) {
                  const runtime = projectRuntimes.get(projectId);
                  if (runtime && runtime.state) {
                    markConnectorExecutionRecord(runtime.state, executionKey, {
                      status: 'succeeded',
                      message: response.reason,
                      completedAt: nowIso(),
                      actualCost,
                      result: execution.data || null,
                    });
                    persistProjectState(runtime.state);
                  }
                }
              }
            } else {
              auditDecision = 'allow';
              auditReason = response.reason;
            }
          }

          if (projectId && result.credentialService && response.ok && !dryRun && actualCost > 0) {
            response.budget = recordCredentialSpend(projectId, result.credentialService, actualCost, nowIso());
          } else if (projectId && result.credentialService) {
            response.budget = getCredentialBudgetSnapshot(projectId)[result.credentialService] || null;
          }

          appendCredentialAudit({
            projectId: projectId || null,
            service: result.credentialService || connector,
            operation,
            action: 'connector_execute',
            decision: auditDecision,
            errorCode: auditErrorCode,
            cost: actualCost,
            dryRun,
            reason: auditReason,
            meta: {
              connector: result.connector,
              estimatedCost,
              idempotencyKey: executionKey,
            },
          });

          if (projectId) {
            const runtime = projectRuntimes.get(projectId);
            if (runtime) {
              if (!response.ok && requiresPermission) {
                await notifyOperator(runtime.state, `Permission requested for ${connector}:${operation || 'n/a'}`, {
                  actorRole: actorRole || null,
                  reason: response.reason,
                  checks: response.checks,
                });
              }
              appendProjectLog(runtime.state, response.ok ? 'policy_allow' : 'policy_deny', {
                kind: 'connector_policy_decision',
                connector: response.connector,
                operation,
                decision: response.decision,
                approved: response.ok,
                dryRun: response.dryRun,
                actorRole: actorRole || null,
                reason: response.reason,
                checks: response.checks,
                actualCost,
              });
              appendMessageBusEntry({
                projectId,
                from: 'coordinator',
                to: 'policy_engine',
                kind: 'connector_policy_decision',
                payload: {
                  connector: response.connector,
                  operation,
                  decision: response.decision,
                  approved: response.ok,
                  dryRun: response.dryRun,
                  actorRole: actorRole || null,
                  reason: response.reason,
                  actualCost,
                },
              });
              persistProjectState(runtime.state);
            }
          }

          writeJson(res, response, response.errorCode ? 400 : 200);
        }).catch((err) => {
          writeJson(res, {
            connector,
            operation,
            ok: false,
            decision: 'deny',
            reason: `Connector execution failed: ${redactSensitive(err.message)}`,
            dryRun,
            checkedAt: nowIso(),
            checks: []
          }, 500);
        });
      }).catch((err) => {
        writeJson(res, { error: err.message }, 400);
      });
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

    if (pathname === '/api/message_bus' && req.method === 'GET') {
      const projectId = String(urlObj.searchParams.get('projectId') || '').trim();
      const limit = Number(urlObj.searchParams.get('limit') || 200);
      const kind = String(urlObj.searchParams.get('kind') || '').trim();
      const actor = String(urlObj.searchParams.get('actor') || '').trim();
      const query = String(urlObj.searchParams.get('q') || '').trim();
      writeJson(res, readMessageBusEntries(projectId || null, limit, { kind, actor, query }));
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
          cancelProjectExecution(projectId, 'project_paused', true);
          stopProjectLoop(projectId);
          runtime.state.agents.forEach((agent) => {
            if (!agent.isCoordinator && agent.status === 'running') {
              agent.status = 'idle';
              agent.currentTask = null;
              markAgentLog(agent, 'Paused by project control');
            }
          });
          appendProjectLog(runtime.state, 'message', { kind: 'project_paused' });
          appendMessageBusEntry({ projectId, from: 'coordinator', to: 'all', kind: 'project_paused', payload: {} });
          emitProjectEvent(projectId, 'project_status', { status: 'paused', projectId });
        } else if (action === 'resume') {
          runtime.state.status = 'running';
          appendProjectLog(runtime.state, 'message', { kind: 'project_resumed' });
          appendMessageBusEntry({ projectId, from: 'coordinator', to: 'all', kind: 'project_resumed', payload: {} });
          emitProjectEvent(projectId, 'project_status', { status: 'running', projectId });
          startProjectLoop(projectId);
        } else if (action === 'restart_agents') {
          cancelProjectExecution(projectId, 'restart_agents', true);
          const isFailed    = runtime.state.status === 'failed';
          const isCompleted = runtime.state.status === 'completed';

          if (isCompleted) {
            // Full replay: reset all tasks to backlog
            runtime.state.tasks.forEach((t) => {
              requeueTaskToBacklog(t, 'restart_replay', false);
              t.completedAt = null;
              t.blockedBy = t.dependencies?.[0] || null;
            });
            runtime.state.completedAt = null;
          } else {
            // Reset any stalled inprogress tasks back to backlog
            runtime.state.tasks.forEach((t) => {
              if (t.status === 'inprogress') {
                requeueTaskToBacklog(t, 'restart_agents', false);
              }
            });
          }

          if (isFailed || isCompleted) {
            runtime.state.status = 'running';
            runtime.state.failedAt = null;
            runtime.state.heartbeat.autoFixCount = 0;
            runtime.state.heartbeat.status = 'alive';
            emitProjectEvent(projectId, 'project_status', { status: 'running', projectId });
          }

          runtime.state.agents.forEach((agent) => {
            if (agent.isCoordinator) {
              agent.status = 'running';
            } else {
              agent.status = 'idle';
              agent.currentTask = null;
            }
            markAgentLog(agent, 'Restarted by coordinator control');
          });
          appendProjectLog(runtime.state, 'fix', { kind: 'agents_restarted', from: isFailed ? 'failed' : isCompleted ? 'completed' : 'running' });
          appendMessageBusEntry({ projectId, from: 'coordinator', to: 'all', kind: 'agents_restarted', payload: { from: isFailed ? 'failed' : isCompleted ? 'completed' : 'running' } });
          if (isFailed || isCompleted) startProjectLoop(projectId);
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
      const model = appState.llm.model || (appConfig && appConfig.llm && appConfig.llm.model) || 'connected';
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
      pingLMStudio(appState.llm.endpoint).then((result) => {
        appState.llm.reachable = result.reachable;
        if (result.model) appState.llm.model = result.model;
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

    if (pathname === '/api/notifications/test' && req.method === 'POST') {
      readRequestBody(req).then((body) => {
        let payload = {};
        try {
          payload = parseJsonBodySafe(body);
        } catch (err) {
          writeJson(res, { error: 'Invalid JSON body' }, 400);
          return;
        }
        const projectId = String(payload.projectId || '').trim();
        const runtime = projectId ? projectRuntimes.get(projectId) : null;
        const projectState = runtime ? runtime.state : null;
        const summary = String(payload.summary || 'Coordinator test notification').trim();
        notifyOperator(projectState, summary, {
          test: true,
          requestedBy: 'dashboard',
          projectId: projectId || null,
        }).then((result) => {
          writeJson(res, {
            ok: Boolean(result.ok),
            provider: result.provider,
            reason: result.reason || null,
            notifications: notificationSettingsSummary(),
          }, result.ok ? 200 : 409);
        }).catch((err) => {
          writeJson(res, {
            ok: false,
            provider: null,
            reason: redactSensitive(err.message),
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

if (require.main === module) {
  main().catch((err) => {
    log(`Start failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  executeConnectorPolicy,
  upsertProjectCredentialPolicy,
  recordCredentialSpend,
  getCredentialBudgetSnapshot,
  ensureCredentialStorage,
  assessApprovalRisk,
  connectorRetryPlan,
  connectorExecutionKey,
  connectorMutationExecutionKey,
  isMutatingConnectorOperation,
  markConnectorExecutionRecord,
  makeAnalyticsSnapshot,
  ensureMessageBus,
  appendMessageBusEntry,
  readMessageBusEntries,
  recoverProjectStateAfterRestart,
  evaluateAutoStaffing,
  ensureStaffingState,
  shouldKeepRunningForRecurring,
  SUPPORTED_CREDENTIAL_SERVICES,
};
